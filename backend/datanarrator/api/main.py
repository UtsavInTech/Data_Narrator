"""HTTP API. Run: uvicorn datanarrator.api.main:app"""
import logging
import shutil
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .. import catalog, config, service
from ..connectors import sources
from ..db import connect, fetch_dicts

logging.basicConfig(level=logging.INFO)

# Until login exists every request belongs to one local workspace.
OWNER = "local"


@asynccontextmanager
async def lifespan(_app):
    catalog.init()
    yield


app = FastAPI(title="Data Narrator", version="0.2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


def _public(ds: dict) -> dict:
    return {k: ds[k] for k in ("id", "name", "kind", "source_type", "source_label", "row_count",
                               "column_count", "status", "error", "created_at", "updated_at")}


def _get(ds_id: str) -> dict:
    ds = catalog.get(ds_id)
    if not ds or ds["owner"] != OWNER:
        raise HTTPException(404, "Dataset not found")
    return ds


@app.get("/api/health")
def health():
    return {"ok": True, "version": app.version}


# ---------------------------------------------------------------- sources

@app.post("/api/sources/upload", status_code=202)
async def upload(files: list[UploadFile] = File(...)):
    started = []
    for f in files:
        name = Path(f.filename or "upload").name
        dest = config.UPLOADS_DIR / f"{uuid.uuid4().hex}{Path(name).suffix.lower()}"
        with dest.open("wb") as out:
            shutil.copyfileobj(f.file, out, length=4 * 1024 * 1024)
        started.append(_public(service.start_import(
            OWNER, name, "upload", lambda con, d=dest, n=name: sources.local_relations(con, d, n), [dest])))
    return {"imports": started}


class UrlSource(BaseModel):
    url: str
    name: str | None = None
    key_id: str | None = None
    secret: str | None = None
    region: str | None = None
    endpoint: str | None = None
    account_id: str | None = None
    connection_string: str | None = None


@app.post("/api/sources/url", status_code=202)
def connect_url(body: UrlSource):
    creds = body.model_dump(exclude={"url", "name"}, exclude_none=True)
    parts = [p for p in body.url.split("?")[0].rstrip("/").split("/") if p and not any(ch in p for ch in "*?[")]
    label = body.name or (parts[-1] if len(parts) > 1 else body.url)
    ds = service.start_import(OWNER, label, "url", lambda con: sources.url_relations(con, body.url, creds))
    return {"imports": [_public(ds)]}


class DbSource(BaseModel):
    type: str = Field(pattern="^(postgres|mysql)$")
    host: str
    port: int | None = None
    database: str
    user: str
    password: str = ""
    schema_: str | None = Field(default=None, alias="schema")
    tables: list[str] = []


@app.post("/api/sources/database", status_code=202)
def connect_database(body: DbSource):
    spec = body.model_dump(by_alias=True)
    label = f"{body.type}://{body.host}/{body.database}"
    ds = service.start_import(OWNER, label, body.type, lambda con: sources.db_relations(con, spec))
    return {"imports": [_public(ds)]}


# ---------------------------------------------------------------- datasets

@app.get("/api/datasets")
def list_datasets():
    return {"datasets": [_public(d) for d in catalog.list_for(OWNER)], "links": service.links_for(OWNER)}


@app.get("/api/datasets/{ds_id}")
def dataset(ds_id: str):
    ds = _get(ds_id)
    return {"dataset": _public(ds), "profile": catalog.load_json(ds_id, "profile"),
            "import_report": catalog.load_json(ds_id, "import_report"),
            "model": ds["meta"] if ds["kind"] == "model" else None}


@app.get("/api/datasets/{ds_id}/insights")
def dataset_insights(ds_id: str):
    ds = _get(ds_id)
    res = catalog.load_json(ds_id, "insights")
    if not res:
        raise HTTPException(409, f"Dataset is {ds['status']}")
    return {"dataset": _public(ds), **res}


@app.get("/api/datasets/{ds_id}/preview")
def preview(ds_id: str, limit: int = 50, offset: int = 0):
    ds = _get(ds_id)
    if ds["kind"] == "import":
        raise HTTPException(409, "Still importing")
    con = connect()
    try:
        rel = service.relation(ds)
        rows = fetch_dicts(con, f"SELECT * FROM {rel} LIMIT {min(limit, 500)} OFFSET {max(offset, 0)}")
        cols = [r[0] for r in con.execute(f"DESCRIBE SELECT * FROM {rel}").fetchall()]
    finally:
        con.close()
    return {"columns": cols, "rows": rows}


@app.post("/api/datasets/{ds_id}/refresh", status_code=202)
def refresh(ds_id: str):
    _get(ds_id)
    service.reanalyze(ds_id)
    return {"ok": True}


@app.delete("/api/datasets/{ds_id}")
def remove(ds_id: str):
    ds = _get(ds_id)
    catalog.delete(ds_id)
    if ds["kind"] == "table":
        service.refresh_models(OWNER)
    return {"ok": True}


# ---------------------------------------------------------------- web app (built frontend)

if config.FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = config.FRONTEND_DIST / path
        if path and f.is_file() and config.FRONTEND_DIST in f.resolve().parents:
            return FileResponse(f)
        # Never cache the shell, so clients pick up new builds immediately.
        return FileResponse(config.FRONTEND_DIST / "index.html", headers={"Cache-Control": "no-cache"})
