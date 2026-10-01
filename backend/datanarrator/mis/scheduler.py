"""Generate daily reports at a set time. One background thread, checked every minute."""
import datetime as dt
import logging
import threading
import time

from .. import catalog
from . import reports

log = logging.getLogger("datanarrator.scheduler")

SCHEMA = """
CREATE TABLE IF NOT EXISTS schedules (
    ds_id TEXT PRIMARY KEY,
    at_time TEXT NOT NULL,          -- HH:MM, server local time
    which_day TEXT NOT NULL,        -- today | yesterday
    enabled INTEGER NOT NULL,
    last_run TEXT                   -- YYYY-MM-DD
);
"""
_started = False


def init():
    with catalog._lock, catalog._conn() as con:
        con.executescript(SCHEMA)


def get(ds_id: str) -> dict:
    with catalog._conn() as con:
        r = con.execute("SELECT * FROM schedules WHERE ds_id=?", (ds_id,)).fetchone()
    return dict(r) if r else {"ds_id": ds_id, "at_time": "09:00", "which_day": "yesterday", "enabled": 0, "last_run": None}


def put(ds_id: str, at_time: str, which_day: str, enabled: bool) -> dict:
    with catalog._lock, catalog._conn() as con:
        con.execute("INSERT INTO schedules (ds_id, at_time, which_day, enabled) VALUES (?,?,?,?)"
                    " ON CONFLICT(ds_id) DO UPDATE SET at_time=excluded.at_time, which_day=excluded.which_day,"
                    " enabled=excluded.enabled", (ds_id, at_time, which_day, int(enabled)))
    return get(ds_id)


def run_due(now: dt.datetime | None = None):
    now = now or dt.datetime.now()
    with catalog._conn() as con:
        due = [dict(r) for r in con.execute("SELECT * FROM schedules WHERE enabled=1").fetchall()]
    for s in due:
        if s["last_run"] == now.date().isoformat() or now.strftime("%H:%M") < s["at_time"]:
            continue
        ds = catalog.get(s["ds_id"])
        if not ds or ds["status"] != "ready":
            continue
        day = now.date() - dt.timedelta(days=1 if s["which_day"] == "yesterday" else 0)
        try:
            reports.build(ds, day, "schedule")
        except Exception:
            log.exception("scheduled report failed for %s", s["ds_id"])
        with catalog._lock, catalog._conn() as con:
            con.execute("UPDATE schedules SET last_run=? WHERE ds_id=?", (now.date().isoformat(), s["ds_id"]))


def start():
    global _started
    if _started:
        return
    _started = True

    def loop():
        while True:
            try:
                run_due()
            except Exception:
                log.exception("scheduler tick failed")
            time.sleep(60)

    threading.Thread(target=loop, name="dn-scheduler", daemon=True).start()
