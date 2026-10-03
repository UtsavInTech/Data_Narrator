"""Sample companies anyone can try, each in its own workspace with one login per role.

The accounts and password are public (shown on the front page), so a sample
workspace never holds real data and can't be changed in ways that would break
it for the next visitor. Data is regenerated so it always ends today; anything
visitors record is cleared when that happens.
"""
import datetime as dt
import logging
import shutil
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import pandas as pd
from fastapi import HTTPException

from .. import auth, catalog, config, service
from ..connectors import sources
from . import dairy, logistics, narmada

log = logging.getLogger("datanarrator.demos")

PASSWORD = "demo123"
PREFIX = "demo-"


@dataclass(frozen=True)
class Company:
    slug: str
    name: str
    industry: str
    place: str
    about: str
    generate: Callable[..., dict[str, pd.DataFrame]]
    accounts: tuple[tuple[str, str, str, str], ...] = field(default=())  # employee ID, name, role, job

    @property
    def workspace(self) -> str:
        return PREFIX + self.slug


COMPANIES = {c.slug: c for c in (
    Company("dairy", dairy.COMPANY, "Dairy", "Erode, Tamil Nadu",
            "Buys milk from 18 village collection centres twice a day and makes paneer, curd, cheese, ghee and "
            "butter for 70 distributors across South India.", dairy.generate,
            (("BVD-ADMIN", "Senthil Kumar", "admin", "Managing Director"),
             ("BVD-MANAGER", "Lakshmi Narayanan", "manager", "Sales & Plant Manager"),
             ("BVD-ENTRY", "Karthik Raja", "operator", "MIS Executive"))),
    Company("narmada", narmada.COMPANY, "Electricals distributor", "Pune, Maharashtra",
            "Supplies lights, fans, switchgear and wires to 90 shops and contractors in six cities.", narmada.generate,
            (("NE-ADMIN", "Anil Kulkarni", "admin", "Owner"),
             ("NE-MANAGER", "Meera Joshi", "manager", "Branch Manager"),
             ("NE-ENTRY", "Sagar More", "operator", "Billing Executive"))),
    Company("logistics", logistics.COMPANY, "Transport & logistics", "Pune, Maharashtra",
            "Runs 18 trucks on full-load routes across Maharashtra, Gujarat and Karnataka for 18 manufacturers.",
            logistics.generate,
            (("SRL-ADMIN", "Harpreet Singh", "admin", "Founder"),
             ("SRL-MANAGER", "Neha Deshpande", "manager", "Operations Manager"),
             ("SRL-ENTRY", "Imran Shaikh", "operator", "Trip & Fuel Clerk"))),
)}
DEFAULT = "narmada"
_lock = threading.Lock()


def is_demo(workspace: str) -> bool:
    return workspace.startswith(PREFIX)


def company_for(workspace: str) -> Company | None:
    return COMPANIES.get(workspace[len(PREFIX):]) if is_demo(workspace) else None


def guard(workspace: str, what: str = "This"):
    """Refuse changes that would spoil a sample company for the next visitor."""
    if is_demo(workspace):
        raise HTTPException(403, f"{what} is turned off in the sample companies. In your own workspace it works as normal.")


def public() -> list[dict]:
    """What the front page shows: companies and their logins."""
    return [{"slug": c.slug, "name": c.name, "industry": c.industry, "place": c.place, "about": c.about,
             "accounts": [{"employee_id": e, "name": n, "role": r, "job": j} for e, n, r, j in c.accounts]}
            for c in COMPANIES.values()]


def write(company: Company, folder: Path, today: dt.date | None = None) -> list[Path]:
    """Write a sample company as Excel workbooks, one per table."""
    folder.mkdir(parents=True, exist_ok=True)
    out = []
    for name, frame in company.generate(today).items():
        path = folder / f"{name}.xlsx"
        with pd.ExcelWriter(path, engine="openpyxl") as xl:
            frame.to_excel(xl, sheet_name=name[:31], index=False)
        out.append(path)
    return out


def load(company: Company, owner: str, user: str) -> list[dict]:
    """Start importing a sample company's files into a workspace."""
    folder = config.STORAGE_DIR / "demo" / owner / dt.date.today().isoformat()
    shutil.rmtree(folder, ignore_errors=True)
    started = []
    for path in write(company, folder):
        label = f"{company.name} · {path.name}"
        started.append(service.start_import(owner, label, "upload",
                                            lambda con, p=path: sources.local_relations(con, p, p.name), [path], user=user))
    return started


def _accounts(company: Company):
    for emp, name, role, _ in company.accounts:
        try:
            auth.create_user(emp, name, PASSWORD, role, company.workspace)
        except HTTPException:  # already there: make sure nobody has locked it or changed its role
            try:
                auth.update_user(emp, role=role, active=True, workspace=company.workspace)
            except HTTPException:
                log.warning("Employee ID %s is taken outside the sample company", emp)


def ensure(slug: str) -> Company:
    """Accounts exist and the data ends today. Cheap when nothing needs doing."""
    company = COMPANIES.get(slug)
    if not company:
        raise HTTPException(404, "No such sample company")
    with _lock:
        _accounts(company)
        mine = catalog.list_for(company.workspace)
        loaded = {dt.date.fromtimestamp(d["created_at"]) for d in mine if d["kind"] != "model"}
        if mine and loaded == {dt.date.today()}:
            return company
        if any(d["status"] in ("importing", "processing") for d in mine) and dt.date.today() in loaded:
            return company
        for d in mine:  # stale (yesterday's "today") or missing: start fresh
            catalog.delete(d["id"])
        load(company, company.workspace, company.accounts[0][0])
    return company


def ensure_all():
    """Run at startup in the background, so the logins on the front page always work."""
    def run():
        for slug in COMPANIES:
            try:
                ensure(slug)
            except Exception:
                log.exception("could not prepare sample company %s", slug)
    threading.Thread(target=run, name="dn-demos", daemon=True).start()
