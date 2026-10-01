"""Daily MIS report as an Excel workbook, in the shape MIS teams already send.

Sheets: Summary (today vs previous day vs same day last week, month to date),
one "By <category>" sheet per main dimension (with a totals row), the day's
rows, and Checks (problems found in the day's data).
A table with a date column is cut by that date; one without uses the batches
added that day.
"""
import datetime as dt
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from .. import catalog, config, service
from ..db import connect, lit, q
from ..engine.insights import pick_dims, pick_measures, pick_time

REPORTS_DIR = config.STORAGE_DIR / "reports"
MAX_ROWS = 50_000

_HEAD = PatternFill("solid", fgColor="27272A")
_TOTAL = PatternFill("solid", fgColor="F4F4F5")
_LINE = Border(bottom=Side(style="thin", color="E4E4E7"))
_NUM = "#,##0.##"


def _sheet_table(ws, start_row: int, headers: list[str], rows: list[list], total: list | None = None):
    for c, h in enumerate(headers, 1):
        cell = ws.cell(row=start_row, column=c, value=h)
        cell.font, cell.fill = Font(bold=True, color="FFFFFF"), _HEAD
        cell.alignment = Alignment(vertical="center")
    for r, row in enumerate(rows, start_row + 1):
        for c, v in enumerate(row, 1):
            cell = ws.cell(row=r, column=c, value=v)
            cell.border = _LINE
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                cell.number_format = _NUM
            elif isinstance(v, dt.datetime):
                cell.number_format = "DD-MM-YYYY" if v.time() == dt.time() else "DD-MM-YYYY HH:MM"
            elif isinstance(v, dt.date):
                cell.number_format = "DD-MM-YYYY"
    if total:
        r = start_row + len(rows) + 1
        for c, v in enumerate(total, 1):
            cell = ws.cell(row=r, column=c, value=v)
            cell.font, cell.fill = Font(bold=True), _TOTAL
            if isinstance(v, (int, float)):
                cell.number_format = _NUM
    for c in range(1, len(headers) + 1):
        width = max([len(str(headers[c - 1]))] + [len(f"{row[c - 1]:,.2f}" if isinstance(row[c - 1], float) else str(row[c - 1] or ""))
                                                   for row in rows[:500]])
        ws.column_dimensions[get_column_letter(c)].width = min(max(width + 2, 10), 45)


def _pct(a, b):
    return None if not b else (a - b) / abs(b)


def build(ds: dict, day: dt.date | None, generated_by: str) -> tuple[Path, dt.date]:
    prof = catalog.load_json(ds["id"], "profile")
    if not prof:
        raise ValueError("This table is still being analysed")
    con = connect()
    try:
        rel = service.relation(ds)
        tcol = pick_time(prof)
        measures = pick_measures(prof)
        dims = pick_dims(prof)[:3]

        if tcol and tcol["subtype"] != "year":
            dexpr = f"CAST({q(tcol['name'])} AS DATE)"
            src = rel
            basis = f"by {tcol['name']}"
        else:  # no date column: rows from the batches added each day
            dexpr = "CAST(to_timestamp(__added) AS DATE)"
            parts = {b["part"]: b["created_at"] for b in catalog.batches_for(ds["id"])}
            cases = " ".join(f"WHEN filename LIKE {lit('%' + p)} THEN {t}" for p, t in parts.items()) or "WHEN true THEN 0"
            src = (f"(SELECT * EXCLUDE (filename), CASE {cases} END AS __added FROM read_parquet("
                   f"{lit(catalog.data_glob(ds['id']))}, union_by_name=true, filename=true))")
            basis = "by the day rows were added"

        if day is None:
            day = con.execute(f"SELECT max({dexpr}) FROM {src}").fetchone()[0] or dt.date.today()
        prev = con.execute(f"SELECT max({dexpr}) FROM {src} WHERE {dexpr} < ?", [day]).fetchone()[0]
        week_ago = day - dt.timedelta(days=7)
        month_start = day.replace(day=1)

        def agg_sql(m):
            return f"{'avg' if m['agg'] == 'avg' else 'sum'}({q(m['name'])})"

        metric_sql = ["count(*)"] + [agg_sql(m) for m in measures]
        labels = ["Rows"] + [f"{m['name']} ({'average' if m['agg'] == 'avg' else 'total'})" for m in measures]

        def window(where: str, args: list):
            return con.execute(f"SELECT {', '.join(metric_sql)} FROM {src} WHERE {where}", args).fetchone()

        today_v = window(f"{dexpr} = ?", [day])
        prev_v = window(f"{dexpr} = ?", [prev]) if prev else [None] * len(labels)
        week_v = window(f"{dexpr} = ?", [week_ago])
        mtd_v = window(f"{dexpr} BETWEEN ? AND ?", [month_start, day])

        wb = Workbook()
        ws = wb.active
        ws.title = "Summary"
        ws["A1"] = f"{ds['name']} - Daily report"
        ws["A1"].font = Font(bold=True, size=14)
        ws["A2"] = f"{day:%A, %d %B %Y}  ·  {basis}  ·  generated {dt.datetime.now():%d %b %Y %H:%M} by {generated_by}"
        ws["A2"].font = Font(color="71717A")
        prev_label = f"Previous ({prev:%d %b})" if prev else "Previous"
        rows = []
        for i, lab in enumerate(labels):
            t, p, w, m = (float(x[i]) if x[i] is not None else None for x in (today_v, prev_v, week_v, mtd_v))
            ch = _pct(t or 0, p)
            rows.append([lab, t, p, f"{ch:+.1%}" if ch is not None else "", w, m])
        _sheet_table(ws, 4, ["Metric", f"{day:%d %b %Y}", prev_label, "Change", f"Same day last week ({week_ago:%d %b})",
                             "Month to date"], rows)

        # Highlights in plain words.
        notes, r = [], 6 + len(rows)
        if day == dt.date.today():
            notes.append("Today is still in progress: figures will grow as entries come in.")
        # Follow-up: groups (branches, stores…) that sent data on the previous day but not this day.
        if prev and dims:
            dn = q(dims[0]["name"])
            missing = [m[0] for m in con.execute(
                f"SELECT DISTINCT CAST({dn} AS VARCHAR) FROM {src} WHERE {dexpr} = ? AND {dn} IS NOT NULL"
                f" EXCEPT SELECT DISTINCT CAST({dn} AS VARCHAR) FROM {src} WHERE {dexpr} = ? ORDER BY 1", [prev, day]).fetchall()]
            if missing:
                notes.append(f"No data yet from {len(missing)} {dims[0]['name']}: {', '.join(missing[:10])}.")
                missing_line = [dims[0]["name"], "No data this day: " + ", ".join(missing[:20]), len(missing)]
            else:
                missing_line = None
        else:
            missing_line = None
        if (today_v[0] or 0) == 0:
            notes.append(f"No rows for {day:%d %b %Y}.")
        elif prev:
            ch = _pct(today_v[0], prev_v[0])
            if ch is not None and abs(ch) >= 0.2:
                notes.append(f"{'More' if ch > 0 else 'Fewer'} rows than {prev:%d %b}: {today_v[0]:,} vs {prev_v[0]:,}.")
            for i, m in enumerate(measures, 1):
                ch = _pct(float(today_v[i] or 0), float(prev_v[i] or 0))
                if ch is not None and abs(ch) >= 0.1:
                    notes.append(f"{m['name']} {'up' if ch > 0 else 'down'} {abs(ch):.0%} vs {prev:%d %b}.")

        # By-dimension sheets.
        for d in dims:
            dn = q(d["name"])
            res = con.execute(
                f"SELECT CAST({dn} AS VARCHAR), {', '.join(f'{s} FILTER (WHERE {dexpr} = ?)' for s in metric_sql)},"
                f" {', '.join(f'{s} FILTER (WHERE {dexpr} = ?)' for s in metric_sql)} FROM {src}"
                f" WHERE {dexpr} IN (?, ?) GROUP BY 1 ORDER BY 3 DESC NULLS LAST",
                [day] * len(metric_sql) + [prev or day] * len(metric_sql) + [day, prev or day]).fetchall()
            k = len(metric_sql)
            body = []
            for row in res:
                label, today_part, prev_part = row[0] or "(blank)", row[1:1 + k], row[1 + k:]
                line = [label]
                for i in range(k):
                    tv, pv = today_part[i], prev_part[i]
                    line += [float(tv) if tv is not None else 0, float(pv) if pv is not None else 0]
                body.append(line)
            if not body:
                continue
            heads = [d["name"]]
            for lab in labels:
                heads += [f"{lab} {day:%d %b}", f"{lab} {prev:%d %b}" if prev else f"{lab} prev"]
            total = ["Total"] + [sum(row[c] for row in body) if "average" not in heads[c] else None
                                 for c in range(1, len(heads))]
            sh = wb.create_sheet(f"By {d['name']}"[:31])
            _sheet_table(sh, 1, heads, body, total)
            sh.freeze_panes = "B2"
            if measures and measures[0]["agg"] == "sum" and len(body) > 1:
                leader = max(body, key=lambda row: row[3])
                notes.append(f"Top {d['name']} today: {leader[0]} ({measures[0]['name']} {leader[3]:,.0f}).")

        # The day's rows.
        cur = con.execute(f"SELECT * EXCLUDE (__added) FROM {src} WHERE {dexpr} = ? LIMIT {MAX_ROWS}" if src != rel
                          else f"SELECT * FROM {src} WHERE {dexpr} = ? LIMIT {MAX_ROWS}", [day])
        heads = [c[0] for c in cur.description]
        data = [list(r) for r in cur.fetchall()]
        sh = wb.create_sheet("Rows")
        _sheet_table(sh, 1, heads, data)
        sh.freeze_panes = "A2"
        if data:
            sh.auto_filter.ref = f"A1:{get_column_letter(len(heads))}{len(data) + 1}"

        # Checks on the day's rows.
        checks = []
        for c in prof["columns"]:
            cn = q(c["name"])
            if c["role"] == "measure" and c["min"] is not None and float(c["min"]) >= 0:
                n = con.execute(f"SELECT count(*) FROM {src} WHERE {dexpr} = ? AND {cn} < 0", [day]).fetchone()[0]
                if n:
                    checks.append([c["name"], "Negative values", n])
            if c["null_pct"] == 0:
                n = con.execute(f"SELECT count(*) FROM {src} WHERE {dexpr} = ? AND {cn} IS NULL", [day]).fetchone()[0]
                if n:
                    checks.append([c["name"], "Missing values", n])
            if c["role"] == "dimension":
                new = con.execute(
                    f"SELECT DISTINCT CAST({cn} AS VARCHAR) FROM {src} WHERE {dexpr} = ? AND {cn} IS NOT NULL"
                    f" AND {cn} NOT IN (SELECT {cn} FROM {src} WHERE {dexpr} < ? AND {cn} IS NOT NULL) LIMIT 10",
                    [day, day]).fetchall()
                if new and prev:
                    checks.append([c["name"], "New values: " + ", ".join(v[0] for v in new), len(new)])
            if c["role"] == "id":
                n = con.execute(f"SELECT count(*) - count(DISTINCT {cn}) FROM {src} WHERE {dexpr} = ?", [day]).fetchone()[0]
                if n:
                    checks.append([c["name"], "Duplicate IDs", n])
        if missing_line:
            checks.insert(0, missing_line)
        sh = wb.create_sheet("Checks")
        _sheet_table(sh, 1, ["Column", "Problem", "Rows"], checks or [["-", "No problems found", 0]])
        if checks:
            notes.append(f"{len(checks)} data check(s) need attention: see the Checks sheet.")

        ws.cell(row=r, column=1, value="Highlights").font = Font(bold=True, size=12)
        for i, n in enumerate(notes or ["Nothing unusual."], 1):
            ws.cell(row=r + i, column=1, value=f"•  {n}")
        ws.column_dimensions["A"].width = 34
    finally:
        con.close()

    out_dir = REPORTS_DIR / ds["id"]
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{day:%Y-%m-%d}.xlsx"
    wb.save(path)
    return path, day


def list_reports(owner: str) -> list[dict]:
    names = {d["id"]: d["name"] for d in catalog.list_for(owner)}
    out = []
    for p in REPORTS_DIR.glob("*/*.xlsx"):
        if p.parent.name in names:
            out.append({"ds_id": p.parent.name, "dataset": names[p.parent.name], "date": p.stem,
                        "file": f"{p.parent.name}/{p.name}", "created_at": p.stat().st_mtime})
    return sorted(out, key=lambda r: (r["date"], r["created_at"]), reverse=True)
