"""DuckDB connection factory and SQL quoting helpers.

Every request opens its own in-memory connection that reads Parquet files,
so connections never share state and scale across threads/processes.
"""
import datetime as dt
import decimal
import math

import duckdb

from . import config


def connect() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(":memory:")
    con.execute(f"SET memory_limit='{config.DUCKDB_MEMORY_LIMIT}'")
    con.execute(f"SET threads={config.DUCKDB_THREADS}")
    con.execute(f"SET temp_directory={lit(str(config.STORAGE_DIR / 'tmp'))}")
    return con


def q(ident: str) -> str:
    """Quote an identifier."""
    return '"' + str(ident).replace('"', '""') + '"'


def lit(value: str) -> str:
    """Quote a string literal."""
    return "'" + str(value).replace("'", "''") + "'"


def parquet(path: str) -> str:
    """Read one file or a folder glob of parts; columns are matched by name across parts."""
    return f"read_parquet({lit(path)}, union_by_name=true)"


def jsonable(v):
    if v is None:
        return None
    if isinstance(v, float):
        return None if math.isnan(v) or math.isinf(v) else v
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (dt.datetime, dt.date, dt.time)):
        return v.isoformat()
    if isinstance(v, (bytes, bytearray)):
        return v.hex()
    if isinstance(v, (int, str, bool)):
        return v
    return str(v)


def fetch_dicts(con, sql: str, params=None) -> list[dict]:
    cur = con.execute(sql, params or [])
    names = [d[0] for d in cur.description]
    return [{n: jsonable(v) for n, v in zip(names, row)} for row in cur.fetchall()]
