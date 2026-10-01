"""Entry form + validation rules, learnt from a table's existing data.

Nobody writes rules. From the profile and the data:
  dimension  -> dropdown of known values; a new value is a warning
  measure    -> number; negative is an error if it never was; far outside
                the usual range is a warning
  time       -> date picker; future dates are errors
  id         -> must be unique when it always was
  never-empty columns -> required
"""
import datetime as dt
import re

from ..db import q

MAX_OPTIONS = 200


def _kind(col: dict) -> str:
    t = col["type"].upper()
    if col["role"] == "time" and col["subtype"] != "year":
        return "datetime" if t.startswith("TIMESTAMP") else "date"
    if t == "BOOLEAN":
        return "boolean"
    if col["role"] == "dimension":
        return "select"
    if t.startswith(("TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT", "U", "FLOAT", "DOUBLE", "DECIMAL", "REAL")):
        return "number"
    if col["role"] == "text":
        return "textarea"
    return "text"


def form(con, rel: str, prof: dict) -> list[dict]:
    fields = []
    for col in prof["columns"]:
        if col["role"] == "empty":
            continue
        name, kind = col["name"], _kind(col)
        f = {"name": name, "kind": kind, "role": col["role"], "required": col["null_pct"] == 0 and kind != "textarea",
             "options": None, "suggestions": None, "min": None, "warn_above": None, "unique": False,
             "integer": col["type"].upper().startswith(("TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT")),
             "default": None}
        if kind == "select":
            f["options"] = [r[0] for r in con.execute(
                f"SELECT DISTINCT CAST({q(name)} AS VARCHAR) v FROM {rel} WHERE {q(name)} IS NOT NULL"
                f" ORDER BY v LIMIT {MAX_OPTIONS}").fetchall()]
        elif col["role"] == "entity":
            f["suggestions"] = [r[0] for r in con.execute(
                f"SELECT CAST({q(name)} AS VARCHAR) v FROM {rel} WHERE {q(name)} IS NOT NULL"
                f" GROUP BY 1 ORDER BY count(*) DESC LIMIT 100").fetchall()]
        elif kind == "number":
            lo = _num(col["min"])
            if lo is not None and lo >= 0:
                f["min"] = 0
            if col["q25"] is not None and col["q75"] is not None and col["q75"] > col["q25"]:
                f["warn_above"] = col["q75"] + 10 * (col["q75"] - col["q25"])
        elif kind in ("date", "datetime"):
            f["default"] = dt.date.today().isoformat()
        elif col["role"] == "constant":
            f["default"] = col["min"]
        if col["role"] == "id":
            n, u = con.execute(f"SELECT count({q(name)}), count(DISTINCT {q(name)}) FROM {rel}").fetchone()
            f["unique"] = n > 0 and n == u
        fields.append(f)
    return fields


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def coerce(field: dict, raw):
    """Parse a submitted value. Returns (value, error)."""
    if raw is None or (isinstance(raw, str) and raw.strip() == ""):
        return None, None
    kind = field["kind"]
    if kind == "number":
        s = re.sub(r"[₹$,\s]", "", str(raw))
        v = _num(s)
        if v is None:
            return None, "must be a number"
        if field["integer"]:
            if not v.is_integer():
                return None, "must be a whole number"
            v = int(v)
        return v, None
    if kind in ("date", "datetime"):
        s = str(raw).strip()
        for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%d-%m-%Y", "%d/%m/%Y"):
            try:
                d = dt.datetime.strptime(s, fmt)
                return (d.date().isoformat() if kind == "date" else d.isoformat()), None
            except ValueError:
                pass
        return None, "must be a date"
    if kind == "boolean":
        s = str(raw).strip().lower()
        if s in ("true", "yes", "y", "1"):
            return True, None
        if s in ("false", "no", "n", "0"):
            return False, None
        return None, "must be yes or no"
    return str(raw).strip(), None


def validate(con, rel: str, fields: list[dict], data: dict, others: list[dict] = ()) -> tuple[dict, dict, dict]:
    """-> (clean values, errors, warnings), each keyed by field name.

    `others` are the other draft rows (to catch duplicate IDs inside the batch).
    """
    clean, errors, warnings = {}, {}, {}
    today = dt.date.today()
    for f in fields:
        name = f["name"]
        value, err = coerce(f, data.get(name))
        if err:
            errors[name] = err
            continue
        if value is None:
            if f["required"]:
                errors[name] = "is required"
            clean[name] = None
            continue
        if f["kind"] == "number":
            if f["min"] == 0 and value < 0:
                errors[name] = "can't be negative"
            elif f["warn_above"] is not None and value > f["warn_above"]:
                warnings[name] = "is much larger than usual"
        elif f["kind"] in ("date", "datetime"):
            d = dt.date.fromisoformat(value[:10])
            if d > today + dt.timedelta(days=1):
                errors[name] = "is in the future"
            elif d < today - dt.timedelta(days=400):
                warnings[name] = "is more than a year old"
        elif f["kind"] == "select" and f["options"] and str(value) not in f["options"]:
            warnings[name] = f"'{value}' is new (not seen before)"
        if f["unique"]:
            exists = con.execute(f"SELECT 1 FROM {rel} WHERE CAST({q(name)} AS VARCHAR) = ? LIMIT 1",
                                 [str(value)]).fetchone()
            if exists or any(str(o.get(name)) == str(value) for o in others):
                errors[name] = f"{value} already exists"
        clean[name] = value
    return clean, errors, warnings
