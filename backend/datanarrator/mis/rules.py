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


def _next_id(con, rel: str, name: str) -> str | None:
    """INV-28144 -> INV-28145: the next number in the column's own pattern."""
    row = con.execute(
        f"SELECT regexp_extract(CAST({q(name)} AS VARCHAR), '^(.*?)(\\d+)$', 1) p,"
        f" max(TRY_CAST(regexp_extract(CAST({q(name)} AS VARCHAR), '(\\d+)$', 1) AS BIGINT)) n,"
        f" max(length(regexp_extract(CAST({q(name)} AS VARCHAR), '(\\d+)$', 1))) w"
        f" FROM {rel} WHERE regexp_matches(CAST({q(name)} AS VARCHAR), '\\d+$') GROUP BY 1 ORDER BY count(*) DESC LIMIT 1").fetchone()
    if not row or row[1] is None:
        return None
    prefix, n, width = row
    return f"{prefix}{str(n + 1).zfill(width)}"


def _lookup(con, link: dict, one_rel: str, one_prof: dict) -> dict:
    """Options for a key that points at another table: value + readable label + details."""
    key = link["one_col"]
    cols = [c for c in one_prof["columns"] if c["name"] != key and c["role"] not in ("empty", "constant")]
    label = next((c for c in cols if re.search(r"name", c["name"], re.I)), None) \
        or next((c for c in cols if c["role"] in ("entity", "text", "dimension")), None)
    place = next((c for c in cols if c["subtype"] == "geo" and c is not label), None)
    detail_cols = [c["name"] for c in cols][:7]
    sel = ", ".join(q(c) for c in [key, *detail_cols])
    rows = con.execute(f"SELECT {sel} FROM {one_rel} ORDER BY 1 LIMIT 1000").fetchall()
    options = []
    for r in rows:
        d = dict(zip([key, *detail_cols], r))
        text = str(d[key])
        if label:
            text += f" · {d[label['name']]}"
        if place and d.get(place["name"]):
            text += f", {d[place['name']]}"
        options.append({"value": str(d[key]), "label": text,
                        "detail": {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in d.items() if k != key}})
    return {"table": link.get("one_name"), "options": options}


def formulas(con, rel: str, prof: dict) -> list[dict]:
    """Columns that are always computed from others, learnt from the data (Total = Taxable + GST, GST = 18%)."""
    nums = [c["name"] for c in prof["columns"] if c["role"] == "measure"][:8]
    if len(nums) < 2:
        return []
    src = f"(SELECT * FROM {rel} LIMIT 50000)"
    found, taken = [], set()
    for t in nums:
        for i, a in enumerate(nums):
            for b in nums[i + 1:]:
                if t in (a, b) or t in taken:
                    continue
                ok, n = con.execute(
                    f"SELECT avg(CASE WHEN abs({q(t)} - ({q(a)} + {q(b)})) <= 0.011 * greatest(abs({q(t)}), 1) THEN 1 ELSE 0 END),"
                    f" count(*) FROM {src} WHERE {q(t)} IS NOT NULL AND {q(a)} IS NOT NULL AND {q(b)} IS NOT NULL AND {q(t)} <> 0").fetchone()
                if n and n >= 20 and ok >= 0.98:
                    found.append({"target": t, "op": "add", "args": [a, b]})
                    taken.add(t)
    for t in nums:
        if t in taken:
            continue
        for a in nums:
            if a == t:
                continue
            k, spread, n = con.execute(
                f"SELECT avg({q(t)} / {q(a)}), stddev_pop({q(t)} / {q(a)}), count(*) FROM {src}"
                f" WHERE {q(a)} > 0 AND {q(t)} IS NOT NULL").fetchone()
            if a in taken or any(r["target"] == a and t in r["args"] for r in found):
                continue  # no circular rules (a must be typed, not calculated from t)
            if n and n >= 20 and k and 0 < k < 1 and spread is not None and spread <= 0.003 * abs(k):
                found.append({"target": t, "op": "mul", "args": [a], "k": round(k, 4)})
                taken.add(t)
                break
    # Dates a fixed number of days apart (Due Date = Invoice Date + 30).
    dates = [c["name"] for c in prof["columns"] if c["role"] == "time" and c["subtype"] != "year"]
    for t in dates:
        for a in dates:
            if a == t:
                continue
            days, share, n = con.execute(
                f"SELECT mode(date_diff('day', CAST({q(a)} AS DATE), CAST({q(t)} AS DATE))),"
                f" avg(CASE WHEN date_diff('day', CAST({q(a)} AS DATE), CAST({q(t)} AS DATE)) ="
                f" (SELECT mode(date_diff('day', CAST({q(a)} AS DATE), CAST({q(t)} AS DATE))) FROM {src}) THEN 1 ELSE 0 END),"
                f" count(*) FROM {src} WHERE {q(a)} IS NOT NULL AND {q(t)} IS NOT NULL").fetchone()
            if n and n >= 20 and days and days > 0 and share >= 0.95:
                found.append({"target": t, "op": "days", "args": [a], "k": int(days)})
                break
    return found


def form(con, rel: str, prof: dict, lookups: dict | None = None) -> list[dict]:
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
            # Due dates, delivery dates… already run ahead of today in the data: future values are normal there.
            try:
                f["allow_future"] = dt.date.fromisoformat(str(col["max"])[:10]) > dt.date.today() + dt.timedelta(days=1)
            except ValueError:
                f["allow_future"] = False
        elif col["role"] == "constant":
            f["default"] = col["min"]
        if col["role"] == "id":
            n, u = con.execute(f"SELECT count({q(name)}), count(DISTINCT {q(name)}) FROM {rel}").fetchone()
            f["unique"] = n > 0 and u >= 0.98 * n
            if f["unique"]:
                f["next"] = _next_id(con, rel, name)
                f["default"] = f["next"]
        if lookups and name in lookups:
            f["kind"], f["lookup"] = "lookup", lookups[name]
            f["options"] = [o["value"] for o in lookups[name]["options"]]
        fields.append(f)
    for rule in formulas(con, rel, prof):
        tgt = next((f for f in fields if f["name"] == rule["target"]), None)
        if tgt:
            tgt["formula"] = rule
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
            if d > today + dt.timedelta(days=1) and not f.get("allow_future"):
                errors[name] = "is in the future"
            elif d < today - dt.timedelta(days=400):
                warnings[name] = "is more than a year old"
        elif f["kind"] == "select" and f["options"] and str(value) not in f["options"]:
            warnings[name] = f"'{value}' is new (not seen before)"
        elif f["kind"] == "lookup" and f["options"] and str(value) not in f["options"]:
            errors[name] = f"{value} is not in {f['lookup'].get('table') or 'the linked table'}"
        if f["unique"]:
            exists = con.execute(f"SELECT 1 FROM {rel} WHERE CAST({q(name)} AS VARCHAR) = ? LIMIT 1",
                                 [str(value)]).fetchone()
            if exists or any(str(o.get(name)) == str(value) for o in others):
                errors[name] = f"{value} already exists"
        clean[name] = value
    return clean, errors, warnings
