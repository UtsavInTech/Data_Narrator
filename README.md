# Data Narrator

Point it at any Excel file, cloud folder or database. It works out what every column means, finds what matters, and explains it in plain words, with no setup and no column mapping.

- **Reads real-world Excel.** It handles title rows, merged cells, two-row headers, several tables per sheet, subtotal/"Grand Total" rows, `₹1,234` and `(500)` stored as text, report-style grouping, months laid out as columns (turned into rows), and the same layout repeated on many sheets (stacked into one table). Every decision is shown under **Data → How we read it**.
- **Works with any schema.** Each column gets a role (number, category, date, name, ID) from its values, not its name. Insights are generated from those roles.
- **Joins tables automatically.** Shared keys like `Order ID` are detected, and related tables are combined.
- **Insights and next steps.** It produces trends, breakdowns, top performers, relationships, unusual values and data-quality issues, ranked by importance, plus a prioritised **What to do** list.
- **Daily MIS work.** It provides:
    - entry forms generated from each table, with dropdowns, limits and duplicate checks
    - drafts that are only saved when an employee **commits with Employee ID + password**, with optional write-back to the source PostgreSQL/MySQL database
    - same-layout sheets appended to the same table, with history of who added what and when
    - a **daily Excel report** (today vs previous day vs last week, month to date, per-branch sheets, checks, missing submissions), on demand or scheduled
    - blank **Excel templates** with dropdowns
- **Simple roles.** Operators see Entry. Managers see insights and reports. Admins see everything plus data sources and employees.
- **Scales.** Built on DuckDB and Parquet. 100 million rows were analysed in about 23 s on an 8 GB laptop.
- **Self-hosted.** One Docker container. Your data stays on your servers.

## Run it

**Docker (recommended: on-premise or any cloud VM)**

```bash
docker compose up --build
# open http://localhost:8000
```

**From source**

```bash
# backend
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn datanarrator.api.main:app --reload       # http://localhost:8000

# frontend (dev server on :5173, proxies /api to :8000)
cd frontend && npm install && npm run dev
```

On first open, create the admin account (Employee ID + password), then add employees under **Settings**.

Try it with the files in `samples/`. `Daily Branch Sales.xlsx` is a daily MIS sheet for testing entry and reports. `Sharma Traders FY25.xlsx` is a deliberately messy company workbook.

**Android app**

```bash
cd frontend
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug        # needs JDK 21+ and the Android SDK (ANDROID_HOME)
# → android/app/build/outputs/apk/debug/app-debug.apk   (install: adb install -r app-debug.apk)
```

Or run `npm run android` to open the project in Android Studio. On first launch the app asks for the server address, e.g. `192.168.1.20:8000` on your network, or `10.0.2.2:8000` from the Android emulator to a server on the same computer.

**Databases when running in Docker:** a database on the same machine is reachable at `host.docker.internal`, not `localhost`.

## Data sources

| Source | How |
|---|---|
| Excel `.xlsx .xlsm .xls .xlsb .ods`, CSV/TSV, Parquet, JSON | Upload (several at once; related files get joined) |
| Google Sheets / Drive, OneDrive, SharePoint, Dropbox | Paste the share link |
| Amazon S3, Google Cloud Storage, Azure Blob, Cloudflare R2, MinIO | `s3://bucket/path/*.parquet` + keys |
| PostgreSQL, MySQL | Host, database, user (read-only snapshot; password not stored) |

## How it works

```
source ─► normalise to typed Parquet ─► profile (column roles) ─► detect joins ─► insights ─► actions
          (Excel parser, ₹/date fixes)   (one SUMMARIZE pass)     (key overlap)    (GROUPING SETS,
                                                                                     trends, Pareto…)
```

| Path | What |
|---|---|
| `backend/datanarrator/connectors/excel.py` | Excel understanding |
| `backend/datanarrator/connectors/normalize.py` | Text → numbers/dates |
| `backend/datanarrator/engine/profile.py` | Column roles |
| `backend/datanarrator/engine/insights.py` | Insight generation and ranking |
| `backend/datanarrator/engine/actions.py` | "What to do" rules |
| `backend/datanarrator/engine/relationships.py` | Automatic joins |
| `frontend/src` | React app (web + Android via Capacitor) |

Tests: `cd backend && pytest`

## Configuration

Settings are environment variables: `DN_STORAGE_DIR`, `DN_DUCKDB_MEMORY_LIMIT` (default `4GB`), `DN_ANALYSIS_WORKERS` (default `2`), `DN_PROFILE_SAMPLE_ROWS`, `DN_DAYFIRST` (default `true`: `03-04-2018` is 3 April), `DN_CORS_ORIGINS`.

## Roadmap

- [ ] Report delivery by email / WhatsApp
- [ ] Downloads inside the Android app (native file saving)
- [ ] Scheduled refresh of cloud and database sources (live data)
- [ ] Ask questions in plain language (optional LLM, cloud or local)
- [ ] Narration in Hindi, Bengali, Tamil, Telugu and more
- [ ] Postgres catalog + job queue for many API replicas

## License

MIT
