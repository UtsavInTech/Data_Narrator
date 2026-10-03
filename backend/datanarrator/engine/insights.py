"""Generate and rank insights for any profiled table.

Candidates come from the column roles (measure × dimension breakdowns, trends
over time, top entities, correlations, outliers, data quality). Each is
computed in SQL - breakdowns share one GROUPING SETS scan and trends one
GROUP BY - so cost stays near-linear in rows. Each insight is scored by how
surprising/uneven it is, and only the best are shown first.
"""
import datetime as dt
import math
import re

from ..db import fetch_dicts, q
from . import narrate
from .fmt import money_or_num, noun_for, num, pct, plural
from .profile import MEASURE_HINT, by_role

RECORDS = {"name": "Records", "agg": "count"}
_FLAG_VALUES = {"true", "false", "yes", "no", "y", "n", "0", "1", "(blank)"}
MAX_MEASURES, MAX_DIMS, MAX_ENTITIES = 4, 8, 2
# Money columns lead KPIs, rankings and reports.
MONEY = re.compile(r"revenue|sales|amount|amt|value|turnover|gmv|income|profit|total", re.I)
PAID_LIKE = re.compile(r"paid|received|collected|settled", re.I)


# ---------------------------------------------------------------- selection

def agg_sql(m: dict) -> str:
    if m["agg"] == "count":
        return "count(*)"
    return f"{'avg' if m['agg'] == 'avg' else 'sum'}({q(m['name'])})"


def _money_rank(name: str) -> int:
    """Totals first, then other money, then paid/received (they follow the totals)."""
    if PAID_LIKE.search(name):
        return 3
    if re.search(r"total|revenue|sales|turnover|gmv", name, re.I):
        return 0
    if MONEY.search(name):
        return 1
    return 2


def pick_measures(prof) -> list[dict]:
    ms = by_role(prof, "measure")
    ms.sort(key=lambda c: (_money_rank(c["name"]), not MEASURE_HINT.search(c["name"]), c["agg"] != "sum", c["null_pct"]))
    return ms[:MAX_MEASURES]


def pick_dims(prof) -> list[dict]:
    ds = [c for c in by_role(prof, "dimension") if 2 <= c["unique"] <= 60 and c["subtype"] != "status"]
    code_like = re.compile(r"(^|[\s_])(id|sku|code|no|number)$", re.I)  # names read better than codes
    ds.sort(key=lambda c: (c["subtype"] == "code", bool(code_like.search(c["name"])), not (3 <= c["unique"] <= 20),
                           c["subtype"] != "geo", c["null_pct"]))
    return ds[:MAX_DIMS]


def pick_time(prof) -> dict | None:
    ts = [c for c in by_role(prof, "time") if c["subtype"] != "since"]
    ts.sort(key=lambda c: (c["subtype"] == "year", "date" not in c["name"].lower(), c["null_pct"]))
    return ts[0] if ts else None


def time_expr(col: dict) -> str:
    if col["subtype"] == "year":
        return f"make_date(CAST({q(col['name'])} AS INTEGER), 1, 1)"
    return f"CAST({q(col['name'])} AS TIMESTAMP)"


def _label(v, grain: str) -> str:
    if isinstance(v, str):
        v = dt.datetime.fromisoformat(v)
    return {"year": v.strftime("%Y"), "quarter": f"Q{(v.month - 1) // 3 + 1} {v.year}",
            "month": v.strftime("%b %Y"), "week": "Wk of " + v.strftime("%d %b %Y"),
            "day": v.strftime("%d %b %Y")}[grain]


def _grain(con, rel, texpr) -> str | None:
    lo, hi = con.execute(f"SELECT min({texpr}), max({texpr}) FROM {rel}").fetchone()
    if lo is None or hi is None:
        return None
    days = (hi - lo).days
    if days >= 365 * 6:
        return "year"
    if days >= 365 * 3:
        return "quarter"
    if days >= 90:
        return "month"
    if days >= 21:
        return "week"
    return "day" if days >= 3 else None


def _insight(kind, key, title, summary, details, score, chart=None, **facts) -> dict:
    return {"id": f"{kind}:{key}", "type": kind, "title": title, "summary": summary,
            "details": [d for d in details if d],
            "narrative": " ".join([summary, *[d for d in details if d]]).strip(),
            "score": round(max(0.0, min(score, 1.0)), 3), "chart": chart, "facts": facts}


# ---------------------------------------------------------------- generators

def breakdowns(con, rel, measures, dims) -> list[dict]:
    if not dims:
        return []
    sel = ", ".join(f"CAST({q(d['name'])} AS VARCHAR) AS d{i}, GROUPING({q(d['name'])}) AS g{i}"
                    for i, d in enumerate(dims))
    aggs = ", ".join(f"{agg_sql(m)} AS m{j}" for j, m in enumerate(measures))
    sets = ", ".join(f"({q(d['name'])})" for d in dims)
    rows = con.execute(f"SELECT {sel}, {aggs} FROM {rel} GROUP BY GROUPING SETS ({sets})").fetchall()

    groups: dict[int, list] = {i: [] for i in range(len(dims))}
    nd = len(dims)
    for row in rows:
        for i in range(nd):
            if row[2 * i + 1] == 0:
                label = row[2 * i] if row[2 * i] is not None else "(blank)"
                groups[i].append((label, row[2 * nd:]))
                break

    out = []
    for i, d in enumerate(dims):
        dim = d["name"]
        for j, m in enumerate(measures):
            items = [(lbl, float(vals[j])) for lbl, vals in groups[i] if vals[j] is not None]
            items.sort(key=lambda t: t[1], reverse=True)
            k = len(items)
            if k < 2:
                continue
            mname = m["name"]
            num = lambda v, _m=mname: money_or_num(v, _m)  # noqa: E731 - rupees for money columns
            (top, tv), (sec, sv), (bot, bv) = items[0], items[1], items[-1]
            details, negatives, conc, share = [], [], 0.0, None
            if m["agg"] == "avg":
                overall = sum(v for _, v in items) / k
                spread = (tv - bv) / abs(overall) if overall else 0
                summary = f"Average {mname} is highest for {top} ({num(tv)}) and lowest for {bot} ({num(bv)})."
                if spread > 0.1:
                    details.append(f"That gap is {pct(spread)} of the typical value.")
                score = 0.3 + min(0.5, spread * 0.5)
            elif d.get("subtype") == "flag" or {str(l).lower() for l, _ in items} <= _FLAG_VALUES:
                # Yes/no columns: state the split plainly instead of "true leads amount".
                pos_total = sum(v for _, v in items if v > 0) or 1
                share = tv / pos_total
                summary = (f"{pct(share)} of {mname} ({num(tv)}) has {dim} = {top};"
                           f" {pct(sv / pos_total)} ({num(sv)}) has {dim} = {sec}.")
                score = 0.3 + min(0.3, abs(share - 0.5))
            else:
                pos_total = sum(v for _, v in items if v > 0)
                share = tv / pos_total if pos_total > 0 and tv > 0 else None
                conc = (share - 1 / k) / (1 - 1 / k) if share is not None else 0
                negatives = [(lbl, v) for lbl, v in items if v < 0]
                if share is not None:
                    summary = f"{top} leads {mname} with {num(tv)} ({pct(share)} of the total)."
                else:
                    summary = f"{top} has the highest {mname} at {num(tv)}."
                if sv > 0 and tv / sv >= 1.5:
                    details.append(f"That is {tv / sv:.1f}× the next best, {sec}.")
                elif sv > 0:
                    details.append(f"{sec} is close behind at {num(sv)}.")
                if negatives:
                    names = ", ".join(lbl for lbl, _ in negatives[-5:])
                    details.append(f"{len(negatives)} {dim} value(s) are negative overall: {names}"
                                   f" (combined {num(sum(v for _, v in negatives))}).")
                elif k >= 3:
                    details.append(f"{bot} is lowest at {num(bv)}.")
                score = 0.35 + 0.45 * conc + (0.25 if negatives else 0)
            score *= (1, 0.92, 0.85, 0.8)[j] * (0.85 if k > 25 else 1)
            data = [{"label": lbl, "value": v} for lbl, v in items[:12]]
            if k > 12 and m["agg"] != "avg":
                data.append({"label": f"Other ({k - 12})", "value": sum(v for _, v in items[12:])})
            out.append(_insight(
                "breakdown", f"{mname}|{dim}", f"{mname} by {dim}", summary, details, score,
                {"kind": "bar", "x": dim, "y": mname, "data": data},
                measure=mname, dimension=dim, agg=m["agg"], top=top, top_value=tv, top_share=share,
                bottom=bot, bottom_value=bv, categories=k, negatives=[[lbl, v] for lbl, v in negatives]))
    return out


def _as_datetime(v):
    """DuckDB gives dates or timestamps depending on the column; compare them as timestamps."""
    return v if isinstance(v, dt.datetime) else dt.datetime.combine(v, dt.time())


def trends(con, rel, measures, tcol) -> tuple[list[dict], dict, str | None]:
    texpr = time_expr(tcol)
    grain = _grain(con, rel, texpr)
    if not grain:
        return [], {}, None
    aggs = ", ".join(f"{agg_sql(m)} AS m{j}" for j, m in enumerate(measures))
    rows = con.execute(
        f"SELECT date_trunc('{grain}', {texpr}) AS p, count(*) AS n, {aggs} FROM {rel}"
        f" WHERE {texpr} IS NOT NULL GROUP BY 1 ORDER BY 1").fetchall()
    if len(rows) < 3:
        return [], {}, grain
    counts = sorted(r[1] for r in rows)
    median_n = counts[len(counts) // 2]
    # The last period is incomplete if the data stops well before it ends (e.g. data to
    # 27 Sep for a monthly view) or it has far fewer rows than usual.
    last_t = con.execute(f"SELECT max({texpr}) FROM {rel}").fetchone()[0]
    period_days = {"day": 1, "week": 7, "month": 30.44, "quarter": 91.3, "year": 365.25}[grain]
    covered = ((_as_datetime(last_t) - _as_datetime(rows[-1][0])).total_seconds() / 86400 + 1) / period_days
    partial = covered < 0.95 or rows[-1][1] < 0.5 * median_n
    full = rows[:-1] if partial else rows

    out, latest = [], {}
    for j, m in enumerate(measures):
        pts = [(r[0], float(r[2 + j])) for r in full if r[2 + j] is not None]
        if len(pts) < 3:
            continue
        vals = [v for _, v in pts]
        k = max(1, len(vals) // 4)
        first, last = sum(vals[:k]) / k, sum(vals[-k:]) / k
        change = (last - first) / abs(first) if first else None
        (pp, pv), (tp, tv) = max(pts, key=lambda t: t[1]), min(pts, key=lambda t: t[1])
        lp, lv = pts[-1]
        prev = vals[-2]
        step = (lv - prev) / abs(prev) if prev else None
        latest[m["name"]] = {"value": lv, "delta": step, "period": _label(lp, grain)}
        mname, span = m["name"], f"{k} {grain}{'s' if k > 1 else ''}"
        num = lambda v, _m=mname: money_or_num(v, _m)  # noqa: E731
        score_change = 0.0
        if m["agg"] == "count" and (change is None or abs(change) < 0.05):
            continue
        if first <= 0 or last < 0:
            change = None  # % change is meaningless across a zero/negative base
            word = "improved" if last > first else "worsened"
            summary = (f"{mname} {word} from an average of {num(first)} to {num(last)} per {grain}"
                       f" (first {span} vs last {span}).")
            score_change = min(1.0, abs(last - first) / (abs(first) + abs(last) or 1))
        elif change is None:
            summary = f"{mname} over time, by {grain}."
        elif abs(change) < 0.05:
            summary = f"{mname} has stayed about the same: {num(last)} a {grain} recently, {num(first)} at the start."
        elif k == 1:
            word = "higher" if change > 0 else "lower"
            summary = f"{mname} in {_label(pts[-1][0], grain)} was {pct(abs(change))} {word} than in {_label(pts[0][0], grain)}."
        else:
            word = "up" if change > 0 else "down"
            summary = (f"{mname} is {word} {pct(abs(change))}: the last {span} averaged {num(last)} a {grain},"
                       f" against {num(first)} in the first {span}.")
        details = [f"Peak was {_label(pp, grain)} ({num(pv)}); lowest was {_label(tp, grain)} ({num(tv)})."]
        if step is not None:
            details.append(f"Latest {grain}, {_label(lp, grain)}: {num(lv)} ({'+' if step >= 0 else '−'}"
                           f"{pct(abs(step))} vs the {grain} before).")
        if partial:
            details.append(f"{_label(rows[-1][0], grain)} looks incomplete and was left out.")
        moved = abs(change if change is not None else score_change)
        score = 0.25 + min(0.65, moved * 0.8)  # a flat line is rarely the headline
        if m["agg"] == "count":
            score *= 0.8
        data = [{"label": _label(p, grain), "value": v} for p, v in pts]
        out.append(_insight(
            "trend", f"{mname}|{tcol['name']}", f"{mname} over time", summary, details, score,
            {"kind": "line", "x": tcol["name"], "y": mname, "data": data[-120:]},
            measure=mname, grain=grain, change=change, last_step=step, peak=_label(pp, grain),
            latest_period=_label(lp, grain)))
    return out, latest, grain


def top_entities(con, rel, measure, entities) -> list[dict]:
    out = []
    agg = agg_sql(measure)
    for e in entities:
        col = q(e["name"])
        rows = fetch_dicts(con, f"""
            WITH g AS (SELECT CAST({col} AS VARCHAR) AS l, {agg} AS v FROM {rel} WHERE {col} IS NOT NULL GROUP BY 1),
            r AS (SELECT l, v, row_number() OVER (ORDER BY v DESC) AS rn, count(*) OVER () AS cnt,
                         sum(v) OVER () AS tot FROM g)
            SELECT l, v, rn, cnt, tot, sum(CASE WHEN rn <= ceil(cnt * 0.2) THEN v END) OVER () AS top20
            FROM r QUALIFY rn <= 10 ORDER BY rn""")
        if len(rows) < 3 or not rows[0]["tot"] or rows[0]["tot"] <= 0:
            continue
        cnt, tot, top20 = rows[0]["cnt"], rows[0]["tot"], rows[0]["top20"] or 0
        share = top20 / tot
        n20 = math.ceil(cnt * 0.2)
        mname, ename = measure["name"], e["name"]
        num = lambda v, _m=mname: money_or_num(v, _m)  # noqa: E731
        summary = f"The top {n20:,} {plural(ename)} (20% of {cnt:,}) bring in {pct(share)} of {mname}."
        details = [f"Largest: {rows[0]['l']} ({num(rows[0]['v'])}), then {rows[1]['l']} and {rows[2]['l']}."]
        out.append(_insight(
            "top", f"{mname}|{ename}", f"Top {ename} by {mname}", summary, details,
            0.3 + max(0.0, share - 0.4),
            {"kind": "bar", "x": ename, "y": mname, "data": [{"label": r["l"], "value": r["v"]} for r in rows]},
            measure=mname, entity=ename, top20_share=share, count=cnt, leader=rows[0]["l"]))
    return out


def correlations(con, rel, measures) -> list[dict]:
    ms = [m for m in measures if m["agg"] != "count"]
    pairs = [(a, b) for i, a in enumerate(ms) for b in ms[i + 1:]]
    if not pairs:
        return []
    def within(m):  # ignore extreme outliers so one bad reading can't hide a real relationship
        if m.get("q25") is None or m.get("q75") is None or m["q75"] <= m["q25"]:
            return "TRUE"
        iqr = m["q75"] - m["q25"]
        return f"{q(m['name'])} BETWEEN {m['q25'] - 3 * iqr} AND {m['q75'] + 3 * iqr}"

    exprs = ", ".join(f"corr({q(a['name'])}, {q(b['name'])}) FILTER (WHERE {within(a)} AND {within(b)})"
                      for a, b in pairs)
    rs = con.execute(f"SELECT {exprs} FROM (SELECT * FROM {rel} LIMIT 2000000)").fetchone()
    out = []
    for (a, b), r in zip(pairs, rs):
        if r is None or math.isnan(r) or abs(r) < 0.6:
            continue
        an, bn = q(a["name"]), q(b["name"])
        pts = con.execute(f"SELECT {an}, {bn} FROM (SELECT {an}, {bn} FROM {rel} WHERE {within(a)}"
                          f" AND {within(b)} LIMIT 200000) USING SAMPLE 300 ROWS").fetchall()
        rel_word = "rise and fall together" if r > 0 else "move in opposite directions"
        out.append(_insight(
            "correlation", f"{a['name']}|{b['name']}", f"{a['name']} vs {b['name']}",
            f"{a['name']} and {b['name']} {rel_word} (correlation {r:.2f}).",
            ["When one changes, expect the other to follow." if r > 0 else
             "Higher values of one usually come with lower values of the other."],
            0.3 + 0.3 * (abs(r) - 0.6) / 0.4,
            {"kind": "scatter", "x": a["name"], "y": b["name"],
             "data": [{"x": float(x), "y": float(y)} for x, y in pts]},
            measures=[a["name"], b["name"]], r=r))
    return out


def outliers(con, rel, prof, measures) -> list[dict]:
    ms = [m for m in measures if m["agg"] != "count" and m.get("q25") is not None and m.get("q75") is not None]
    bounds = []
    for m in ms:
        iqr = m["q75"] - m["q25"]
        if iqr > 0:
            bounds.append((m, m["q25"] - 3 * iqr, m["q75"] + 3 * iqr))
    if not bounds:
        return []
    exprs = ", ".join(f"count(*) FILTER (WHERE {q(m['name'])} > {hi}), count(*) FILTER (WHERE {q(m['name'])} < {lo})"
                      for m, lo, hi in bounds)
    counts = con.execute(f"SELECT count(*), {exprs} FROM {rel}").fetchone()
    total = counts[0] or 1
    label_col = next((c for c in prof["columns"] if c["role"] in ("id", "entity")), None)
    out = []
    for idx, (m, lo, hi) in enumerate(bounds):
        n_hi, n_lo = counts[1 + 2 * idx], counts[2 + 2 * idx]
        n = n_hi + n_lo
        if n == 0 or n / total > 0.02:
            continue
        mq = q(m["name"])
        lbl = f"CAST({q(label_col['name'])} AS VARCHAR)" if label_col else "'row'"
        rows = con.execute(f"SELECT {lbl}, {mq} FROM {rel} WHERE {mq} > {hi} OR {mq} < {lo}"
                           f" ORDER BY abs({mq} - {m['q50'] or 0}) DESC LIMIT 8").fetchall()
        side = "high" if n_hi >= n_lo else "low"
        num = lambda v, _m=m["name"]: money_or_num(v, _m)  # noqa: E731
        summary = f"{n:,} row(s) have unusually {side} {m['name']}."
        details = [f"Half of all values sit between {num(m['q25'])} and {num(m['q75'])};"
                   f" these are beyond {num(hi if side == 'high' else lo)}.",
                   "Check them for data-entry errors or one-off events."]
        out.append(_insight(
            "outlier", m["name"], f"Unusual {m['name']} values", summary, details,
            0.3 + (0.1 if n / total < 0.005 else 0),
            {"kind": "bar", "x": label_col["name"] if label_col else "Row", "y": m["name"],
             "data": [{"label": str(r[0]), "value": float(r[1])} for r in rows]},
            measure=m["name"], count=n, side=side))
    return out


def duplicate_ids(con, rel, prof) -> list[dict]:
    """An ID that should be unique (invoice number, order ID) but appears more than once."""
    out = []
    for c in prof["columns"]:
        nonnull = prof["sample_rows"] * (1 - c["null_pct"] / 100)
        if c["role"] != "id" or not nonnull or c["unique"] / nonnull < 0.97:
            continue
        col = q(c["name"])
        rows = con.execute(f"SELECT CAST({col} AS VARCHAR), count(*) n FROM {rel} WHERE {col} IS NOT NULL"
                           f" GROUP BY 1 HAVING count(*) > 1 ORDER BY n DESC, 1 LIMIT 5").fetchall()
        if not rows:
            continue
        total = con.execute(f"SELECT count(*) FROM (SELECT {col} FROM {rel} WHERE {col} IS NOT NULL"
                            f" GROUP BY 1 HAVING count(*) > 1)").fetchone()[0]
        ex = ", ".join(r[0] for r in rows[:3])
        times = {2: "twice", 3: "three times"}.get(rows[0][1], f"{rows[0][1]} times")
        text = (f"{c['name']} {rows[0][0]} appears {times}." if total == 1
                else f"{total:,} {plural(c['name'])} appear more than once, for example {ex}.")
        out.append(_insight(
            "quality", f"dupid|{c['name']}", f"Repeated {c['name']}", text,
            ["Each should be unique, so totals may be counted twice."],
            0.42, None, column=c["name"], count=total, examples=[r[0] for r in rows]))
    return out


def quality(prof) -> list[dict]:
    out = []
    for c in prof["columns"]:
        if c["role"] not in ("empty", "constant") and c["null_pct"] >= 20:
            out.append(_insight(
                "quality", f"missing|{c['name']}", f"Missing {c['name']}",
                f"{c['null_pct']:.0f}% of {c['name']} values are empty.",
                ["Results that use this column may be incomplete."],
                0.15 + min(0.25, c["null_pct"] / 400), None, column=c["name"], null_pct=c["null_pct"]))
    for c in prof["columns"]:
        n = c.get("null_count")
        if c["role"] in ("measure", "id", "dimension", "time", "entity") and n and 0 < c["null_pct"] < 5:
            out.append(_insight(
                "quality", f"gaps|{c['name']}", f"Missing {c['name']}",
                f"{n:,} record{'s have' if n > 1 else ' has'} no {c['name']}.",
                ["Every other record has one, so these were probably skipped by mistake."],
                0.32, None, column=c["name"], null_count=n))
    if prof.get("duplicate_rows"):
        d = prof["duplicate_rows"]
        out.append(_insight("quality", "duplicates", "Duplicate rows",
                            f"{d:,} row(s) are exact duplicates of another row.",
                            ["They may double-count totals."], 0.3, None, count=d))
    return out


# ---------------------------------------------------------------- entry point

def generate(con, rel: str, prof: dict, table: str = "") -> dict:
    global RECORDS
    noun = noun_for(table)
    RECORDS = {"name": noun, "agg": "count"}
    measures = pick_measures(prof)
    dims = pick_dims(prof)
    tcol = pick_time(prof)
    entities = [c for c in by_role(prof, "entity")][:MAX_ENTITIES]
    with_records = measures + [RECORDS] if len(measures) < MAX_MEASURES else measures

    kpi_ms = [RECORDS] + measures
    vals = con.execute(f"SELECT {', '.join(agg_sql(m) for m in kpi_ms)} FROM {rel}").fetchone()

    insights = []
    trend_items, latest, grain = trends(con, rel, with_records, tcol) if tcol else ([], {}, None)
    insights += trend_items
    insights += breakdowns(con, rel, measures or [RECORDS], dims)
    lead = next((m for m in measures if m["agg"] == "sum"), RECORDS)
    insights += top_entities(con, rel, lead, entities)
    insights += correlations(con, rel, measures)
    insights += outliers(con, rel, prof, measures)
    dup_ids = duplicate_ids(con, rel, prof)
    insights += dup_ids
    insights += [i for i in quality(prof) if not (dup_ids and i["id"] == "quality:duplicates")]
    insights.sort(key=lambda i: i["score"], reverse=True)

    kpis = []
    for m, v in zip(kpi_ms, vals):
        lt = latest.get(m["name"], {})
        kpis.append({"label": m["name"], "value": float(v) if v is not None else None, "display": money_or_num(v, m["name"]),
                     "agg": {"count": "Count", "avg": "Average", "sum": "Total"}[m["agg"]],
                     "delta": lt.get("delta"), "period": lt.get("period")})

    result = {"kpis": kpis, "insights": insights, "grain": grain, "time_column": tcol["name"] if tcol else None,
              "generated_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    story = narrate.build(con, rel, prof, table, result, measures, dims, tcol)
    insights += _story_insights(story["facts"])
    insights.sort(key=lambda i: i["score"], reverse=True)
    result.update({"story": story, "about": story["facts"]["about"], "headline": story["lead"],
                   "month_to_date": story["facts"]["month_to_date"]})
    return result


def _story_insights(f: dict) -> list[dict]:
    """Money to collect and biggest movers, as insights of their own."""
    out = []
    r = f.get("receivables")
    if r:
        summary = f"{money_or_num(r['open_total'], 'amount')} is still to be collected"
        details = []
        if r.get("overdue_total"):
            summary += f"; {money_or_num(r['overdue_total'], 'amount')} is overdue."
            details.append(f"That is {r['overdue_count']:,} records past their due date.")
        else:
            summary += "."
        if r["top"]:
            details.append("Largest: " + ", ".join(f"{t['label']} ({money_or_num(t['value'], 'amount')})" for t in r["top"][:3]) + ".")
        chart = {"kind": "bar", "x": "Overdue by", "y": r["money"], "data": [{"label": b["label"], "value": b["value"]} for b in r["buckets"]]} \
            if r.get("buckets") else {"kind": "bar", "x": r["party"] or "", "y": r["money"], "data": r["top"]}
        out.append(_insight("collect", r["money"], "Money to collect", summary, details, 0.9, chart,
                            measure=r["money"], open_total=r["open_total"], overdue_total=r.get("overdue_total"),
                            overdue_count=r.get("overdue_count"), top=r["top"], party=r["party"]))
    for mv in f.get("movers") or []:
        g, c, b, ch = mv["down"]
        gu, cu, bu, chu = mv["up"]
        if ch > -0.1 and chu < 0.1:
            continue
        down_leads = abs(ch) >= chu
        name, cur, base, change = (g, c, b, ch) if down_leads else (gu, cu, bu, chu)
        summary = (f"{name} brought in {money_or_num(cur, mv['measure'])} in {mv['month']}, {pct(abs(change))}"
                   f" {'below' if change < 0 else 'above'} the usual {money_or_num(base, mv['measure'])} a month.")
        other = (gu, chu) if down_leads else (g, ch)
        details = [f"That is the biggest {'drop' if change < 0 else 'rise'} of any {mv['dimension']}."]
        if abs(other[1]) > 0.08:
            details.append(f"{other[0]} is {pct(abs(other[1]))} {'above' if other[1] > 0 else 'below'} the usual level.")
        out.append(_insight("mover", f"{mv['dimension']}|{mv['measure']}", f"Biggest change by {mv['dimension']}", summary, details,
                            0.5 + min(0.35, abs(change) * 0.7),
                            {"kind": "bar", "x": mv["dimension"], "y": "% vs usual", "data": [
                                {"label": g, "value": round(ch * 100, 1)}, {"label": gu, "value": round(chu * 100, 1)}]},
                            measure=mv["measure"], dimension=mv["dimension"], group=name, change=change, month=mv["month"]))
    for x in f.get("drifts") or []:
        word = "fell" if x["current"] < x["usual"] else "rose"
        summary = (f"{x['measure']} at {x['group']} {word} to {num(x['current'])} in {x['month']},"
                   f" from its usual {num(x['usual'])}.")
        details = [f"Other {plural(x['dimension']).lower()} held steady over the same months ({x['base']})."]
        out.append(_insight("drift", f"{x['dimension']}|{x['measure']}|{x['group']}", f"{x['measure']} at {x['group']}",
                            summary, details, 0.75 + min(0.2, abs(x["change"] or 0)),
                            {"kind": "bar", "x": x["dimension"], "y": x["measure"], "data": [
                                {"label": f"{x['group']} ({x['base']})", "value": round(x["usual"], 2)},
                                {"label": f"{x['group']} ({x['month']})", "value": round(x["current"], 2)}]},
                            measure=x["measure"], dimension=x["dimension"], group=x["group"], change=x["change"],
                            current=x["current"], usual=x["usual"], month=x["month"]))
    return out
