"""The morning brief: the whole business in one short message, sent before the day starts.

The owner shouldn't have to open anything. Each morning the brief goes out by
email and/or WhatsApp: yesterday's numbers for each area of the business, what
to act on today, and who hasn't sent their figures. The same content is the
top of the Overview page.

Channels, set with environment variables:
  email      DN_SMTP_HOST, DN_SMTP_PORT (587), DN_SMTP_USER, DN_SMTP_PASSWORD, DN_SMTP_FROM
  whatsapp   DN_WHATSAPP_TOKEN, DN_WHATSAPP_PHONE_ID (Meta WhatsApp Cloud API)
Without them, the app still shows the brief and offers a "share on WhatsApp" link.
"""
import datetime as dt
import html
import json
import logging
import os
import re
import smtplib
import urllib.request
from email.message import EmailMessage

from . import catalog, config, demos
from .engine.fmt import money_or_num, pct
from .mis import reports

log = logging.getLogger("datanarrator.brief")

SCHEMA = """
CREATE TABLE IF NOT EXISTS briefs (
    workspace TEXT PRIMARY KEY,
    at_time TEXT NOT NULL,          -- HH:MM, server local time
    emails TEXT NOT NULL DEFAULT '',
    phones TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 0,
    last_run TEXT
);
"""
SITE = re.compile(r"centre|center|branch|depot|plant|store|outlet|site|warehouse|unit|route|shop|godown|location", re.I)
ORDER = ["collect", "drift", "decline", "recent-drop", "loss", "quality", "mover", "concentration", "pareto",
         "flag", "outlier"]


def init():
    with catalog._lock, catalog._conn() as con:
        con.executescript(SCHEMA)


# ---------------------------------------------------------------- what the business looks like

def _status(actions: list[dict]) -> str:
    if any(a["priority"] == "high" for a in actions):
        return "act"
    if any(a["priority"] == "medium" for a in actions):
        return "watch"
    return "fine"


def areas(workspace: str) -> dict:
    """One entry per area of activity (sales, collections, production...) and the most urgent things to do."""
    ready = [d for d in catalog.list_for(workspace) if d["status"] == "ready" and d["kind"] != "import"]
    # A table and its combined view tell the same story; keep the combined one (it has names, not codes).
    combined = {d["meta"].get("fact_name") for d in ready if d["kind"] == "model"}
    out, todo = [], []
    for d in ready:
        if d["kind"] == "table" and d["name"] in combined:
            continue
        res = catalog.load_json(d["id"], "insights")
        if not res or not res.get("time_column") or "story" not in res:
            continue  # lists of customers or products, or analysed by an older version
        main = res["story"]["facts"].get("main_measure")
        kpi = next((k for k in res["kpis"] if k["label"] == main), None) or res["kpis"][0]
        actions = res.get("actions", [])
        trend = next((i for i in res["insights"] if i["type"] == "trend" and i["facts"].get("measure") == kpi["label"]), None)
        name = (d["meta"].get("fact_name") if d["kind"] == "model" else None) or d["name"]
        out.append({"id": d["id"], "name": name, "lead": res["story"]["lead"], "kpi": kpi,
                    "urgent": sum(a["priority"] == "high" for a in actions), "status": _status(actions),
                    "spark": [p.get("value") for p in ((trend or {}).get("chart") or {}).get("data", [])][-12:],
                    "importance": (d.get("meta") or {}).get("importance", 0), "_ds": d})
        todo += [{**a, "dataset_id": d["id"], "dataset": name} for a in actions if a["priority"] != "low"]
    out.sort(key=lambda a: -a["importance"])
    rank = {"high": 0, "medium": 1}
    todo.sort(key=lambda a: (rank[a["priority"]], ORDER.index(a["category"]) if a["category"] in ORDER else len(ORDER)))
    seen, unique = set(), []
    for a in todo:  # the same duplicate invoice shows up in a table and its combined view
        key = "collect" if a["category"] == "collect" else a["title"]  # one "money owed" is enough
        if key not in seen:
            seen.add(key)
            unique.append(a)
    return {"areas": out, "actions": unique}


# ---------------------------------------------------------------- the brief

def _fmt(v, name, kind):
    if v is None:
        return "–"
    return f"{v:.2f}".rstrip("0").rstrip(".") if kind == "avg" else money_or_num(v, name)


def compose(workspace: str, company: str, day: dt.date | None = None, link: str = "") -> dict:
    """Yesterday, area by area, and what to act on today. Returns structured parts plus WhatsApp text and email HTML."""
    day = day or dt.date.today() - dt.timedelta(days=1)
    biz = areas(workspace)
    lines, missing = [], []
    for a in biz["areas"]:
        try:
            rep = reports.compute(a["_ds"], day, "brief")
        except Exception:
            log.exception("brief: could not read %s", a["name"])
            continue
        count, *rest = rep["metrics"]
        if not count["today"]:
            last = dt.date.fromisoformat(rep["previous_day"]) if rep["previous_day"] else None
            if last and (day - last).days <= 7:  # active area that went quiet: worth saying
                lines.append({"area": a["name"], "status": a["status"], "quiet": True, "figures": []})
            continue
        main = next((m for m in rest if m["label"] == a["kpi"]["label"]), None) or (rest[0] if rest else count)
        second = next((m for m in rest if m is not main and m["kind"] == "sum"), None)
        figs = [main] + ([second] if second else [])
        lines.append({"area": a["name"], "status": a["status"], "quiet": False, "figures": [
            {"label": m["label"], "value": _fmt(m["today"], m["label"], m["kind"]), "change": m["change"],
             "month": _fmt(m["month_to_date"], m["label"], m["kind"]) if m["month_to_date"] is not None else None}
            for m in figs], "records": int(count["today"])})
        for c in rep["checks"]:
            # Only places that are expected to report every day (a centre, branch, depot), not cities with no sales.
            if c["problem"].startswith("Sent nothing") and SITE.search(c["column"]):
                missing.append(f"{a['name']} from {c['column'].lower()}: {c['problem'].split(': ', 1)[1]}")
    todo = [{"title": t["title"], "detail": t["detail"], "area": t["dataset"], "priority": t["priority"]}
            for t in biz["actions"][:3]]
    brief = {"company": company or "Your business", "day": day.isoformat(), "areas": lines, "actions": todo,
             "missing": missing, "link": link}
    brief["text"] = _whatsapp(brief)
    brief["html"] = _email(brief)
    brief["subject"] = f"{brief['company']}: morning brief for {day:%-d %b}"
    return brief


def _change(ch) -> str:
    return "" if ch is None else f" ({'▲' if ch >= 0 else '▼'} {pct(abs(ch))} vs day before)"


def _whatsapp(b: dict) -> str:
    """Plain text with WhatsApp's *bold*; reads well in any chat or SMS too."""
    day = dt.date.fromisoformat(b["day"])
    out = [f"*{b['company']} · Morning brief*", f"Yesterday, {day:%A %-d %B}", ""]
    for a in b["areas"]:
        if a["quiet"]:
            out.append(f"• *{a['area']}*: nothing recorded")
            continue
        f0 = a["figures"][0]
        s = f"• *{a['area']}*: {f0['label']} {f0['value']}{_change(f0['change'])}"
        if f0["month"]:
            s += f". Month so far {f0['month']}"
        out.append(s)
    if b["actions"]:
        out += ["", "*Act on today*"]
        out += [f"{i}. {t['title']} ({t['area']}). {t['detail']}" for i, t in enumerate(b["actions"], 1)]
    if b["missing"]:
        out += ["", "*Quiet yesterday*"] + [f"• {m}" for m in b["missing"][:4]]
    if not b["areas"] and not b["actions"]:
        out.append("No activity recorded yesterday.")
    if b["link"]:
        out += ["", f"Full story: {b['link']}"]
    return "\n".join(out)


def _email(b: dict) -> str:
    e = html.escape
    day = dt.date.fromisoformat(b["day"])
    dot = {"act": "#c2412d", "watch": "#b7791f", "fine": "#1f7a4d"}
    rows = []
    for a in b["areas"]:
        if a["quiet"]:
            fig = '<span style="color:#7a776f">nothing recorded</span>'
        else:
            f0 = a["figures"][0]
            up = (f0["change"] or 0) >= 0
            ch = "" if f0["change"] is None else (f'<span style="color:{"#1f7a4d" if up else "#c2412d"};font-size:13px">'
                                                 f'{"▲" if up else "▼"} {e(pct(abs(f0["change"])))}</span>')
            month = f'<div style="color:#7a776f;font-size:13px">Month so far {e(f0["month"])}</div>' if f0["month"] else ""
            fig = f'<b style="font-size:18px">{e(f0["value"])}</b> <span style="color:#7a776f">{e(f0["label"])}</span> {ch}{month}'
        rows.append(f'<tr><td style="padding:12px 0;border-bottom:1px solid #e6e3dc;vertical-align:top;width:34%">'
                    f'<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:{dot[a["status"]]};margin-right:8px"></span>'
                    f'{e(a["area"])}</td><td style="padding:12px 0;border-bottom:1px solid #e6e3dc">{fig}</td></tr>')
    acts = "".join(f'<li style="margin:0 0 10px"><b>{e(t["title"])}</b> <span style="color:#7a776f">· {e(t["area"])}</span>'
                   f'<br><span style="color:#44423e">{e(t["detail"])}</span></li>' for t in b["actions"])
    missing = "".join(f"<li>{e(m)}</li>" for m in b["missing"][:4])
    link = f'<p><a href="{e(b["link"])}" style="color:#1c1b19">Read the full story →</a></p>' if b["link"] else ""
    return f"""<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c1b19">
<div style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7a776f">{e(b['company'])} · Morning brief</div>
<h1 style="font-weight:normal;font-size:26px;margin:6px 0 18px">Yesterday, {day:%A %-d %B}</h1>
<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:15px">{''.join(rows)}</table>
{f'<h2 style="font-size:18px;margin:26px 0 10px">Act on today</h2><ol style="font-family:Arial,sans-serif;font-size:15px;padding-left:20px">{acts}</ol>' if acts else ''}
{f'<h2 style="font-size:18px;margin:22px 0 8px">Quiet yesterday</h2><ul style="font-family:Arial,sans-serif;font-size:14px;color:#44423e">{missing}</ul>' if missing else ''}
<div style="font-family:Arial,sans-serif;font-size:14px">{link}</div>
</div>"""


# ---------------------------------------------------------------- settings and sending

def channels() -> dict:
    return {"email": bool(os.environ.get("DN_SMTP_HOST")),
            "whatsapp": bool(os.environ.get("DN_WHATSAPP_TOKEN") and os.environ.get("DN_WHATSAPP_PHONE_ID"))}


def get(workspace: str) -> dict:
    with catalog._conn() as con:
        r = con.execute("SELECT * FROM briefs WHERE workspace=?", (workspace,)).fetchone()
    s = dict(r) if r else {"workspace": workspace, "at_time": "07:00", "emails": "", "phones": "", "enabled": 0, "last_run": None}
    return {**s, "enabled": bool(s["enabled"]), "channels": channels()}


def put(workspace: str, at_time: str, emails: str, phones: str, enabled: bool) -> dict:
    with catalog._lock, catalog._conn() as con:
        con.execute("INSERT INTO briefs (workspace, at_time, emails, phones, enabled) VALUES (?,?,?,?,?)"
                    " ON CONFLICT(workspace) DO UPDATE SET at_time=excluded.at_time, emails=excluded.emails,"
                    " phones=excluded.phones, enabled=excluded.enabled",
                    (workspace, at_time, emails.strip(), phones.strip(), int(enabled)))
    return get(workspace)


def _split(s: str) -> list[str]:
    return [x.strip() for x in s.replace(";", ",").replace("\n", ",").split(",") if x.strip()]


def _send_email(to: list[str], subject: str, text: str, body_html: str):
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, os.environ.get("DN_SMTP_FROM", os.environ.get("DN_SMTP_USER", "")), ", ".join(to)
    msg.set_content(text.replace("*", ""))
    msg.add_alternative(body_html, subtype="html")
    with smtplib.SMTP(os.environ["DN_SMTP_HOST"], int(os.environ.get("DN_SMTP_PORT", 587)), timeout=30) as s:
        s.starttls()
        if os.environ.get("DN_SMTP_USER"):
            s.login(os.environ["DN_SMTP_USER"], os.environ.get("DN_SMTP_PASSWORD", ""))
        s.send_message(msg)


def _send_whatsapp(phone: str, text: str):
    """Meta's Cloud API. Outside a 24-hour chat window, WhatsApp only delivers pre-approved templates."""
    url = f"https://graph.facebook.com/v20.0/{os.environ['DN_WHATSAPP_PHONE_ID']}/messages"
    body = json.dumps({"messaging_product": "whatsapp", "to": phone.lstrip("+").replace(" ", ""), "type": "text",
                       "text": {"body": text[:4000]}}).encode()
    req = urllib.request.Request(url, body, {"Authorization": f"Bearer {os.environ['DN_WHATSAPP_TOKEN']}",
                                             "Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=30).read()


def send(workspace: str, company: str, link: str = "") -> dict:
    """Send the brief to everyone on the list. Returns what happened per recipient."""
    demos.guard(workspace, "Sending the brief")
    s, ch = get(workspace), channels()
    b = compose(workspace, company, link=link)
    results = []
    emails, phones = _split(s["emails"]), _split(s["phones"])
    if emails:
        if not ch["email"]:
            results.append({"to": ", ".join(emails), "ok": False, "error": "Email isn't set up on this server (DN_SMTP_HOST)"})
        else:
            try:
                _send_email(emails, b["subject"], b["text"], b["html"])
                results.append({"to": ", ".join(emails), "ok": True})
            except Exception as e:
                results.append({"to": ", ".join(emails), "ok": False, "error": str(e)})
    for p in phones:
        if not ch["whatsapp"]:
            results.append({"to": p, "ok": False, "error": "WhatsApp isn't set up on this server (DN_WHATSAPP_TOKEN)"})
            continue
        try:
            _send_whatsapp(p, b["text"])
            results.append({"to": p, "ok": True})
        except Exception as e:
            results.append({"to": p, "ok": False, "error": str(e)})
    if not results:
        results.append({"to": "", "ok": False, "error": "Add at least one email address or WhatsApp number"})
    return {"results": results, "brief": {k: b[k] for k in ("subject", "text")}}


def run_due(now: dt.datetime | None = None, link: str = ""):
    """Called every minute by the scheduler."""
    now = now or dt.datetime.now()
    with catalog._conn() as con:
        due = [dict(r) for r in con.execute("SELECT * FROM briefs WHERE enabled=1").fetchall()]
    for s in due:
        if s["last_run"] == now.date().isoformat() or now.strftime("%H:%M") < s["at_time"] or demos.is_demo(s["workspace"]):
            continue
        try:
            res = send(s["workspace"], config.COMPANY_NAME, link or config.PUBLIC_URL)
            log.info("morning brief for %s: %s", s["workspace"], res["results"])
        except Exception:
            log.exception("morning brief failed for %s", s["workspace"])
        with catalog._lock, catalog._conn() as con:
            con.execute("UPDATE briefs SET last_run=? WHERE workspace=?", (now.date().isoformat(), s["workspace"]))
