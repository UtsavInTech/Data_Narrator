"""Draft entries -> commit (Employee ID + password) -> new batch, optionally pushed to the source DB.

Write-back order: the source database first, then Data Narrator. If the push fails,
nothing is saved anywhere, so the two never disagree.
"""
import json
import os
import time
import uuid

import pandas as pd
from fastapi import HTTPException

from .. import catalog, config, service
from ..db import connect, lit, parquet, q
from . import rules

SCHEMA = """
CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    ds_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_ds ON entries(ds_id);
"""
SECRETS = config.STORAGE_DIR / "writeback.json"


def init():
    with catalog._lock, catalog._conn() as con:
        con.executescript(SCHEMA)


# ---------------------------------------------------------------- write-back connections

def _secrets() -> dict:
    return json.loads(SECRETS.read_text()) if SECRETS.exists() else {}


def save_writeback(ds_id: str, spec: dict):
    """Keep a database connection so committed entries can be pushed back. Stored on this server only."""
    data = _secrets()
    data[ds_id] = spec
    SECRETS.write_text(json.dumps(data))
    os.chmod(SECRETS, 0o600)


def writeback_enabled(ds_id: str) -> bool:
    return ds_id in _secrets()


def drop_writeback(ds_id: str):
    data = _secrets()
    if data.pop(ds_id, None) is not None:
        SECRETS.write_text(json.dumps(data))


def _push(con, ds_id: str, frame_view: str, columns: list[str]):
    spec = _secrets()[ds_id]
    kind = spec["type"]
    con.execute(f"INSTALL {kind}; LOAD {kind};")
    if kind == "postgres":
        dsn = (f"host={spec['host']} port={spec.get('port') or 5432} dbname={spec['database']}"
               f" user={spec['user']} password={spec.get('password', '')}")
    else:
        dsn = (f"host={spec['host']} port={spec.get('port') or 3306} database={spec['database']}"
               f" user={spec['user']} password={spec.get('password', '')}")
    con.execute(f"ATTACH {lit(dsn)} AS dst (TYPE {kind})")
    target = f"dst.{q(spec['schema'])}.{q(spec['table'])}"
    dest_cols = {r[0] for r in con.execute(f"DESCRIBE {target}").fetchall()}
    cols = [c for c in columns if c in dest_cols]
    col_list = ", ".join(q(c) for c in cols)
    con.execute(f"INSERT INTO {target} ({col_list}) SELECT {col_list} FROM {frame_view}")
    con.execute("DETACH dst")


# ---------------------------------------------------------------- drafts

def _load(ds_id: str) -> list[dict]:
    with catalog._conn() as con:
        rows = con.execute("SELECT * FROM entries WHERE ds_id=? ORDER BY created_at", (ds_id,)).fetchall()
    return [{**dict(r), "data": json.loads(r["data"])} for r in rows]


def fields_for(con, ds: dict, rel: str, prof: dict) -> list[dict]:
    """The entry form for a table, with lookups into the tables its keys point to."""
    lookups = {}
    for link in service.links_for(ds["owner"]):
        if link["many"] != ds["id"] or link["many_col"] in lookups:
            continue
        one = catalog.get(link["one"])
        one_prof = catalog.load_json(link["one"], "profile") if one else None
        if one and one_prof:
            lookups[link["many_col"]] = rules._lookup(con, {**link, "one_name": one["name"]}, service.relation(one), one_prof)
    return rules.form(con, rel, prof, lookups)


def _context(ds: dict):
    prof = catalog.load_json(ds["id"], "profile")
    if not prof:
        raise HTTPException(409, "This table is still being analysed")
    con = connect()
    rel = service.relation(ds)
    return con, rel, fields_for(con, ds, rel, prof)


def drafts(ds: dict) -> list[dict]:
    items = _load(ds["id"])
    if not items:
        return []
    con, rel, fields = _context(ds)
    try:
        out = []
        for d in items:
            others = [o["data"] for o in items if o["id"] != d["id"]]
            _, errors, warnings = rules.validate(con, rel, fields, d["data"], others)
            out.append({**d, "errors": errors, "warnings": warnings})
        return out
    finally:
        con.close()


def save_draft(ds: dict, data: dict, user: dict, entry_id: str | None = None) -> dict:
    con, rel, fields = _context(ds)
    try:
        others = [o["data"] for o in _load(ds["id"]) if o["id"] != entry_id]
        clean, errors, warnings = rules.validate(con, rel, fields, data, others)
    finally:
        con.close()
    names = {f["name"] for f in fields}
    stored = {k: v for k, v in data.items() if k in names}
    with catalog._lock, catalog._conn() as c:
        if entry_id:
            c.execute("UPDATE entries SET data=? WHERE id=? AND ds_id=?", (json.dumps(stored), entry_id, ds["id"]))
        else:
            entry_id = uuid.uuid4().hex[:12]
            c.execute("INSERT INTO entries VALUES (?,?,?,?,?)",
                      (entry_id, ds["id"], json.dumps(stored), user["employee_id"], time.time()))
    return {"id": entry_id, "data": stored, "errors": errors, "warnings": warnings}


def delete_draft(ds_id: str, entry_id: str):
    with catalog._lock, catalog._conn() as c:
        c.execute("DELETE FROM entries WHERE id=? AND ds_id=?", (entry_id, ds_id))


# ---------------------------------------------------------------- commit

def commit(ds: dict, employee: dict, push: bool) -> dict:
    items = _load(ds["id"])
    if not items:
        raise HTTPException(400, "Nothing to commit")
    con, rel, fields = _context(ds)
    try:
        rows, problems = [], []
        for d in items:
            others = [o["data"] for o in items if o["id"] != d["id"]]
            clean, errors, _ = rules.validate(con, rel, fields, d["data"], others)
            if errors:
                problems.append({"id": d["id"], "errors": errors})
            rows.append(clean)
        if problems:
            raise HTTPException(422, {"message": f"{len(problems)} entr{'y has' if len(problems) == 1 else 'ies have'}"
                                                 " errors. Fix them first.", "problems": problems})

        schema = con.execute(f"DESCRIBE SELECT * FROM {rel}").fetchall()
        frame = pd.DataFrame(rows, columns=[name for name, *_ in schema]).astype(object)
        frame = frame.where(frame.notna(), None)
        con.register("new_rows_raw", frame)
        casts = ", ".join(f"TRY_CAST({q(n)} AS {t}) AS {q(n)}" for n, t, *_ in schema)
        con.execute(f"CREATE TEMP TABLE new_rows AS SELECT {casts} FROM new_rows_raw")

        pushed = False
        if push:
            if not writeback_enabled(ds["id"]):
                raise HTTPException(400, "Write-back isn't enabled for this table")
            try:
                _push(con, ds["id"], "new_rows", [d["name"] for d in fields if any(r.get(d["name"]) is not None for r in rows)])
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(502, f"Couldn't save to the source database, nothing was saved: {str(e).splitlines()[0]}")
            pushed = True

        part = catalog.new_part_path(ds["id"])
        con.execute(f"COPY new_rows TO {lit(str(part))} (FORMAT parquet, COMPRESSION zstd)")
        batch = catalog.add_batch(ds["id"], part, "entry", len(rows), f"{len(rows)} entries",
                                  None, employee["employee_id"])
        total = con.execute(f"SELECT count(*) FROM {parquet(catalog.data_glob(ds['id']))}").fetchone()[0]
    finally:
        con.close()

    with catalog._lock, catalog._conn() as c:
        c.execute("DELETE FROM entries WHERE ds_id=?", (ds["id"],))
    catalog.update(ds["id"], row_count=total)
    service.reanalyze(ds["id"])
    return {"rows": len(rows), "pushed": pushed, "batch": batch, "committed_by": employee}
