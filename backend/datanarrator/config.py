"""Runtime settings, all overridable with DN_* environment variables."""
import os
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent

STORAGE_DIR = Path(os.environ.get("DN_STORAGE_DIR", _BACKEND / "storage"))
DATASETS_DIR = STORAGE_DIR / "datasets"
UPLOADS_DIR = STORAGE_DIR / "uploads"
CATALOG_PATH = STORAGE_DIR / "catalog.sqlite"

# Profiling runs on a reservoir sample above this size; aggregates always use full data.
PROFILE_SAMPLE_ROWS = int(os.environ.get("DN_PROFILE_SAMPLE_ROWS", 1_000_000))
DUCKDB_MEMORY_LIMIT = os.environ.get("DN_DUCKDB_MEMORY_LIMIT", "4GB")
DUCKDB_THREADS = int(os.environ.get("DN_DUCKDB_THREADS", os.cpu_count() or 4))
ANALYSIS_WORKERS = int(os.environ.get("DN_ANALYSIS_WORKERS", 2))

# Ambiguous dates like 03-04-2018 are read day-first (India/UK) unless disabled.
DAYFIRST = os.environ.get("DN_DAYFIRST", "true").lower() == "true"

FRONTEND_DIST = Path(os.environ.get("DN_FRONTEND_DIST", _BACKEND.parent / "frontend" / "dist"))
# Shown in the app for the real workspace.
COMPANY_NAME = os.environ.get("DN_COMPANY_NAME", "")
# Where people open the app; used for the link at the end of the morning brief.
PUBLIC_URL = os.environ.get("DN_PUBLIC_URL", "")
# The sample companies (with public logins) shown on the front page. Turn off for a private install.
DEMOS = os.environ.get("DN_DEMOS", "true").lower() == "true"
CORS_ORIGINS = os.environ.get("DN_CORS_ORIGINS", "*").split(",")

for d in (DATASETS_DIR, UPLOADS_DIR, STORAGE_DIR / "tmp"):
    d.mkdir(parents=True, exist_ok=True)
