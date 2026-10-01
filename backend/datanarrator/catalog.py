"""Dataset catalog (SQLite). Swap for Postgres when running many API replicas."""
import json
import shutil
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager

from . import config

_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,            -- table | model | import
    source_type TEXT NOT NULL,     -- upload | url | postgres | mysql | model
    source_label TEXT,
    sql TEXT,                      -- relation SQL for models
    row_count INTEGER,
    column_count INTEGER,
    status TEXT NOT NULL,          -- importing | processing | ready | error
    error TEXT,
    meta TEXT,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_datasets_owner ON datasets(owner);
"""


@contextmanager
def _conn():
    con = sqlite3.connect(config.CATALOG_PATH, timeout=30)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init():
    with _lock, _conn() as con:
        con.executescript(SCHEMA)
        con.execute("PRAGMA journal_mode=WAL")


def _row(r) -> dict | None:
    if r is None:
        return None
    d = dict(r)
    d["meta"] = json.loads(d["meta"]) if d["meta"] else {}
    return d


def create(owner: str, name: str, kind: str, source_type: str, source_label: str = "",
           status: str = "processing", sql: str | None = None, meta: dict | None = None) -> dict:
    now = time.time()
    ds_id = uuid.uuid4().hex[:12]
    with _lock, _conn() as con:
        con.execute(
            "INSERT INTO datasets (id, owner, name, kind, source_type, source_label, sql, status, meta,"
            " created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (ds_id, owner, name, kind, source_type, source_label, sql, status,
             json.dumps(meta or {}), now, now),
        )
    dataset_dir(ds_id).mkdir(parents=True, exist_ok=True)
    return get(ds_id)


def update(ds_id: str, **fields):
    if "meta" in fields:
        fields["meta"] = json.dumps(fields["meta"])
    fields["updated_at"] = time.time()
    cols = ", ".join(f"{k}=?" for k in fields)
    with _lock, _conn() as con:
        con.execute(f"UPDATE datasets SET {cols} WHERE id=?", (*fields.values(), ds_id))


def get(ds_id: str) -> dict | None:
    with _conn() as con:
        return _row(con.execute("SELECT * FROM datasets WHERE id=?", (ds_id,)).fetchone())


def list_for(owner: str, kind: str | None = None) -> list[dict]:
    sql, args = "SELECT * FROM datasets WHERE owner=?", [owner]
    if kind:
        sql += " AND kind=?"
        args.append(kind)
    with _conn() as con:
        return [_row(r) for r in con.execute(sql + " ORDER BY created_at DESC", args).fetchall()]


def delete(ds_id: str):
    with _lock, _conn() as con:
        con.execute("DELETE FROM datasets WHERE id=?", (ds_id,))
    shutil.rmtree(dataset_dir(ds_id), ignore_errors=True)


def dataset_dir(ds_id: str):
    return config.DATASETS_DIR / ds_id


def data_path(ds_id: str):
    return dataset_dir(ds_id) / "data.parquet"


def save_json(ds_id: str, name: str, payload):
    (dataset_dir(ds_id) / f"{name}.json").write_text(json.dumps(payload, default=str))


def load_json(ds_id: str, name: str):
    p = dataset_dir(ds_id) / f"{name}.json"
    return json.loads(p.read_text()) if p.exists() else None
