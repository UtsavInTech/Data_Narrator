"""Orchestration: import sources -> typed Parquet -> profile -> insights -> actions.

Work runs on a bounded thread pool so a burst of uploads cannot starve the API.
For many API replicas, replace the pool with a queue (e.g. Redis + worker).
"""
import logging
import re
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import catalog, config
from .connectors import normalize, sources
from .db import connect, lit, parquet, q
from .engine import actions, insights, profile, relationships

log = logging.getLogger("datanarrator")
_pool = ThreadPoolExecutor(max_workers=config.ANALYSIS_WORKERS, thread_name_prefix="dn-worker")


def relation(ds: dict) -> str:
    if ds["kind"] == "model":
        return ds["sql"]
    return parquet(catalog.data_glob(ds["id"]))


# ---------------------------------------------------------------- import

def start_import(owner: str, label: str, source_type: str, resolve, cleanup: list[Path] = (),
                 file_hash: str | None = None, user: str | None = None, on_table=None) -> dict:
    """Create a placeholder, then resolve + ingest in the background.

    `resolve(con)` returns [(name, relation_sql, report)] from connectors.sources.
    """
    placeholder = catalog.create(owner, label, "import", source_type, label, status="importing")
    catalog.update(placeholder["id"], stage="uploaded")
    _pool.submit(_run_import, owner, placeholder["id"], label, source_type, resolve, list(cleanup),
                 file_hash, user, on_table)
    return placeholder


def _run_import(owner, placeholder_id, label, source_type, resolve, cleanup, file_hash=None, user=None,
                on_table=None):
    con = connect()
    created, touched = [], []
    try:
        catalog.update(placeholder_id, stage="reading")
        rels = resolve(con)
        catalog.update(placeholder_id, stage="cleaning")
        if len(rels) == 1 and source_type == "url":  # one remote file/folder: use the name the user gave
            rels = [(label, *rels[0][1:])]
        for name, rel, report in rels:
            report = dict(report)
            fallback = report.pop("fallback", None)
            extra = report.pop("_cleanup", None)
            if extra:
                cleanup.append(Path(extra))
            staged = config.STORAGE_DIR / "tmp" / f"in_{uuid.uuid4().hex}.parquet"
            cleanup.append(staged)
            try:
                stats = normalize.write_parquet(con, rel, staged)
            except Exception:
                if not fallback:
                    raise
                stats = normalize.write_parquet(con, fallback, staged)
                report.setdefault("notes", []).append("read every column as text first (mixed types)")
            report.update(stats)

            target = _matching_table(con, owner, staged)
            if target:  # same layout as an existing table (e.g. today's daily sheet): add to it
                part = catalog.new_part_path(target["id"])
                rows = _append_cast(con, staged, target["id"], part)
                catalog.add_batch(target["id"], part, "import", rows, label, file_hash, user)
                total = con.execute(f"SELECT count(*) FROM {relation(target)}").fetchone()[0]
                catalog.update(target["id"], row_count=total)
                touched.append(target["id"])
                continue

            ds = catalog.create(owner, name, "table", source_type, label, status="processing")
            part = catalog.new_part_path(ds["id"])
            Path(staged).rename(part)
            catalog.add_batch(ds["id"], part, "import", stats["rows"], label, file_hash, user)
            catalog.save_json(ds["id"], "import_report", report)
            catalog.update(ds["id"], row_count=stats["rows"], column_count=stats["columns"])
            if on_table:
                on_table(ds["id"], name)
            created.append(ds["id"])
        catalog.delete(placeholder_id)
    except Exception as e:
        log.exception("import failed")
        catalog.update(placeholder_id, status="error", error=_friendly(e))
        for ds_id in created:
            catalog.delete(ds_id)
        return
    finally:
        con.close()
        for p in cleanup:
            Path(p).unlink(missing_ok=True)

    for ds_id in created + touched:
        analyze(ds_id)
    refresh_models(owner)


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _matching_table(con, owner: str, staged: Path) -> dict | None:
    """An existing table with exactly the same columns (by normalised name)."""
    cols = {_norm(r[0]) for r in con.execute(f"DESCRIBE SELECT * FROM {parquet(str(staged))}").fetchall()}
    for ds in catalog.list_for(owner, "table"):
        prof = catalog.load_json(ds["id"], "profile")
        if ds["status"] == "ready" and prof and {_norm(c["name"]) for c in prof["columns"]} == cols:
            return ds
    return None


def _append_cast(con, staged: Path, ds_id: str, part: Path) -> int:
    """Write new rows in the existing table's exact schema so parts always line up."""
    schema = con.execute(f"DESCRIBE SELECT * FROM {parquet(catalog.data_glob(ds_id))}").fetchall()
    incoming = {_norm(r[0]): r[0] for r in con.execute(f"DESCRIBE SELECT * FROM {parquet(str(staged))}").fetchall()}
    exprs = []
    for name, typ, *_ in schema:
        src = incoming.get(_norm(name))
        exprs.append(f"TRY_CAST({q(src)} AS {typ}) AS {q(name)}" if src else f"CAST(NULL AS {typ}) AS {q(name)}")
    con.execute(f"COPY (SELECT {', '.join(exprs)} FROM {parquet(str(staged))}) TO {lit(str(part))} (FORMAT parquet, COMPRESSION zstd)")
    return con.execute(f"SELECT count(*) FROM {parquet(str(part))}").fetchone()[0]


def _friendly(e: Exception) -> str:
    msg = str(e).strip().splitlines()[0] if str(e).strip() else type(e).__name__
    return msg[:400]


# ---------------------------------------------------------------- analysis

def analyze(ds_id: str):
    ds = catalog.get(ds_id)
    if not ds:
        return
    catalog.update(ds_id, status="processing", error=None, stage="profiling")
    con = connect()
    try:
        rel = relation(ds)
        rows = con.execute(f"SELECT count(*) FROM {rel}").fetchone()[0]
        prof = profile.profile(con, rel, rows)
        table_name = ds["name"]
        if ds["kind"] == "model":
            # Numbers from a lookup table (e.g. a customer's credit limit) repeat on every row: never add them up.
            dim_cols = set(ds["meta"].get("dim_columns", []))
            for c in prof["columns"]:
                if c["name"] in dim_cols and c["role"] == "measure":
                    c["role"], c["agg"] = "attribute", None
            table_name = ds["meta"].get("fact_name", table_name)
        catalog.update(ds_id, stage="insights")
        result = insights.generate(con, rel, prof, table_name)
        result["actions"] = actions.recommend(result["insights"], result["story"]["facts"].get("main_measure"))
        catalog.save_json(ds_id, "profile", prof)
        catalog.save_json(ds_id, "insights", result)
        # How complete a business picture this table gives; the app opens the best one first.
        f = result["story"]["facts"]
        importance = (2 * bool(result.get("time_column")) + 2 * bool(f.get("receivables")) + bool(f.get("main_measure"))
                      + (ds["kind"] == "model") + min(len(result["insights"]), 10) / 10)
        catalog.update(ds_id, meta={**ds["meta"], "importance": round(importance, 2)})
        catalog.update(ds_id, status="ready", stage=None, row_count=rows, column_count=len(prof["columns"]))
    except Exception as e:
        log.error("analysis failed for %s: %s", ds_id, traceback.format_exc())
        catalog.update(ds_id, status="error", error=_friendly(e))
    finally:
        con.close()


def reanalyze(ds_id: str):
    """Re-run analysis for a table and for joined views built on it."""
    catalog.update(ds_id, status="processing")
    ds = catalog.get(ds_id)
    dependents = [m["id"] for m in catalog.list_for(ds["owner"], "model")
                  if m["meta"].get("fact") == ds_id or any(l["one"] == ds_id for l in m["meta"].get("links", []))]

    def run():
        analyze(ds_id)
        for m in dependents:
            analyze(m)

    _pool.submit(run)


def refresh_models(owner: str):
    """Rebuild joined models from the current set of tables."""
    tables = []
    for ds in catalog.list_for(owner, "table"):
        prof = catalog.load_json(ds["id"], "profile")
        if ds["status"] == "ready" and prof:
            tables.append({"id": ds["id"], "name": ds["name"], "path": catalog.data_glob(ds["id"]),
                           "profile": prof})
    by_id = {t["id"]: t for t in tables}
    con = connect()
    try:
        links = relationships.detect(con, tables) if len(tables) > 1 else []
    finally:
        con.close()

    wanted = {}
    for fact_id in {l["many"] for l in links}:
        fact = by_id[fact_id]
        joins, used = [], set()
        for l in sorted((l for l in links if l["many"] == fact_id), key=lambda l: -l["coverage"]):
            if l["one"] not in used:
                joins.append((by_id[l["one"]], l))
                used.add(l["one"])
        name = " + ".join([fact["name"], *(d["name"] for d, _ in joins)])
        sql, dim_cols = relationships.model_sql(fact, joins)
        wanted[name] = (sql, {"fact": fact_id, "fact_name": fact["name"], "links": [l for _, l in joins],
                              "dim_columns": dim_cols})

    existing = {m["name"]: m for m in catalog.list_for(owner, "model")}
    for name, m in existing.items():
        if name not in wanted or m["sql"] != wanted[name][0]:
            catalog.delete(m["id"])
    for name, (sql, meta) in wanted.items():
        if name in existing and existing[name]["sql"] == sql:
            continue
        ds = catalog.create(owner, name, "model", "model", "Joined automatically", sql=sql, meta=meta)
        analyze(ds["id"])


def links_for(owner: str) -> list[dict]:
    out = []
    for m in catalog.list_for(owner, "model"):
        out.extend(m["meta"].get("links", []))
    return out
