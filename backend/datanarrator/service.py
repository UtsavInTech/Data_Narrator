"""Orchestration: import sources -> typed Parquet -> profile -> insights -> actions.

Work runs on a bounded thread pool so a burst of uploads cannot starve the API.
For many API replicas, replace the pool with a queue (e.g. Redis + worker).
"""
import logging
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import catalog, config
from .connectors import normalize, sources
from .db import connect, lit
from .engine import actions, insights, profile, relationships

log = logging.getLogger("datanarrator")
_pool = ThreadPoolExecutor(max_workers=config.ANALYSIS_WORKERS, thread_name_prefix="dn-worker")


def relation(ds: dict) -> str:
    if ds["kind"] == "model":
        return ds["sql"]
    return f"read_parquet({lit(str(catalog.data_path(ds['id'])))})"


# ---------------------------------------------------------------- import

def start_import(owner: str, label: str, source_type: str, resolve, cleanup: list[Path] = ()) -> dict:
    """Create a placeholder, then resolve + ingest in the background.

    `resolve(con)` returns [(name, relation_sql, report)] from connectors.sources.
    """
    placeholder = catalog.create(owner, label, "import", source_type, label, status="importing")
    _pool.submit(_run_import, owner, placeholder["id"], label, source_type, resolve, list(cleanup))
    return placeholder


def _run_import(owner, placeholder_id, label, source_type, resolve, cleanup):
    con = connect()
    created = []
    try:
        rels = resolve(con)
        for name, rel, report in rels:
            ds = catalog.create(owner, name, "table", source_type, label, status="processing")
            report = dict(report)
            fallback = report.pop("fallback", None)
            extra = report.pop("_cleanup", None)
            if extra:
                cleanup.append(Path(extra))
            try:
                stats = normalize.write_parquet(con, rel, catalog.data_path(ds["id"]))
            except Exception:
                if not fallback:
                    raise
                stats = normalize.write_parquet(con, fallback, catalog.data_path(ds["id"]))
                report.setdefault("notes", []).append("read every column as text first (mixed types)")
            report.update(stats)
            catalog.save_json(ds["id"], "import_report", report)
            catalog.update(ds["id"], row_count=stats["rows"], column_count=stats["columns"])
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

    for ds_id in created:
        analyze(ds_id)
    refresh_models(owner)


def _friendly(e: Exception) -> str:
    msg = str(e).strip().splitlines()[0] if str(e).strip() else type(e).__name__
    return msg[:400]


# ---------------------------------------------------------------- analysis

def analyze(ds_id: str):
    ds = catalog.get(ds_id)
    if not ds:
        return
    catalog.update(ds_id, status="processing", error=None)
    con = connect()
    try:
        rel = relation(ds)
        rows = con.execute(f"SELECT count(*) FROM {rel}").fetchone()[0]
        prof = profile.profile(con, rel, rows)
        result = insights.generate(con, rel, prof)
        result["actions"] = actions.recommend(result["insights"])
        catalog.save_json(ds_id, "profile", prof)
        catalog.save_json(ds_id, "insights", result)
        catalog.update(ds_id, status="ready", row_count=rows, column_count=len(prof["columns"]))
    except Exception as e:
        log.error("analysis failed for %s: %s", ds_id, traceback.format_exc())
        catalog.update(ds_id, status="error", error=_friendly(e))
    finally:
        con.close()


def reanalyze(ds_id: str):
    catalog.update(ds_id, status="processing")
    _pool.submit(analyze, ds_id)


def refresh_models(owner: str):
    """Rebuild joined models from the current set of tables."""
    tables = []
    for ds in catalog.list_for(owner, "table"):
        prof = catalog.load_json(ds["id"], "profile")
        if ds["status"] == "ready" and prof:
            tables.append({"id": ds["id"], "name": ds["name"], "path": str(catalog.data_path(ds["id"])),
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
        wanted[name] = (relationships.model_sql(fact, joins),
                        {"fact": fact_id, "links": [l for _, l in joins]})

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
