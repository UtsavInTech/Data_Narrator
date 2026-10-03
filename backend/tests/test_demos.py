"""Sample companies: generators, separate workspaces, public logins that can't be spoiled."""
import datetime as dt
import time

import pytest
from fastapi.testclient import TestClient

from datanarrator import catalog, config, demos
from datanarrator.api.main import app


@pytest.mark.parametrize("slug", list(demos.COMPANIES))
def test_generators_end_today_and_have_dates(slug):
    tables = demos.COMPANIES[slug].generate(dt.date(2026, 10, 2))
    assert len(tables) >= 5 and all(len(t) > 0 for t in tables.values())
    dates = [c for t in tables.values() for c in t.columns if "Date" in c]
    assert dates, "each sample needs dated activity for the story and the daily report"


def test_dairy_has_the_patterns_it_promises():
    t = demos.dairy.generate(dt.date(2026, 10, 2))
    milk = t["Milk Collection"]
    sep = milk[milk["Collection Date"] >= dt.date(2026, 9, 1)]
    weak, rest = sep[sep.Centre == "Kodumudi"]["Fat %"].mean(), sep[sep.Centre != "Kodumudi"]["Fat %"].mean()
    assert weak < rest - 0.25
    assert t["Invoices"]["Vehicle"].nunique() <= 26


@pytest.fixture(scope="module")
def client():
    config.DEMOS = True
    with TestClient(app) as c:
        yield c
    config.DEMOS = False


def _wait(workspace):
    for _ in range(600):
        ds = catalog.list_for(workspace)
        if ds and all(d["status"] in ("ready", "error") for d in ds) and any(d["kind"] == "model" for d in ds):
            return ds
        time.sleep(0.1)
    raise AssertionError(f"{workspace} not ready")


def test_sample_login_by_role_and_isolation(client):
    companies = client.get("/api/demo/companies").json()["companies"]
    assert {c["slug"] for c in companies} == set(demos.COMPANIES)

    r = client.post("/api/demo/try", json={"company": "dairy", "role": "manager"}).json()
    assert r["user"]["demo"] and r["user"]["company"] == demos.dairy.COMPANY and r["user"]["role"] == "manager"
    dairy = {"Authorization": f"Bearer {r['token']}"}
    _wait("demo-dairy")

    # The public password works on the normal login too.
    assert client.post("/api/auth/login", json={"employee_id": "BVD-ENTRY", "password": demos.PASSWORD}).status_code == 200

    names = {d["name"] for d in client.get("/api/datasets", headers=dairy).json()["datasets"]}
    assert "Milk Collection" in names and "Trips" not in names  # nothing from another company

    other = catalog.list_for("demo-narmada") or [None]
    if other[0]:
        assert client.get(f"/api/datasets/{other[0]['id']}", headers=dairy).status_code == 404

    ov = client.get("/api/overview", headers=dairy).json()
    assert {a["name"] for a in ov["areas"]} >= {"Milk Collection", "Invoices"}
    assert any("Kodumudi" in a["title"] for a in ov["actions"])

    # Sample companies don't count as the real company being set up.
    from datanarrator import auth
    assert auth.setup_needed() == (not auth.list_users())


def test_samples_cannot_be_spoiled(client):
    admin = {"Authorization": "Bearer " + client.post("/api/demo/try", json={"company": "dairy", "role": "admin"}).json()["token"]}
    assert client.post("/api/users", headers=admin, json={"employee_id": "X1", "password": "secret123"}).status_code == 403
    assert client.patch("/api/users/BVD-MANAGER", headers=admin, json={"active": False}).status_code == 403
    assert client.post("/api/sources/url", headers=admin, json={"url": "http://169.254.169.254/"}).status_code == 403
    ds = next(d for d in catalog.list_for("demo-dairy") if d["kind"] == "table")
    assert client.delete(f"/api/datasets/{ds['id']}", headers=admin).status_code == 403
    users = client.get("/api/users", headers=admin).json()["users"]
    assert {u["employee_id"] for u in users} == {"BVD-ADMIN", "BVD-MANAGER", "BVD-ENTRY"}


def test_morning_brief(client):
    mgr = {"Authorization": "Bearer " + client.post("/api/demo/try", json={"company": "dairy", "role": "manager"}).json()["token"]}
    _wait("demo-dairy")
    b = client.get("/api/brief", headers=mgr).json()
    assert b["text"].startswith("*Bhavani Valley Dairy · Morning brief*")
    assert "Kodumudi" in b["text"] and "Act on today" in b["text"]
    assert any(a["area"] == "Milk Collection" for a in b["areas"])
    assert "<table" in b["html"]
    # Sample companies never send anything, and managers can't change who gets it.
    admin = {"Authorization": "Bearer " + client.post("/api/demo/try", json={"company": "dairy", "role": "admin"}).json()["token"]}
    assert client.post("/api/brief/send", headers=admin).status_code == 403
    assert client.put("/api/brief/settings", headers=mgr, json={"at_time": "07:00"}).status_code == 403


def test_brief_send_without_channels_says_what_is_missing():
    from datanarrator import brief
    brief.init()
    brief.put("local-test", "07:00", "owner@example.com", "+91 90000 00000", True)
    res = brief.send("local-test", "Test Co")["results"]
    assert [r["ok"] for r in res] == [False, False]
    assert "DN_SMTP_HOST" in res[0]["error"] and "DN_WHATSAPP_TOKEN" in res[1]["error"]
