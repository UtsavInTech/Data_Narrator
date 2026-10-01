import { Download, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { api, fileUrl, type MisTable, type ReportFile } from "../api";
import { btnCls, Button, Empty, ErrorNote, Field, inputCls, PageHeader, Panel, Section, Spinner } from "../components/ui";

export default function Reports() {
  const [tables, setTables] = useState<MisTable[] | null>(null);
  const [tableId, setTableId] = useState("");
  const [date, setDate] = useState("");
  const [files, setFiles] = useState<ReportFile[]>([]);
  const [sched, setSched] = useState({ at_time: "09:00", which_day: "yesterday", enabled: false });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = () => api.reports().then((r) => setFiles(r.reports)).catch(() => undefined);
  useEffect(() => {
    api.misTables().then((r) => { setTables(r.tables); if (r.tables[0]) setTableId(r.tables[0].id); }).catch((e: Error) => setError(e.message));
    loadFiles();
  }, []);
  useEffect(() => {
    if (!tableId) return;
    setSaved(false);
    api.schedule(tableId).then((s) => setSched({ at_time: s.at_time, which_day: s.which_day, enabled: !!s.enabled })).catch(() => undefined);
  }, [tableId]);

  const saveSchedule = async () => {
    setError(null);
    try { await api.setSchedule(tableId, sched); setSaved(true); } catch (e) { setError((e as Error).message); }
  };

  if (!tables && !error) return <Spinner />;
  const header = <PageHeader title="Daily reports" description="An Excel report for any day: totals vs the day before, a sheet per branch or category, and anything that needs checking." />;
  if (tables && !tables.length) return <>{header}<Empty title="No tables yet" text="Reports become available once data has been added." /></>;
  const link = fileUrl(`/api/mis/${tableId}/daily-report.xlsx${date ? `?date=${date}` : ""}`);

  return (
    <>
      {header}
      {error && <div className="mb-6"><ErrorNote message={error} /></div>}
      <div className="grid lg:grid-cols-2 gap-6 mb-10">
        <Panel className="p-5 sm:p-6">
          <h2 className="text-[16px] font-semibold mb-5">Download a report</h2>
          <Field label="Table">
            <select className={inputCls} value={tableId} onChange={(e) => setTableId(e.target.value)}>
              {tables?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Day" hint="Empty = the latest day that has data.">
            <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <a href={link} onClick={() => setTimeout(loadFiles, 1500)} className={`${btnCls("primary")} w-full`}><Download size={17} /> Download Excel</a>
        </Panel>

        <Panel className="p-5 sm:p-6">
          <h2 className="text-[16px] font-semibold mb-1">Make it every day</h2>
          <p className="text-[14px] text-mute mb-5">The report for the chosen table is created at this time and listed below.</p>
          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Time"><input className={inputCls} type="time" value={sched.at_time} onChange={(e) => setSched({ ...sched, at_time: e.target.value })} /></Field>
            <Field label="Report covers">
              <select className={inputCls} value={sched.which_day} onChange={(e) => setSched({ ...sched, which_day: e.target.value })}>
                <option value="yesterday">Yesterday</option>
                <option value="today">Today</option>
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-3 mb-5 text-[14px]">
            <input type="checkbox" checked={sched.enabled} onChange={(e) => setSched({ ...sched, enabled: e.target.checked })} className="w-5 h-5 accent-[#1c1b19]" />
            Create this report automatically
          </label>
          <Button variant="secondary" className="w-full" onClick={saveSchedule}>{saved ? "Saved" : "Save"}</Button>
        </Panel>
      </div>

      <Section title="Recent reports">
        {!files.length ? <Panel className="p-5 text-[14px] text-mute">Reports you download or schedule are kept here.</Panel> : (
          <Panel className="divide-y divide-line overflow-hidden">
            {files.slice(0, 30).map((f) => (
              <a key={f.file} href={fileUrl(`/api/mis/reports/${f.file}`)} className="flex items-center gap-4 px-5 h-14 hover:bg-sunken/60">
                <FileSpreadsheet size={18} className="text-mute shrink-0" />
                <span className="flex-1 min-w-0 truncate text-[14px] font-medium">{f.dataset}</span>
                <span className="text-[13px] text-mute num">{new Date(f.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
                <Download size={16} className="text-mute" />
              </a>
            ))}
          </Panel>
        )}
      </Section>
    </>
  );
}
