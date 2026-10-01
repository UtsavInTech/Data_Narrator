"""Write the story of a table in plain language.

Builds on the ranked insights and adds what a business reader asks first:
how this month compares with last month, what is still unpaid and overdue,
which group moved the most, and who matters most. Every number comes from SQL;
the words are templates, so the story is exact and repeatable.
"""
import datetime as dt
import re

from ..db import q
from .fmt import is_money, money_or_num, noun_for, num, pct, plural
from .profile import by_role

PAID = re.compile(r"^(paid|settled|cleared|closed|received|complete|completed|done)$", re.I)
OPEN = re.compile(r"^(unpaid|pending|part[\s-]*paid|partially[\s-]*paid|due|overdue|outstanding|open|not paid|partial)$", re.I)
PAID_AMOUNT = re.compile(r"paid|received|collected|settled", re.I)
PARTY = re.compile(r"customer|party|client|buyer|dealer|vendor|supplier|account", re.I)


def _d(v) -> dt.date | None:
    if v is None:
        return None
    return v.date() if isinstance(v, dt.datetime) else v


def _day(d: dt.date) -> str:
    return f"{d.day} {d:%b %Y}"


def _month_shift(d: dt.date, months: int) -> dt.date:
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    last = [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return d.replace(year=y, month=m, day=min(d.day, last))


def _main_measure(measures):
    sums = [m for m in measures if m["agg"] == "sum"]
    money = [m for m in sums if is_money(m["name"]) and not PAID_AMOUNT.search(m["name"])]
    return (money or sums or [None])[0]


def _noun(table: str) -> str:
    return noun_for(table).lower()


# ---------------------------------------------------------------- facts

def receivables(con, rel, prof, measures, ref: dt.date) -> dict | None:
    """Unpaid / overdue money, when the table has a payment-status column."""
    status = next(((c["name"], [v for v in c["values"] if PAID.match(v.strip())])
                   for c in by_role(prof, "dimension") if c["subtype"] == "status"), None)
    money = _main_measure(measures)
    if not status or not money:
        return None
    paid_col = next((m for m in by_role(prof, "measure") if PAID_AMOUNT.search(m["name"]) and m["name"] != money["name"]), None)
    due_col = next((c for c in by_role(prof, "time") if re.search(r"due", c["name"], re.I)), None)
    party = next((c for c in prof["columns"] if c["role"] in ("entity", "id") and PARTY.search(c["name"]) and re.search(r"name", c["name"], re.I)), None) \
        or next((c for c in prof["columns"] if c["role"] in ("entity", "id") and PARTY.search(c["name"])), None)

    sname, paid_vals = status
    paid_list = ", ".join("'" + v.replace("'", "''") + "'" for v in paid_vals)
    is_open = f"CAST({q(sname)} AS VARCHAR) NOT IN ({paid_list})"
    bal = f"(coalesce({q(money['name'])}, 0) - coalesce({q(paid_col['name'])}, 0))" if paid_col else f"coalesce({q(money['name'])}, 0)"
    total_open, n_open = con.execute(f"SELECT sum({bal}), count(*) FROM {rel} WHERE {is_open}").fetchone()
    if not n_open or not total_open or total_open <= 0:
        return None
    out = {"status_col": sname, "money": money["name"], "open_total": float(total_open), "open_count": int(n_open),
           "overdue_total": None, "buckets": [], "top": [], "party": party["name"] if party else None}
    if due_col:
        due = f"CAST({q(due_col['name'])} AS DATE)"
        ref_lit = f"DATE '{ref.isoformat()}'"
        rows = con.execute(f"""
            SELECT CASE WHEN date_diff('day', {due}, {ref_lit}) <= 30 THEN 'up to 30 days late'
                        WHEN date_diff('day', {due}, {ref_lit}) <= 60 THEN '31–60 days late'
                        WHEN date_diff('day', {due}, {ref_lit}) <= 90 THEN '61–90 days late' ELSE 'over 90 days late' END AS b,
                   sum({bal}), count(*)
            FROM {rel} WHERE {is_open} AND {due} < {ref_lit} GROUP BY 1""").fetchall()
        order = ["up to 30 days late", "31–60 days late", "61–90 days late", "over 90 days late"]
        got = {b: (float(s or 0), n) for b, s, n in rows}
        out["buckets"] = [{"label": b, "value": got.get(b, (0, 0))[0], "count": got.get(b, (0, 0))[1]} for b in order]
        out["overdue_total"] = sum(b["value"] for b in out["buckets"])
        out["overdue_count"] = sum(b["count"] for b in out["buckets"])
        where_top = f"{is_open} AND {due} < {ref_lit}"
    else:
        where_top = is_open
    if party:
        out["top"] = [{"label": r[0], "value": float(r[1])} for r in con.execute(
            f"SELECT CAST({q(party['name'])} AS VARCHAR), sum({bal}) v FROM {rel} WHERE {where_top} AND {q(party['name'])} IS NOT NULL"
            f" GROUP BY 1 ORDER BY v DESC LIMIT 5").fetchall() if r[1] and r[1] > 0]
    return out


def month_to_date(con, rel, texpr: str, measure: dict | None, ref: dt.date) -> dict | None:
    """This month so far vs the same days of last month."""
    start = ref.replace(day=1)
    if ref.day < 3:
        return None
    prev_start = _month_shift(start, -1)
    prev_end = _month_shift(ref, -1)
    agg = f"sum({q(measure['name'])})" if measure else "count(*)"
    d = f"CAST({texpr} AS DATE)"
    cur, n_cur = con.execute(f"SELECT {agg}, count(*) FROM {rel} WHERE {d} BETWEEN ? AND ?", [start, ref]).fetchone()
    prev, n_prev = con.execute(f"SELECT {agg}, count(*) FROM {rel} WHERE {d} BETWEEN ? AND ?", [prev_start, prev_end]).fetchone()
    if not n_cur or not n_prev:
        return None
    return {"measure": measure["name"] if measure else "Records", "current": float(cur or 0), "previous": float(prev or 0),
            "rows": int(n_cur), "rows_prev": int(n_prev), "from": start, "to": ref,
            "change": (float(cur) - float(prev)) / abs(float(prev)) if prev else None}


def last_two_months(con, rel, texpr: str, measure: dict | None, ref: dt.date) -> dict | None:
    """The last complete month against the month before it."""
    last_end = ref.replace(day=1) - dt.timedelta(days=1)
    last_start = last_end.replace(day=1)
    prev_start = _month_shift(last_start, -1)
    agg = f"sum({q(measure['name'])})" if measure else "count(*)"
    d = f"CAST({texpr} AS DATE)"
    cur, prev = con.execute(f"SELECT {agg} FILTER (WHERE {d} BETWEEN ? AND ?), {agg} FILTER (WHERE {d} BETWEEN ? AND ?) FROM {rel}",
                            [last_start, last_end, prev_start, last_start - dt.timedelta(days=1)]).fetchone()
    if not cur or not prev:
        return None
    return {"measure": measure["name"] if measure else "Records", "month": f"{last_start:%B}", "prev_month": f"{prev_start:%B}",
            "current": float(cur), "previous": float(prev), "change": (float(cur) - float(prev)) / abs(float(prev))}


def movers(con, rel, texpr: str, measure: dict, dims: list[dict], ref: dt.date) -> list[dict]:
    """Per category: who rose / fell most last month against their usual level (the three months before)."""
    last_end = ref.replace(day=1) - dt.timedelta(days=1)
    last_start = last_end.replace(day=1)
    base_start = _month_shift(last_start, -3)
    d = f"CAST({texpr} AS DATE)"
    m = q(measure["name"])
    out = []
    for dim in [x for x in dims if x["unique"] <= 12][:3]:
        rows = con.execute(f"""
            SELECT CAST({q(dim['name'])} AS VARCHAR) g,
                   sum({m}) FILTER (WHERE {d} BETWEEN ? AND ?) cur_v,
                   sum({m}) FILTER (WHERE {d} BETWEEN ? AND ?) / 3.0 base_v
            FROM {rel} WHERE {q(dim['name'])} IS NOT NULL GROUP BY 1""",
                           [last_start, last_end, base_start, last_start - dt.timedelta(days=1)]).fetchall()
        tot = sum(float(r[2] or 0) for r in rows) or 1
        cand = [(g, float(c or 0), float(b)) for g, c, b in rows if b and float(b) > 0.04 * tot]
        if len(cand) < 2:
            continue
        ch = [(g, c, b, (c - b) / b) for g, c, b in cand]
        out.append({"dimension": dim["name"], "measure": measure["name"], "month": f"{last_start:%B}",
                    "base": f"{base_start:%B}–{(last_start - dt.timedelta(days=1)):%B}",
                    "down": min(ch, key=lambda t: t[3]), "up": max(ch, key=lambda t: t[3])})
    return out


# ---------------------------------------------------------------- story

def about(prof: dict, table: str, kpis: list[dict], span: tuple | None, measure: dict | None) -> str:
    """One sentence: what this table holds."""
    rows = prof["row_count"]
    noun = _noun(table) if _noun(table) != "records" else "rows"
    parts = [f"{rows:,} {noun}"]
    if span and span[0] and span[1]:
        parts.append(f"from {_day(span[0])} to {_day(span[1])}")
    groups = []
    for c in prof["columns"]:
        if c["role"] == "id" and c["unique"] < rows * 0.9 and PARTY.search(c["name"]):
            groups.append(f"{c['unique']:,} {plural(c['name'])}")
        elif c["role"] == "entity" and not re.search(r"name|address", c["name"], re.I) and c["unique"] < rows * 0.9:
            groups.append(f"{c['unique']:,} {plural(c['name'])}")
    for c in sorted(by_role(prof, "dimension"), key=lambda c: (c["subtype"] != "geo", c["unique"])):
        if 2 <= c["unique"] <= 60 and len(groups) < 3:
            groups.append(f"{c['unique']} {plural(c['name'])}")
    if groups:
        parts.append("covering " + ", ".join(groups[:3]))
    sentence = " ".join(parts[:2]) + (", " + parts[2] if len(parts) > 2 else "")
    if measure:
        k = next((k for k in kpis if k["label"] == measure["name"]), None)
        if k and k["value"] is not None:
            sentence += f". {measure['name']} adds up to {money_or_num(k['value'], measure['name'])}"
    return sentence + "."


def _sentences(i: dict, n: int = 1) -> str:
    return " ".join([i["summary"], *i.get("details", [])[:n]]).strip()


def build(con, rel: str, prof: dict, table: str, result: dict, measures: list[dict], dims: list[dict], tcol) -> dict:
    from .insights import time_expr  # local import: insights imports this module

    insights = result["insights"]
    main = _main_measure(measures)
    noun = _noun(table)
    span, ref, texpr = None, dt.date.today(), None
    if tcol and tcol["subtype"] != "year":
        texpr = time_expr(tcol)
        lo, hi = con.execute(f"SELECT min({texpr}), max({texpr}) FROM {rel}").fetchone()
        span = (_d(lo), _d(hi))
        if span[1] and (dt.date.today() - span[1]).days > 7:
            ref = span[1]  # historical data: tell the story as of its last day

    months = (span[1] - span[0]).days / 30 if span and span[0] and span[1] else 0
    mtd = month_to_date(con, rel, texpr, main, ref) if texpr and months >= 1 else None
    last2 = last_two_months(con, rel, texpr, main, ref) if texpr and months >= 2 else None
    recv = receivables(con, rel, prof, measures, ref)
    moves = movers(con, rel, texpr, main, dims, ref) if texpr and main and months >= 3 else []
    facts = {"about": about(prof, table, result["kpis"], span, main), "ref_date": ref.isoformat(),
             "main_measure": main["name"] if main else None,
             "month_to_date": mtd, "last_two_months": last2, "receivables": recv, "movers": moves}
    M = lambda v, name: money_or_num(v, name)  # noqa: E731

    # ---- the lead: how the business is doing right now, and what is owed
    lead = []
    if mtd and mtd["change"] is not None:
        mn = mtd["measure"]
        word = "ahead of" if mtd["change"] >= 0 else "behind"
        lead.append(f"So far this month ({mtd['from']:%-d}–{mtd['to']:%-d %b}), {mn} is {M(mtd['current'], mn)} from"
                    f" {mtd['rows']:,} {noun}, {pct(abs(mtd['change']))} {word} the same days last month.")
    elif last2:
        mn = last2["measure"]
        word = "up" if last2["change"] >= 0 else "down"
        lead.append(f"{last2['month']} closed at {M(last2['current'], mn)} of {mn}, {word} {pct(abs(last2['change']))}"
                    f" on {last2['prev_month']}.")
    if recv:
        s = f"{num(recv['open_total'], True)} is still to be collected"
        s += f", and {num(recv['overdue_total'], True)} of it is past the due date." if recv.get("overdue_total") else "."
        lead.append(s)
    if not lead:  # no dates to compare: say what the total is and where most of it comes from
        if main:
            k = next((k for k in result["kpis"] if k["label"] == main["name"]), None)
            if k and k["value"] is not None:
                lead.append(f"{main['name']} adds up to {M(k['value'], main['name'])} across {prof['row_count']:,} {noun}.")
        first = next((i for i in insights if i["type"] == "breakdown" and main and i["facts"].get("measure") == main["name"]), None)
        lead.append(first["summary"] if first else next((i["summary"] for i in insights if i["type"] != "quality"), ""))

    sections = []

    # ---- how it is moving
    trend = next((i for i in insights if i["type"] == "trend" and main and i["facts"].get("measure") == main["name"]), None) \
        or next((i for i in insights if i["type"] == "trend"), None)
    if trend:
        pts = (trend.get("chart") or {}).get("data") or []
        tn = trend["facts"]["measure"]
        paras = []
        if last2 and last2["measure"] == tn:
            word = "more" if last2["change"] >= 0 else "less"
            paras.append(f"{last2['month']}: {M(last2['current'], tn)}, {pct(abs(last2['change']))} {word} than {last2['prev_month']}"
                         f" ({M(last2['previous'], tn)}).")
        if len(pts) >= 3:
            hi = max(pts, key=lambda p: p["value"])
            lo_ = min(pts, key=lambda p: p["value"])
            paras.append(f"Over the {len(pts)} {result.get('grain') or 'period'}s shown, the best was {hi['label']} ({M(hi['value'], tn)})"
                         f" and the weakest {lo_['label']} ({M(lo_['value'], tn)}).")
        paras.append(trend["summary"])
        sections.append({"key": "trend", "heading": "How it's moving", "paragraphs": paras, "insight_id": trend["id"]})

    # ---- where it comes from
    paras = [_sentences(i) for i in insights
             if i["type"] == "breakdown" and (not main or i["facts"].get("measure") == main["name"])][:2]
    if paras:
        sections.append({"key": "where", "heading": "Where it comes from", "paragraphs": paras})

    # ---- what changed last month, by group
    paras = []
    for mv in moves:
        g, c, b, ch = mv["down"]
        gu, cu, bu, chu = mv["up"]
        bits = []
        if chu > 0.08:
            bits.append(f"{gu} did best ({M(cu, mv['measure'])}, {pct(chu)} above the usual {M(bu, mv['measure'])} a month)")
        if ch < -0.08:
            bits.append(f"{g} did worst ({M(c, mv['measure'])}, {pct(abs(ch))} below the usual {M(b, mv['measure'])})")
        if bits:
            paras.append(f"By {mv['dimension']}: " + "; ".join(bits) + ".")
    if paras:
        mv0 = moves[0]
        sections.append({"key": "changes", "heading": f"What changed in {mv0['month']}",
                         "paragraphs": [f"Each group compared with its usual month ({mv0['base']})."] + paras[:3]})

    # ---- who matters most
    top = next((i for i in insights if i["type"] == "top"), None)
    if top:
        sections.append({"key": "who", "heading": "Who matters most", "paragraphs": [_sentences(top)], "insight_id": top["id"]})

    # ---- money to collect
    if recv:
        paras = [f"{num(recv['open_total'], True)} is not yet paid, across {recv['open_count']:,} {noun}."]
        if recv.get("overdue_total"):
            worst = [b for b in recv["buckets"] if b["value"] > 0]
            paras.append(f"{num(recv['overdue_total'], True)} from {recv['overdue_count']:,} {noun} is overdue: "
                         + ", ".join(f"{num(b['value'], True)} {b['label']}" for b in worst) + ".")
        if recv["top"]:
            paras.append(f"Biggest {'overdue' if recv.get('overdue_total') else 'unpaid'} balances: "
                         + ", ".join(f"{t['label']} ({num(t['value'], True)})" for t in recv["top"][:3]) + ".")
        sections.append({"key": "collect", "heading": "Money to collect", "paragraphs": paras})

    # ---- worth checking
    checks = []
    for i in insights:
        if i["type"] == "breakdown" and i["facts"].get("negatives"):
            checks.append(i["details"][-1] if i.get("details") else i["summary"])
        elif i["type"] in ("outlier", "quality"):
            checks.append(i["summary"])
    if checks:
        sections.append({"key": "check", "heading": "Worth checking", "paragraphs": checks[:4]})

    return {"lead": " ".join(lead), "sections": sections, "facts": facts}
