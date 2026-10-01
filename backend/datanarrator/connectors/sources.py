"""Resolve any source into (name, relation SQL, report) triples on a DuckDB connection.

Supported: local CSV/TSV/TXT, Excel (all flavours), Parquet, JSON; remote files
over HTTPS (incl. Google Drive/Sheets, Dropbox, OneDrive share links), S3,
Google Cloud Storage, Azure Blob, Cloudflare R2 (globs allowed); PostgreSQL and
MySQL databases. Data is snapshotted to Parquet, so analysis never loads the source.
"""
import re
import uuid
from pathlib import Path

from .. import config
from ..db import lit, q
from .excel import EXCEL_EXTS, parse_workbook

TEXT_EXTS = {".csv", ".tsv", ".txt"}
JSON_EXTS = {".json", ".jsonl", ".ndjson"}
MAX_DB_TABLES = 100


def _csv(path: str, all_varchar: bool = False) -> str:
    opts = "sample_size=100000, null_padding=true"
    if all_varchar:
        opts += ", all_varchar=true"
    return f"read_csv({lit(path)}, {opts})"


def _sniff(path: Path) -> str:
    head = path.read_bytes()[:8]
    if head.startswith(b"PK"):
        return ".xlsx"
    if head.startswith(b"\xd0\xcf\x11\xe0"):
        return ".xls"
    if head.startswith(b"PAR1"):
        return ".parquet"
    if head.lstrip()[:1] in (b"{", b"["):
        return ".json"
    return ".csv"


def local_relations(con, path: Path, filename: str) -> list[tuple[str, str, dict]]:
    ext = Path(filename).suffix.lower() or _sniff(path)
    stem = Path(filename).stem or "data"
    if ext in EXCEL_EXTS:
        out = []
        tables = parse_workbook(path)
        for t in tables:
            # Excel's default sheet names say nothing; use the file name instead.
            if re.fullmatch(r"(sheet|blad|feuil|hoja)\s*\d*", t.name.strip(), re.I):
                t.name = stem if len(tables) == 1 else f"{stem} - {t.name}"
            view = f"xl_{uuid.uuid4().hex[:8]}"
            con.register(view, t.frame)
            out.append((t.name, view, {"format": "excel", **t.report}))
        if not out:
            raise ValueError("No tables found in this workbook.")
        return out
    if ext in TEXT_EXTS:
        return [(stem, _csv(str(path)), {"format": "csv", "fallback": _csv(str(path), True)})]
    if ext == ".parquet":
        return [(stem, f"read_parquet({lit(str(path))})", {"format": "parquet"})]
    if ext in JSON_EXTS:
        return [(stem, f"read_json_auto({lit(str(path))})", {"format": "json"})]
    raise ValueError(f"Unsupported file type '{ext}'. Use Excel, CSV, Parquet or JSON.")


# ---------------------------------------------------------------- cloud / URL

def rewrite_share_link(url: str) -> str:
    """Turn browser share links into direct-download links."""
    m = re.search(r"docs\.google\.com/spreadsheets/d/([\w-]+)", url)
    if m:
        return f"https://docs.google.com/spreadsheets/d/{m.group(1)}/export?format=xlsx"
    m = re.search(r"drive\.google\.com/(?:file/d/|open\?id=|uc\?.*id=)([\w-]+)", url)
    if m:
        return f"https://drive.google.com/uc?export=download&id={m.group(1)}"
    if "dropbox.com" in url:
        return re.sub(r"[?&]dl=0", "", url) + ("&" if "?" in url else "?") + "dl=1"
    if ("1drv.ms" in url or "sharepoint.com" in url or "onedrive.live.com" in url) and "download=1" not in url:
        return url + ("&" if "?" in url else "?") + "download=1"
    return url


def _configure_cloud(con, url: str, creds: dict):
    con.execute("INSTALL httpfs; LOAD httpfs;")
    scheme = url.split("://", 1)[0].lower()
    if scheme in ("s3", "s3a") and creds.get("key_id"):
        parts = [f"KEY_ID {lit(creds['key_id'])}", f"SECRET {lit(creds.get('secret', ''))}",
                 f"REGION {lit(creds.get('region') or 'us-east-1')}"]
        if creds.get("endpoint"):  # MinIO, SeaweedFS, Ceph... often plain http on-premise
            endpoint = creds["endpoint"].strip().rstrip("/")
            secure = not endpoint.lower().startswith("http://")
            endpoint = re.sub(r"^https?://", "", endpoint, flags=re.I)
            parts += [f"ENDPOINT {lit(endpoint)}", "URL_STYLE 'path'", f"USE_SSL {str(secure).lower()}"]
        con.execute(f"CREATE OR REPLACE SECRET src_s3 (TYPE s3, {', '.join(parts)})")
    elif scheme in ("gs", "gcs") and creds.get("key_id"):
        con.execute(f"CREATE OR REPLACE SECRET src_gcs (TYPE gcs, KEY_ID {lit(creds['key_id'])},"
                    f" SECRET {lit(creds.get('secret', ''))})")
    elif scheme == "r2":
        con.execute(f"CREATE OR REPLACE SECRET src_r2 (TYPE r2, KEY_ID {lit(creds.get('key_id', ''))},"
                    f" SECRET {lit(creds.get('secret', ''))}, ACCOUNT_ID {lit(creds.get('account_id', ''))})")
    elif scheme in ("az", "azure", "abfss"):
        con.execute("INSTALL azure; LOAD azure;")
        if creds.get("connection_string"):
            con.execute(f"CREATE OR REPLACE SECRET src_az (TYPE azure,"
                        f" CONNECTION_STRING {lit(creds['connection_string'])})")


def url_relations(con, url: str, creds: dict | None = None) -> list[tuple[str, str, dict]]:
    url = rewrite_share_link(url.strip())
    _configure_cloud(con, url, creds or {})
    path_part = url.split("?", 1)[0]
    ext = Path(path_part).suffix.lower()
    name = Path(path_part).stem or "remote data"
    is_glob = any(ch in path_part for ch in "*?[")
    is_http = url.lower().startswith(("http://", "https://"))

    # Stream large columnar/text files straight from object storage.
    if not is_http or is_glob:
        if ext == ".parquet":
            return [(name, f"read_parquet({lit(url)})", {"format": "parquet", "source": url})]
        if ext in TEXT_EXTS:
            return [(name, _csv(url), {"format": "csv", "source": url, "fallback": _csv(url, True)})]
        if ext in JSON_EXTS:
            return [(name, f"read_json_auto({lit(url)})", {"format": "json", "source": url})]

    # Everything else (Excel, share links, single HTTPS files): download, then read locally.
    blob = con.execute(f"SELECT content FROM read_blob({lit(url)})").fetchone()[0]
    tmp = config.UPLOADS_DIR / f"dl_{uuid.uuid4().hex}"
    tmp.write_bytes(blob)
    real_ext = ext if ext in EXCEL_EXTS | TEXT_EXTS | JSON_EXTS | {".parquet"} else _sniff(tmp)
    local = tmp.with_suffix(real_ext)
    tmp.rename(local)
    rels = local_relations(con, local, name + real_ext)
    for _, _, report in rels:
        report["source"] = url
        report["_cleanup"] = str(local)
    return rels


# ---------------------------------------------------------------- databases

def db_relations(con, spec: dict) -> list[tuple[str, str, dict]]:
    kind = spec["type"]
    host, port = spec.get("host", "localhost"), spec.get("port")
    database, user, password = spec.get("database", ""), spec.get("user", ""), spec.get("password", "")
    con.execute(f"INSTALL {kind}; LOAD {kind};")
    if kind == "postgres":
        dsn = f"host={host} port={port or 5432} dbname={database} user={user} password={password}"
        schema = spec.get("schema") or "public"
    elif kind == "mysql":
        dsn = f"host={host} port={port or 3306} database={database} user={user} password={password}"
        schema = spec.get("schema") or database
    else:
        raise ValueError(f"Unsupported database type '{kind}'")
    con.execute(f"ATTACH {lit(dsn)} AS src (TYPE {kind}, READ_ONLY)")

    wanted = [t.strip() for t in spec.get("tables") or [] if t.strip()]
    if not wanted:
        wanted = [r[0] for r in con.execute(
            "SELECT table_name FROM duckdb_tables() WHERE database_name='src' AND schema_name=?"
            " UNION SELECT view_name FROM duckdb_views() WHERE database_name='src' AND schema_name=?"
            " ORDER BY 1", [schema, schema]).fetchall()][:MAX_DB_TABLES]
    if not wanted:
        raise ValueError(f"No tables found in schema '{schema}'.")
    label = f"{kind}://{host}/{database}"
    return [(t, f"src.{q(schema)}.{q(t)}", {"format": kind, "source": f"{label}.{schema}.{t}"})
            for t in wanted]
