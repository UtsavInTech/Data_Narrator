"""Turn insights into a prioritised 'What to do' list. Rule-based and explainable."""
import re
from .fmt import money_or_num, pct, plural

PAID = re.compile(r"paid|received|collected|settled", re.I)
_ORDER = {"high": 0, "medium": 1, "low": 2}


def _action(priority, title, detail, insight, category) -> dict:
    return {"id": f"act:{insight['id']}:{category}", "priority": priority, "title": title,
            "detail": detail, "insight_id": insight["id"], "category": category}


def recommend(insights: list[dict], main_measure: str | None = None) -> list[dict]:
    out, seen_trend = [], False
    # Group comparisons: only for the lead number, so one finding does not become three actions.
    lead = main_measure or next((i["facts"]["measure"] for i in insights if i["type"] == "breakdown"), None)
    main_ok = lambda f: f.get("measure") == lead or bool(f.get("negatives"))  # noqa: E731
    for ins in insights:
        f, kind = ins["facts"], ins["type"]
        if kind == "breakdown" and f.get("negatives"):
            names = ", ".join(n for n, _ in f["negatives"][:4])
            loss = sum(v for _, v in f["negatives"])
            out.append(_action("high", f"Fix negative {f['measure']} in {names}",
                               f"These {f['dimension']} values add up to {money_or_num(loss, f['measure'])} {f['measure']}. Review pricing,"
                               " discounts and costs there first.", ins, "loss"))
        elif kind == "breakdown" and f["categories"] <= 3 and f.get("agg") != "avg" and f["top"].lower() in ("true", "yes", "y", "1"):
            out.append(_action("medium", f"Follow up where {f['dimension']} = {f['bottom']}",
                               f"{money_or_num(f['bottom_value'], f['measure'])} {f['measure']} has {f['dimension']} = {f['bottom']}.",
                               ins, "flag"))
        elif kind == "breakdown" and not main_ok(f):
            continue
        elif kind == "breakdown" and f.get("agg") == "sum" and (f.get("top_share") or 0) >= 0.6 and f["categories"] >= 3:
            out.append(_action("medium", f"Reduce dependence on {f['top']}",
                               f"{f['top']} makes up {pct(f['top_share'])} of {f['measure']}. A problem there would hit"
                               " the whole business.", ins, "concentration"))
        elif kind == "breakdown" and f.get("agg") == "sum" and f["categories"] >= 3 and 0 < f.get("bottom_value", 0) < 0.5 * f["top_value"]:
            out.append(_action("low", f"Look into {f['bottom']} ({f['dimension']})",
                               f"It has the lowest {f['measure']} ({money_or_num(f['bottom_value'], f['measure'])}) vs {money_or_num(f['top_value'], f['measure'])}"
                               f" for {f['top']}. Decide whether to grow it or drop it.", ins, "laggard"))
        elif kind == "trend" and f.get("change") is not None and not seen_trend and not PAID.search(f["measure"]):
            seen_trend = True
            ch = f["change"]
            if ch <= -0.1 and (f.get("last_step") is None or f["last_step"] < 0):
                out.append(_action("high", f"Investigate the drop in {f['measure']}",
                                   f"{f['measure']} fell {pct(abs(ch))} over the period. Compare the best period"
                                   f" ({f['peak']}) with recent ones to find what changed.", ins, "decline"))
            elif ch >= 0.1:
                out.append(_action("low", f"Keep the momentum in {f['measure']}",
                                   f"{f['measure']} grew {pct(ch)}. Find what drove it and do more of it.", ins, "growth"))
            if f.get("last_step") is not None and f["last_step"] <= -0.2 and ch > -0.1:
                out.append(_action("high", f"{f['measure']} dropped sharply in {f['latest_period']}",
                                   f"Down {pct(abs(f['last_step']))} vs the {f['grain']} before.", ins, "recent-drop"))
        elif kind == "top" and f.get("top20_share", 0) >= 0.6:
            out.append(_action("medium", f"Look after your top {plural(f['entity'])}",
                               f"20% of {plural(f['entity'])} bring in {pct(f['top20_share'])} of {f['measure']}, led by"
                               f" {f['leader']}. Losing a few of them would hurt.", ins, "pareto"))
        elif kind == "collect" and f.get("overdue_total"):
            who = ", ".join(t["label"] for t in f["top"][:3])
            out.append(_action("high", f"Follow up {money_or_num(f['overdue_total'], 'amount')} overdue",
                               f"{f['overdue_count']:,} are past their due date." + (f" Start with {who}." if who else ""),
                               ins, "collect"))
        elif kind == "mover" and f["change"] <= -0.15:
            out.append(_action("medium", f"Find out why {f['group']} fell {pct(abs(f['change']))}",
                               f"{f['measure']} from {f['group']} dropped in {f['month']}, more than any other {f['dimension']}.",
                               ins, "mover"))
        elif kind == "outlier":
            out.append(_action("medium", f"Review {f['count']:,} unusual {f['measure']} value(s)",
                               "They may be data-entry errors, fraud, or real one-offs worth understanding.", ins, "outlier"))
        elif kind == "quality" and f.get("null_pct"):
            out.append(_action("low", f"Fill in missing {f['column']}",
                               f"{f['null_pct']:.0f}% of rows have no {f['column']}. Fix it where the data is entered.",
                               ins, "quality"))
        elif kind == "quality" and f.get("examples"):
            out.append(_action("high", f"Fix repeated {f['column']}",
                               f"{', '.join(f['examples'][:3])} {'appears' if len(f['examples']) == 1 else 'appear'} more than once. Remove the extra entries so totals"
                               " are not doubled.", ins, "quality"))
        elif kind == "quality" and f.get("null_count"):
            out.append(_action("medium", f"Fill in {f['null_count']} missing {f['column']}",
                               f"These records have no {f['column']} while all others do.", ins, "quality"))
        elif kind == "quality" and f.get("count"):
            out.append(_action("medium", f"Remove {f['count']:,} duplicate rows",
                               "Duplicates inflate totals and counts.", ins, "quality"))
    out.sort(key=lambda a: _ORDER[a["priority"]])
    return out
