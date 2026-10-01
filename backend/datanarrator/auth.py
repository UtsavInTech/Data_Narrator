"""Employees, roles and sessions. Login is Employee ID + password.

Roles (what the app shows is decided by these):
  admin     everything: data sources, users, schedules
  manager   insights and daily reports
  operator  data entry and templates
"""
import hashlib
import hmac
import secrets
import time

from fastapi import Depends, Header, HTTPException, Query

from . import catalog

ROLES = ("admin", "manager", "operator")
SESSION_DAYS = 30
_ITERATIONS = 200_000

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    employee_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    pw_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    expires_at REAL NOT NULL
);
"""


def init():
    with catalog._lock, catalog._conn() as con:
        con.executescript(SCHEMA)


def _hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITERATIONS).hex()
    return f"{salt}${digest}"


def _check(password: str, stored: str) -> bool:
    salt, _ = stored.split("$", 1)
    return hmac.compare_digest(_hash(password, salt), stored)


def _public(r) -> dict:
    return {"employee_id": r["employee_id"], "name": r["name"], "role": r["role"], "active": bool(r["active"])}


def setup_needed() -> bool:
    with catalog._conn() as con:
        return con.execute("SELECT count(*) FROM users").fetchone()[0] == 0


def create_user(employee_id: str, name: str, password: str, role: str) -> dict:
    employee_id = employee_id.strip()
    if role not in ROLES:
        raise HTTPException(400, f"Role must be one of {', '.join(ROLES)}")
    if not employee_id or len(password) < 6:
        raise HTTPException(400, "Employee ID is required and the password needs at least 6 characters")
    with catalog._lock, catalog._conn() as con:
        if con.execute("SELECT 1 FROM users WHERE lower(employee_id)=lower(?)", (employee_id,)).fetchone():
            raise HTTPException(409, f"Employee ID {employee_id} already exists")
        con.execute("INSERT INTO users VALUES (?,?,?,?,1,?)",
                    (employee_id, name.strip() or employee_id, role, _hash(password), time.time()))
    return {"employee_id": employee_id, "name": name.strip() or employee_id, "role": role, "active": True}


def list_users() -> list[dict]:
    with catalog._conn() as con:
        return [_public(r) for r in con.execute("SELECT * FROM users ORDER BY created_at").fetchall()]


def update_user(employee_id: str, role: str | None = None, active: bool | None = None, password: str | None = None):
    sets, args = [], []
    if role is not None:
        if role not in ROLES:
            raise HTTPException(400, "Unknown role")
        sets.append("role=?"); args.append(role)
    if active is not None:
        sets.append("active=?"); args.append(int(active))
    if password:
        if len(password) < 6:
            raise HTTPException(400, "Password needs at least 6 characters")
        sets.append("pw_hash=?"); args.append(_hash(password))
    if not sets:
        return
    with catalog._lock, catalog._conn() as con:
        con.execute(f"UPDATE users SET {', '.join(sets)} WHERE employee_id=?", (*args, employee_id))
        if active is False or password:
            con.execute("DELETE FROM sessions WHERE employee_id=?", (employee_id,))


def verify(employee_id: str, password: str) -> dict:
    """Check Employee ID + password. Used for login and to confirm a commit."""
    with catalog._conn() as con:
        r = con.execute("SELECT * FROM users WHERE lower(employee_id)=lower(?)", ((employee_id or "").strip(),)).fetchone()
    if not r or not r["active"] or not _check(password or "", r["pw_hash"]):
        raise HTTPException(401, "Wrong Employee ID or password")
    return _public(r)


def login(employee_id: str, password: str) -> tuple[str, dict]:
    user = verify(employee_id, password)
    token = secrets.token_urlsafe(32)
    with catalog._lock, catalog._conn() as con:
        con.execute("DELETE FROM sessions WHERE expires_at < ?", (time.time(),))
        con.execute("INSERT INTO sessions VALUES (?,?,?)",
                    (token, user["employee_id"], time.time() + SESSION_DAYS * 86400))
    return token, user


def logout(token: str):
    with catalog._lock, catalog._conn() as con:
        con.execute("DELETE FROM sessions WHERE token=?", (token,))


def _from_token(token: str | None) -> dict:
    if not token:
        raise HTTPException(401, "Please log in")
    with catalog._conn() as con:
        r = con.execute("SELECT u.* FROM sessions s JOIN users u ON u.employee_id = s.employee_id"
                        " WHERE s.token=? AND s.expires_at > ? AND u.active=1", (token, time.time())).fetchone()
    if not r:
        raise HTTPException(401, "Session expired. Please log in again")
    return _public(r)


def current_user(authorization: str | None = Header(default=None), token: str | None = Query(default=None)) -> dict:
    """Bearer token from the header, or ?token= for plain download links."""
    bearer = authorization[7:] if authorization and authorization.lower().startswith("bearer ") else None
    return _from_token(bearer or token)


def require(*roles: str):
    def dep(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, "Your role doesn't allow this")
        return user
    return dep
