"""Human-friendly number formatting for narratives and cards."""


def num(v) -> str:
    if v is None:
        return "–"
    v = float(v)
    a = abs(v)
    for size, suffix in ((1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K")):
        if a >= size:
            s = f"{v / size:.1f}".rstrip("0").rstrip(".")
            return f"{s}{suffix}"
    if a >= 100 or v.is_integer():
        return f"{v:,.0f}"
    return f"{v:,.2f}"


def pct(x) -> str:
    if x is None:
        return "–"
    p = x * 100
    return f"{p:.1f}%" if abs(p) < 10 else f"{p:.0f}%"
