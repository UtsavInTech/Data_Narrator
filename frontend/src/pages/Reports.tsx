import { Download, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { api, fileUrl, type MisTable, type ReportFile } from "../api";
import { Button, Card, Empty, ErrorNote, Field, inputCls, PageTitle, Spinner } from "../components/ui";

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
    api.misTables().then((r) => {
      setTables(r.tables);
      if (r.tables[0]) setTableId(r.tables[0].id);
    }).catch((e: Error) => setError(e.message));
    loadFiles();
  }, []);

  useEffect(() => {
    if (!tableId) return;
    setSaved(false);
    api.schedule(tableId).then((s) => setSched({ at_time: s.at_time, which_day: s.which_day, enabled: !!s.enabled })).catch(() => undefined);
  }, [tableId]);

  const saveSchedule = async () => {
    setError(null);
    try {
      await api.setSchedule(tableId, sched);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!tables && !error) return <Spinner />;
  if (tables && !tables.length) return <Empty icon={<FileSpreadsheet size={28} />} title="No tables yet" text="Reports appear once data has been added." />;
  const reportLink = fileUrl(`/api/mis/${tableId}/daily-report.xlsx${date ? `?date=${date}` : ""}`);

  return (
    <>
      <PageTitle title="Daily reports" subtitle="Excel, in the format your team already uses." />
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Card className="p-5">
          <h2 className="text-[17px] font-semibold mb-4">Get a report</h2>
          <Field label="Table">
            <select className={inputCls} value={tableId} onChange={(e) => setTableId(e.target.value)}>
              {tables?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Day" hint="Leave empty for the latest day with data.">
            <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <a href={reportLink} onClick={() => setTimeout(loadFiles, 1500)}
            className="min-h-12 px-5 rounded-xl text-[16px] font-medium inline-flex items-center justify-center gap-2 bg-ink text-white w-full">
            <Download size={18} /> Download Excel
          </a>
        </Card>

        <Card className="p-5">
          <h2 className="text-[17px] font-semibold mb-1">Every day, automatically</h2>
          <p className="text-[14px] text-mute mb-4">The report is made at this time and kept below for download.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Time"><input className={inputCls} type="time" value={sched.at_time} onChange={(e) => setSched({ ...sched, at_time: e.target.value })} /></Field>
            <Field label="Covers">
              <select className={inputCls} value={sched.which_day} onChange={(e) => setSched({ ...sched, which_day: e.target.value })}>
                <option value="yesterday">Yesterday</option>
                <option value="today">Today</option>
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-3 min-h-12 mb-3 text-[15px]">
            <input type="checkbox" checked={sched.enabled} onChange={(e) => setSched({ ...sched, enabled: e.target.checked })} className="w-5 h-5 accent-zinc-900" />
            On
          </label>
          <Button variant="secondary" className="w-full" onClick={saveSchedule}>{saved ? "Saved" : "Save schedule"}</Button>
        </Card>
      </div>

      <h2 className="text-[18px] font-semibold mt-8 mb-3">Recent reports</h2>
      {!files.length && <Card className="p-5 text-[15px] text-mute">None yet.</Card>}
      {files.length > 0 && (
        <Card className="divide-y divide-line">
          {files.slice(0, 30).map((f) => (
            <a key={f.file} href={fileUrl(`/api/mis/reports/${f.file}`)} className="flex items-center gap-3 px-4 min-h-14">
              <FileSpreadsheet size={20} className="text-ink-2" />
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-medium truncate">{f.dataset}</span>
                <span className="block text-[13px] text-mute">{new Date(f.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
              </span>
              <Download size={18} className="text-mute" />
            </a>
          ))}
        </Card>
      )}
    </>
  );
}
