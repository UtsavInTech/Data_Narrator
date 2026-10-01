"""HTTP API. Run: uvicorn datanarrator.api.main:app"""
import datetime as dt
import hashlib
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .. import auth, catalog, config, demo, service
from ..connectors import sources
from ..db import connect, fetch_dicts
from ..mis import entries, reports, rules, scheduler, templates

logging.basicConfig(level=logging.INFO)

# One server = one company workspace. Users belong to it and see it by role.
OWNER = "local"

ANY = auth.require("admin", "manager", "operator")
ADMIN = auth.require("admin")
MANAGERS = auth.require("admin", "manager")
ENTRY = auth.require("admin", "operator")


@asynccontextmanager
async def lifespan(_app):
    catalog.init()
    auth.init()
    entries.init()
    scheduler.init()
    scheduler.start()
    yield


app = FastAPI(title="Data Narrator", version="0.3.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


def _public(ds: dict) -> dict:
    out = {k: ds[k] for k in ("id", "name", "kind", "source_type", "source_label", "row_count",
                              "column_count", "status", "stage", "error", "created_at", "updated_at")}
    out["writeback"] = entries.writeback_enabled(ds["id"])
    out["importance"] = (ds.get("meta") or {}).get("importance", 0)
    return out


def _get(ds_id: str) -> dict:
    ds = catalog.get(ds_id)
    if not ds or ds["owner"] != OWNER:
        raise HTTPException(404, "Table not found")
    return ds


def _table(ds_id: str) -> dict:
    ds = _get(ds_id)
    if ds["kind"] != "table":
        raise HTTPException(400, "Entries and reports work on tables, not joined views")
    # Re-analysis after a commit keeps the previous profile usable; only brand-new tables wait.
    if ds["status"] == "error" or not catalog.load_json(ds_id, "profile"):
        raise HTTPException(409, "This table is still being prepared")
    return ds


@app.get("/api/health")
def health():
    return {"ok": True, "version": app.version}


# ---------------------------------------------------------------- auth & users

class Login(BaseModel):
    employee_id: str
    password: str


class NewUser(BaseModel):
    employee_id: str
    name: str = ""
    password: str
    role: str = "operator"


class UserPatch(BaseModel):
    role: str | None = None
    active: bool | None = None
    password: str | None = None


@app.get("/api/auth/status")
def auth_status():
    return {"setup_needed": auth.setup_needed()}


@app.post("/api/auth/setup")
def auth_setup(body: NewUser):
    """First run only: create the first admin."""
    if not auth.setup_needed():
        raise HTTPException(409, "Already set up")
    auth.create_user(body.employee_id, body.name, body.password, "admin")
    token, user = auth.login(body.employee_id, body.password)
    return {"token": token, "user": user}


@app.post("/api/auth/login")
def auth_login(body: Login):
    token, user = auth.login(body.employee_id, body.password)
    return {"token": token, "user": user}


@app.get("/api/auth/me")
def auth_me(user: dict = Depends(ANY)):
    return {"user": user}


@app.post("/api/auth/logout")
def auth_logout(authorization: str | None = Header(default=None)):
    if authorization and authorization.lower().startswith("bearer "):
        auth.logout(authorization[7:])
    return {"ok": True}


@app.get("/api/users")
def users(_: dict = Depends(ADMIN)):
    return {"users": auth.list_users(), "roles": list(auth.ROLES)}


@app.post("/api/users")
def add_user(body: NewUser, _: dict = Depends(ADMIN)):
    return {"user": auth.create_user(body.employee_id, body.name, body.password, body.role)}


@app.patch("/api/users/{employee_id}")
def edit_user(employee_id: str, body: UserPatch, me: dict = Depends(ADMIN)):
    if employee_id == me["employee_id"] and (body.role not in (None, "admin") or body.active is False):
        raise HTTPException(400, "You can't remove your own admin access")
    auth.update_user(employee_id, body.role, body.active, body.password)
    return {"ok": True}


# ---------------------------------------------------------------- sources

@app.post("/api/sources/upload", status_code=202)
async def upload(files: list[UploadFile] = File(...), user: dict = Depends(ENTRY)):
    started = []
    for f in files:
        name = Path(f.filename or "upload").name
        dest = config.UPLOADS_DIR / f"{uuid.uuid4().hex}{Path(name).suffix.lower()}"
        digest = hashlib.sha256()
        with dest.open("wb") as out:
            while chunk := f.file.read(4 * 1024 * 1024):
                digest.update(chunk)
                out.write(chunk)
        file_hash = digest.hexdigest()
        dup = catalog.find_batch_by_hash(OWNER, file_hash)
        if dup:
            dest.unlink(missing_ok=True)
            when = dt.datetime.fromtimestamp(dup["created_at"]).strftime("%d %b %Y %H:%M")
            raise HTTPException(409, f"{name} was already added to “{dup['ds_name']}” on {when}.")
        started.append(_public(service.start_import(
            OWNER, name, "upload", lambda con, d=dest, n=name: sources.local_relations(con, d, n), [dest],
            file_hash=file_hash, user=user["employee_id"])))
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
def connect_url(body: UrlSource, user: dict = Depends(ADMIN)):
    creds = body.model_dump(exclude={"url", "name"}, exclude_none=True)
    parts = [p for p in body.url.split("?")[0].rstrip("/").split("/") if p and not any(ch in p for ch in "*?[")]
    label = body.name or (parts[-1] if len(parts) > 1 else body.url)
    ds = service.start_import(OWNER, label, "url", lambda con: sources.url_relations(con, body.url, creds),
                              user=user["employee_id"])
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
    allow_writeback: bool = False


@app.post("/api/sources/database", status_code=202)
def connect_database(body: DbSource, user: dict = Depends(ADMIN)):
    spec = body.model_dump(by_alias=True)
    label = f"{body.type}://{body.host}/{body.database}"
    schema = body.schema_ or ("public" if body.type == "postgres" else body.database)

    def keep_connection(ds_id, table_name):
        if body.allow_writeback:
            entries.save_writeback(ds_id, {**{k: spec[k] for k in ("type", "host", "port", "database", "user", "password")},
                                           "schema": schema, "table": table_name})

    ds = service.start_import(OWNER, label, body.type, lambda con: sources.db_relations(con, spec),
                              user=user["employee_id"], on_table=keep_connection)
    return {"imports": [_public(ds)]}


@app.post("/api/demo", status_code=202)
def load_demo(user: dict = Depends(ADMIN)):
    """Load the sample company (Narmada Electricals): five related Excel files, dated up to today."""
    if any(d["source_label"].startswith(demo.COMPANY) for d in catalog.list_for(OWNER)):
        raise HTTPException(409, "The sample company is already loaded")
    folder = config.STORAGE_DIR / "demo" / uuid.uuid4().hex[:8]
    started = []
    for path in demo.write(folder):
        label = f"{demo.COMPANY} · {path.name}"
        started.append(_public(service.start_import(
            OWNER, label, "upload", lambda con, p=path: sources.local_relations(con, p, p.name), [path], user=user["employee_id"])))
    return {"imports": started}


# ---------------------------------------------------------------- datasets

@app.get("/api/datasets")
def list_datasets(_: dict = Depends(ANY)):
    return {"datasets": [_public(d) for d in catalog.list_for(OWNER)], "links": service.links_for(OWNER)}


@app.get("/api/datasets/{ds_id}")
def dataset(ds_id: str, _: dict = Depends(ANY)):
    ds = _get(ds_id)
    return {"dataset": _public(ds), "profile": catalog.load_json(ds_id, "profile"),
            "import_report": catalog.load_json(ds_id, "import_report"),
            "model": ds["meta"] if ds["kind"] == "model" else None,
            "batches": catalog.batches_for(ds_id)}


@app.get("/api/datasets/{ds_id}/insights")
def dataset_insights(ds_id: str, _: dict = Depends(ANY)):
    ds = _get(ds_id)
    res = catalog.load_json(ds_id, "insights")
    if not res:
        raise HTTPException(409, f"Table is {ds['status']}")
    return {"dataset": _public(ds), **res}


@app.get("/api/datasets/{ds_id}/preview")
def preview(ds_id: str, limit: int = 50, offset: int = 0, _: dict = Depends(ANY)):
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
def refresh(ds_id: str, _: dict = Depends(ADMIN)):
    _get(ds_id)
    service.reanalyze(ds_id)
    return {"ok": True}


@app.delete("/api/datasets/{ds_id}")
def remove(ds_id: str, _: dict = Depends(ADMIN)):
    ds = _get(ds_id)
    catalog.delete(ds_id)
    entries.drop_writeback(ds_id)
    if ds["kind"] == "table":
        service.refresh_models(OWNER)
    return {"ok": True}


# ---------------------------------------------------------------- MIS: entry, commit, templates

class Draft(BaseModel):
    data: dict


class Commit(BaseModel):
    employee_id: str
    password: str
    push: bool = False


def _fields(ds: dict) -> list[dict]:
    prof = catalog.load_json(ds["id"], "profile")
    con = connect()
    try:
        return entries.fields_for(con, ds, service.relation(ds), prof)
    finally:
        con.close()


@app.get("/api/mis/tables")
def mis_tables(_: dict = Depends(ANY)):
    out = []
    for ds in catalog.list_for(OWNER, "table"):
        if not catalog.load_json(ds["id"], "profile"):
            continue
        batches = catalog.batches_for(ds["id"])
        with catalog._conn() as c:
            drafts = c.execute("SELECT count(*) FROM entries WHERE ds_id=?", (ds["id"],)).fetchone()[0]
        out.append({**_public(ds), "drafts": drafts, "last_added": batches[0]["created_at"] if batches else None})
    return {"tables": out}


@app.get("/api/mis/reports")
def mis_reports(_: dict = Depends(MANAGERS)):
    return {"reports": reports.list_reports(OWNER)}


@app.get("/api/mis/reports/{ds_id}/{name}")
def mis_report_file(ds_id: str, name: str, _: dict = Depends(MANAGERS)):
    ds = _get(ds_id)
    path = reports.REPORTS_DIR / ds_id / Path(name).name
    if not path.exists():
        raise HTTPException(404, "Report not found")
    return FileResponse(path, filename=f"{ds['name'][:60]} {path.stem}.xlsx")


@app.get("/api/mis/{ds_id}/form")
def mis_form(ds_id: str, _: dict = Depends(ANY)):
    ds = _table(ds_id)
    return {"dataset": _public(ds), "fields": _fields(ds)}


@app.get("/api/mis/{ds_id}/entries")
def mis_entries(ds_id: str, _: dict = Depends(ENTRY)):
    return {"entries": entries.drafts(_table(ds_id))}


@app.post("/api/mis/{ds_id}/entries")
def mis_add(ds_id: str, body: Draft, user: dict = Depends(ENTRY)):
    return entries.save_draft(_table(ds_id), body.data, user)


@app.put("/api/mis/{ds_id}/entries/{entry_id}")
def mis_edit(ds_id: str, entry_id: str, body: Draft, user: dict = Depends(ENTRY)):
    return entries.save_draft(_table(ds_id), body.data, user, entry_id)


@app.delete("/api/mis/{ds_id}/entries/{entry_id}")
def mis_delete(ds_id: str, entry_id: str, _: dict = Depends(ENTRY)):
    entries.delete_draft(ds_id, entry_id)
    return {"ok": True}


@app.post("/api/mis/{ds_id}/commit")
def mis_commit(ds_id: str, body: Commit, _: dict = Depends(ENTRY)):
    employee = auth.verify(body.employee_id, body.password)  # confirm who is committing
    return entries.commit(_table(ds_id), employee, body.push)


@app.get("/api/mis/{ds_id}/template.xlsx")
def mis_template(ds_id: str, _: dict = Depends(ANY)):
    ds = _table(ds_id)
    data = templates.build(ds["name"], _fields(ds))
    filename = f"{ds['name'][:60]} template.xlsx".replace('"', "")
    return Response(data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ---------------------------------------------------------------- MIS: daily reports

class Schedule(BaseModel):
    at_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    which_day: str = Field(pattern="^(today|yesterday)$")
    enabled: bool


def _reportable(ds_id: str) -> dict:
    ds = _get(ds_id)
    if ds["kind"] == "import" or not catalog.load_json(ds_id, "profile"):
        raise HTTPException(409, "This table is still being prepared")
    return ds


@app.get("/api/mis/{ds_id}/daily-report")
def mis_daily_screen(ds_id: str, date: str | None = None, user: dict = Depends(MANAGERS)):
    """The daily report as data, to read on screen."""
    ds = _reportable(ds_id)
    rep = reports.compute(ds, dt.date.fromisoformat(date) if date else None, user["name"])
    return reports.for_screen(rep)


@app.get("/api/mis/{ds_id}/daily-report.xlsx")
def mis_daily(ds_id: str, date: str | None = None, user: dict = Depends(MANAGERS)):
    ds = _reportable(ds_id)
    day = dt.date.fromisoformat(date) if date else None
    path, day = reports.build(ds, day, user["name"])
    return FileResponse(path, filename=f"{ds['name'][:60]} {day:%d-%m-%Y}.xlsx")


@app.get("/api/mis/{ds_id}/schedule")
def mis_schedule(ds_id: str, _: dict = Depends(MANAGERS)):
    _reportable(ds_id)
    return scheduler.get(ds_id)


@app.put("/api/mis/{ds_id}/schedule")
def mis_set_schedule(ds_id: str, body: Schedule, _: dict = Depends(MANAGERS)):
    _reportable(ds_id)
    return scheduler.put(ds_id, body.at_time, body.which_day, body.enabled)


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
