"""Turn any relation into a typed Parquet file.

Text columns that really hold numbers ("₹1,234", "(500)", "12%") or dates
("03-04-2018", "Apr-18") are detected on a sample and cast for the full data.
"""
import re
import uuid

from .. import config
from ..db import lit, q

SAMPLE_ROWS = 20_000

# (format, has_time). Order matters only as a tie-break; day-first vs month-first
# ambiguity is resolved by config.DAYFIRST.
DATE_FORMATS = [
    ("%Y-%m-%d", False), ("%d-%m-%Y", False), ("%m-%d-%Y", False),
    ("%d/%m/%Y", False), ("%m/%d/%Y", False), ("%Y/%m/%d", False),
    ("%d.%m.%Y", False), ("%d-%m-%y", False), ("%d/%m/%y", False), ("%m/%d/%y", False),
    ("%d-%b-%Y", False), ("%d %b %Y", False), ("%d %B %Y", False), ("%b %d, %Y", False),
    ("%B %d, %Y", False), ("%d-%b-%y", False), ("%b-%y", False), ("%b-%Y", False),
    ("%b %Y", False), ("%B %Y", False), ("%B-%Y", False), ("%Y-%m", False),
    ("%Y-%m-%d %H:%M:%S", True), ("%Y-%m-%dT%H:%M:%S", True), ("%Y-%m-%d %H:%M", True),
    ("%d-%m-%Y %H:%M:%S", True), ("%d-%m-%Y %H:%M", True), ("%d/%m/%Y %H:%M", True),
    ("%m/%d/%Y %H:%M", True), ("%m/%d/%Y %I:%M %p", True),
]
_MONTH_FIRST = {"%m-%d-%Y", "%m/%d/%Y", "%m/%d/%y", "%m/%d/%Y %H:%M", "%m/%d/%Y %I:%M %p"}

NUMERIC_CLEAN = (
    "regexp_replace(regexp_replace(trim({c}), '^\\((.*)\\)$', '-\\1'),"
    " '[₹$€£¥,%\\s]|Rs\\.?|INR|USD|EUR|GBP', '', 'gi')"
)
NULL_TOKENS = ("", "-", "--", "—", "na", "n/a", "nan", "null", "none", "#n/a", "nil", "?")


def _null_filter(c: str) -> str:
    tokens = ", ".join(lit(t) for t in NULL_TOKENS)
    return f"{c} IS NOT NULL AND lower(trim({c})) NOT IN ({tokens})"


def _null_guard(c: str, expr: str) -> str:
    return f"CASE WHEN {_null_filter(c)} THEN {expr} END"


def infer_varchar(con, rel: str, name: str) -> tuple[str | None, str | None]:
    """Return (cast expression, note) for a VARCHAR column, or (None, None)."""
    c = q(name)
    vals = [r[0] for r in con.execute(
        f"SELECT trim({c}) FROM {rel} WHERE {_null_filter(c)} LIMIT {SAMPLE_ROWS}").fetchall()]
    if len(vals) < 3:
        return None, None
    con.execute("CREATE OR REPLACE TEMP TABLE __s AS SELECT unnest($1::VARCHAR[]) AS v", [vals])
    n = len(vals)

    # Numbers. Codes with leading zeros (pincodes, account numbers) stay text.
    leading_zero = sum(1 for v in vals if re.fullmatch(r"0\d+", v)) / n
    has_digit = sum(1 for v in vals if any(ch.isdigit() for ch in v)) / n
    if leading_zero < 0.05 and has_digit > 0.97:
        clean = NUMERIC_CLEAN.format(c="v")
        ok, integral = con.execute(
            f"SELECT count(TRY_CAST({clean} AS DOUBLE)),"
            f" bool_and(TRY_CAST({clean} AS DOUBLE) = round(TRY_CAST({clean} AS DOUBLE))) FROM __s"
        ).fetchone()
        if ok / n >= 0.97:
            col_clean = NUMERIC_CLEAN.format(c=c)
            expr = f"TRY_CAST({col_clean} AS DOUBLE)"
            if integral:
                expr = f"TRY_CAST(TRY_CAST({col_clean} AS DOUBLE) AS BIGINT)"
            return _null_guard(c, expr), "text converted to numbers"

    # Dates: score every format, then combine the best few (mixed-format columns exist).
    scores = []
    for fmt, has_time in DATE_FORMATS:
        hits = con.execute(f"SELECT count(TRY_STRPTIME(v, {lit(fmt)})) FROM __s").fetchone()[0]
        if hits:
            pref = 0 if (fmt in _MONTH_FIRST) != config.DAYFIRST else 1
            scores.append((hits, pref, fmt, has_time))
    if not scores:
        return None, None
    scores.sort(reverse=True)
    chosen = [s for s in scores if s[0] / n >= 0.05][:3]
    if not chosen:
        return None, None
    coalesce = "coalesce(" + ", ".join(f"TRY_STRPTIME(v, {lit(s[2])})" for s in chosen) + ")"
    combined = con.execute(f"SELECT count({coalesce}) FROM __s").fetchone()[0]
    if combined / n < 0.95:
        return None, None
    any_time = any(s[3] for s in chosen)
    col_expr = "coalesce(" + ", ".join(f"TRY_STRPTIME(trim({c}), {lit(s[2])})" for s in chosen) + ")"
    if not any_time:
        col_expr = f"CAST({col_expr} AS DATE)"
    return col_expr, f"text converted to dates ({chosen[0][2]})"


def write_parquet(con, rel: str, dest) -> dict:
    """Stage `rel` to Parquet, repair column types, write final Parquet. Returns a report."""
    staging = config.STORAGE_DIR / "tmp" / f"stage_{uuid.uuid4().hex}.parquet"
    con.execute(f"COPY (SELECT * FROM {rel}) TO {lit(str(staging))} (FORMAT parquet)")
    try:
        src = f"read_parquet({lit(str(staging))})"
        cols = con.execute(f"DESCRIBE SELECT * FROM {src}").fetchall()
        exprs, notes = [], {}
        for name, typ, *_ in cols:
            expr = None
            if typ == "VARCHAR":
                expr, note = infer_varchar(con, src, name)
                if note:
                    notes[name] = note
            elif typ.startswith("TIMESTAMP") and con.execute(
                    f"SELECT coalesce(bool_and(CAST({q(name)} AS TIME) = TIME '00:00:00'), false)"
                    f" FROM (SELECT {q(name)} FROM {src} WHERE {q(name)} IS NOT NULL LIMIT {SAMPLE_ROWS})").fetchone()[0]:
                expr = f"CAST({q(name)} AS DATE)"  # Excel stores plain dates as midnight timestamps
            exprs.append(f"{expr} AS {q(name)}" if expr else q(name))
        not_blank = " OR ".join(f"{q(name)} IS NOT NULL" for name, *_ in cols)
        con.execute(
            f"COPY (SELECT {', '.join(exprs)} FROM {src} WHERE {not_blank}) TO {lit(str(dest))}"
            " (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 122880)"
        )
        rows = con.execute(f"SELECT count(*) FROM read_parquet({lit(str(dest))})").fetchone()[0]
        staged = con.execute(f"SELECT count(*) FROM {src}").fetchone()[0]
        report = {"rows": rows, "columns": len(cols), "conversions": notes}
        if staged > rows:
            report["blank_rows_removed"] = staged - rows
        return report
    finally:
        staging.unlink(missing_ok=True)
