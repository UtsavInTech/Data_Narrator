"""Human-friendly numbers for narratives and cards. Indian style by default (lakh / crore)."""
import os
import re

CURRENCY = os.environ.get("DN_CURRENCY", "₹")
INDIAN = os.environ.get("DN_NUMBER_STYLE", "indian").lower() == "indian"
MONEY_NAME = re.compile(r"revenue|sales|amount|amt|value|total|price|cost|paid|received|collected|gst|tax|"
                        r"profit|income|expense|salary|balance|due|outstanding|turnover|fee|budget|target|mrp|rate|freight|fare|"
                        r"charges?|payable|receivable", re.I)
NOT_MONEY = re.compile(r"qty|quantity|units|count|items|bills|%|percent|pct|ratio|score|\bage\b|days|hours", re.I)


def is_money(name: str) -> bool:
    return bool(MONEY_NAME.search(name)) and not NOT_MONEY.search(name)


def _short(v: float) -> str:
    a = abs(v)
    if INDIAN:
        for size, suffix in ((1e7, " crore"), (1e5, " lakh")):
            if a >= size:
                return f"{v / size:.2f}".rstrip("0").rstrip(".") + suffix
        if a >= 1000:
            return f"{v:,.0f}"
    else:
        for size, suffix in ((1e9, "B"), (1e6, "M"), (1e3, "K")):
            if a >= size:
                return f"{v / size:.1f}".rstrip("0").rstrip(".") + suffix
    return f"{v:,.0f}" if a >= 100 or float(v).is_integer() else f"{v:,.2f}"


def num(v, money: bool = False) -> str:
    if v is None:
        return "–"
    v = float(v)
    s = _short(v)
    if money:
        return f"−{CURRENCY}{s[1:]}" if s.startswith("-") else f"{CURRENCY}{s}"
    return s


def money_or_num(v, name: str) -> str:
    return num(v, is_money(name))


def pct(x) -> str:
    if x is None:
        return "–"
    p = x * 100
    return f"{p:.1f}%" if abs(p) < 10 else f"{p:.0f}%"


def plural(word: str, n: int | None = None) -> str:
    """Plain-English plural of a column-ish name: City -> cities, Salesperson -> salespeople."""
    w = re.sub(r"\s*(id|code|no|number|name)$", "", word.strip(), flags=re.I).strip() or word.strip()
    w = w.lower()
    if w in ("from", "to", "via", "origin", "destination") and n != 1:
        return "places"
    if n == 1:
        return w
    if w.endswith("person"):
        return w[:-6] + "people"
    if re.search(r"[^aeiou]y$", w):
        return w[:-1] + "ies"
    if re.search(r"(s|x|z|ch|sh)$", w):
        return w + "es"
    return w + "s"


_NOT_COUNTABLE = {"sales", "details", "status", "analysis", "news", "accounts", "data", "stats", "statistics", "logistics"}


def noun_for(table: str) -> str:
    """'Invoices' -> 'Invoices'; 'Daily sales' / 'Order Details' -> 'Records'."""
    t = (table or "").strip()
    last = t.split()[-1].lower() if t else ""
    if t and len(t) <= 24 and last.endswith("s") and not last.endswith("ss") and last not in _NOT_COUNTABLE:
        return t
    return "Records"
