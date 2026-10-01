"""Understand a table without knowing its schema.

Each column gets a semantic role:
  measure    numbers worth adding/averaging (agg = sum | avg)
  dimension  low-cardinality categories to group by (subtype geo/flag where known)
  time       dates/timestamps, or integer years
  entity     high-cardinality names (customers, products) - good for top-N
  id         keys and codes - used for joins, never charted
  text       long free text
  empty / constant
One SUMMARIZE pass over (a sample of) the data drives everything.
"""
import re

from .. import config
from ..db import fetch_dicts, q

NUMERIC = ("TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT", "UTINYINT", "USMALLINT", "UINTEGER",
           "UBIGINT", "FLOAT", "DOUBLE", "DECIMAL", "REAL")
INTEGER = ("TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT", "UTINYINT", "USMALLINT", "UINTEGER", "UBIGINT")

ID_NAME = re.compile(r"(^|[\s_\-.])(id|key|code|uuid|guid|no|num|number|sku|ref|pin|zip)$|^(id|#|s\.?\s*no\.?|sr\.?\s*no\.?|serial(\s*no)?|index)$", re.I)
MEASURE_HINT = re.compile(
    r"amount|amt|sales|revenue|profit|loss|cost|price|qty|quantity|total|value|income|expense|salary|wage|"
    r"spend|budget|target|margin|discount|tax|fee|balance|units|volume|weight|score|duration|hours|"
    r"rate|age|marks|percent|pct|ratio|count|sum|gmv|mrp|turnover|premium|claim|stock|inventory|kwh|"
    r"temperature|temp|height|length|distance|speed|days|visits|clicks|views|orders|rating|tenure", re.I)
AVG_HINT = re.compile(
    r"price|rate|pct|percent|%|ratio|score|age|temp|avg|average|mean|margin|rating|duration|lat|lon|"
    r"tenure|marks|grade|speed|height|weight|bmi|probability|share", re.I)
GEO_HINT = re.compile(r"country|state|city|region|zone|district|province|territory|location|branch|area|market", re.I)
YEAR_NAME = re.compile(r"year|yr|fy", re.I)


def _family(typ: str) -> str:
    t = typ.upper()
    if t.startswith(("DATE", "TIMESTAMP")):
        return "time"
    if t == "BOOLEAN":
        return "bool"
    if t.startswith(NUMERIC):
        return "number"
    if t == "VARCHAR":
        return "text"
    return "other"


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def profile(con, rel: str, row_count: int) -> dict:
    sampled = row_count > config.PROFILE_SAMPLE_ROWS
    src = f"(SELECT * FROM {rel} USING SAMPLE {config.PROFILE_SAMPLE_ROWS} ROWS)" if sampled else rel
    con.execute(f"CREATE OR REPLACE TEMP TABLE __p AS SELECT * FROM {src}")
    n_rows = con.execute("SELECT count(*) FROM __p").fetchone()[0]
    summary = fetch_dicts(con, "SUMMARIZE __p")

    text_cols = [s["column_name"] for s in summary if _family(s["column_type"]) == "text"]
    text_stats = {}
    if text_cols:
        exprs = ", ".join(
            f"avg(length({q(c)})) AS {q(c + '__len')}, avg(CASE WHEN {q(c)} LIKE '% %' THEN 1 ELSE 0 END)"
            f" AS {q(c + '__sp')}" for c in text_cols)
        row = fetch_dicts(con, f"SELECT {exprs} FROM __p")[0]
        text_stats = {c: (row[c + "__len"] or 0, row[c + "__sp"] or 0) for c in text_cols}

    columns = []
    for s in summary:
        name, typ = s["column_name"], s["column_type"]
        fam = _family(typ)
        null_pct = _num(s["null_percentage"]) or 0.0
        nonnull = max(n_rows * (1 - null_pct / 100), 0)
        uniq = int(s["approx_unique"] or 0)
        uniq_ratio = min(uniq / nonnull, 1.0) if nonnull else 0
        col = {"name": name, "type": typ, "null_pct": round(null_pct, 2), "unique": uniq,
               "min": s["min"], "max": s["max"], "mean": _num(s["avg"]), "std": _num(s["std"]),
               "q25": _num(s["q25"]), "q50": _num(s["q50"]), "q75": _num(s["q75"]),
               "role": None, "agg": None, "subtype": None}
        id_name = bool(ID_NAME.search(name.strip()))
        measure_hint = bool(MEASURE_HINT.search(name))

        if nonnull == 0:
            col["role"] = "empty"
        elif uniq <= 1:
            col["role"] = "constant"
        elif fam == "time":
            col["role"] = "time"
        elif fam == "bool":
            col["role"], col["subtype"] = "dimension", "flag"
        elif fam == "number":
            lo, hi = _num(s["min"]), _num(s["max"])
            is_int = typ.upper().startswith(INTEGER)
            if YEAR_NAME.search(name) and is_int and lo and hi and 1900 <= lo and hi <= 2100:
                col["role"], col["subtype"] = "time", "year"
            elif id_name and not measure_hint:
                col["role"] = "id"
            elif is_int and uniq_ratio > 0.98 and nonnull > 50 and not measure_hint:
                col["role"] = "id"
            elif is_int and uniq <= 12 and not measure_hint:
                col["role"], col["subtype"] = "dimension", "code"
            else:
                col["role"] = "measure"
                rate_like = lo is not None and hi is not None and 0 <= lo and hi <= 1 and not is_int
                col["agg"] = "avg" if AVG_HINT.search(name) or rate_like else "sum"
        elif fam == "text":
            avg_len, space_frac = text_stats.get(name, (0, 0))
            geo = bool(GEO_HINT.search(name))
            if id_name and (uniq_ratio > 0.3 or uniq > 60):
                col["role"] = "id"
            elif avg_len > 40 and uniq_ratio > 0.5:
                col["role"] = "text"
            elif uniq <= 60 or (geo and uniq <= 300):
                col["role"], col["subtype"] = "dimension", "geo" if geo else None
            elif uniq_ratio > 0.95 and space_frac < 0.2 and nonnull > 50:
                col["role"] = "id"
            else:
                col["role"], col["subtype"] = "entity", "geo" if geo else None
        else:
            col["role"] = "other"
        columns.append(col)

    dupes = 0
    if n_rows <= 5_000_000:
        dupes = con.execute("SELECT count(*) - (SELECT count(*) FROM (SELECT DISTINCT * FROM __p)) FROM __p").fetchone()[0]
    con.execute("DROP TABLE __p")
    return {"row_count": row_count, "sampled": sampled, "sample_rows": n_rows,
            "duplicate_rows": int(dupes), "columns": columns}


def by_role(prof: dict, role: str) -> list[dict]:
    return [c for c in prof["columns"] if c["role"] == role]
