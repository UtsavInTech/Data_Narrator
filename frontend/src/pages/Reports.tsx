import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, fileUrl, type DailyReport, type ReportFile } from "../api";
import { btnCls, Button, Empty, ErrorNote, Field, inputCls, PageHeader, Panel, Section, Sheet, Spinner } from "../components/ui";
import { fmtFull, longDate } from "../format";
import { useData } from "../state";

const short = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "–");

function Change({ v }: { v: number | null }) {
  if (v == null) return <span className="text-faint">–</span>;
  return <span className={v >= 0 ? "text-good" : "text-bad"}>{v >= 0 ? "+" : "−"}{Math.abs(v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0)}%</span>;
}

function ScheduleSheet({ open, onClose, tableId }: { open: boolean; onClose: () => void; tableId: string }) {
  const [s, setS] = useState({ at_time: "09:00", which_day: "yesterday", enabled: false });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !tableId) return;
    setSaved(false);
    api.schedule(tableId).then((x) => setS({ at_time: x.at_time, which_day: x.which_day, enabled: !!x.enabled })).catch(() => undefined);
  }, [open, tableId]);
  return (
    <Sheet open={open} onClose={onClose} title="Make this report every day">
      <p className="text-[14px] text-mute mb-5">The report is created at this time each day and listed under Recent reports.</p>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Time"><input className={inputCls} type="time" value={s.at_time} onChange={(e) => setS({ ...s, at_time: e.target.value })} /></Field>
        <Field label="Report covers">
          <select className={inputCls} value={s.which_day} onChange={(e) => setS({ ...s, which_day: e.target.value })}>
            <option value="yesterday">Yesterday</option>
            <option value="today">Today</option>
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-3 mb-5 text-[14px]">
        <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} className="w-5 h-5 accent-[#1c1b19]" />
        Create it automatically
      </label>
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}
      <Button className="w-full" onClick={async () => { try { await api.setSchedule(tableId, s); setSaved(true); } catch (e) { setError((e as Error).message); } }}>
        {saved ? "Saved" : "Save"}
      </Button>
    </Sheet>
  );
}

export default function Reports() {
  const { datasets, loading } = useData();
  const choices = useMemo(() => datasets.filter((d) => d.status === "ready" && d.kind !== "import")
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0)), [datasets]);
  const [tableId, setTableId] = useState("");
  const [date, setDate] = useState("");
  const [rep, setRep] = useState<DailyReport | null>(null);
  const [files, setFiles] = useState<ReportFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sched, setSched] = useState(false);

  useEffect(() => { if (!tableId && choices[0]) setTableId(choices[0].id); }, [choices, tableId]);
  useEffect(() => { api.reports().then((r) => setFiles(r.reports)).catch(() => undefined); }, []);
  useEffect(() => {
    if (!tableId) return;
    setBusy(true);
    setError(null);
    api.dailyReport(tableId, date || undefined).then(setRep).catch((e: Error) => { setError(e.message); setRep(null); }).finally(() => setBusy(false));
  }, [tableId, date]);

  if (loading) return <Spinner />;
  const header = <PageHeader title="Daily report" description="One day of business at a glance: how it compares with the day before, each branch or salesperson, and anything that needs checking." />;
  if (!choices.length) return <>{header}<Empty title="No data yet" text="Reports are available once data has been added." /></>;

  const excel = fileUrl(`/api/mis/${tableId}/daily-report.xlsx${rep ? `?date=${rep.day}` : ""}`);
  return (
    <>
      {header}
      <div className="flex flex-wrap items-end gap-3 mb-10">
        <div className="w-full sm:w-72">
          <span className="block text-[13px] text-mute mb-1.5">Data</span>
          <select className={inputCls} value={tableId} onChange={(e) => { setTableId(e.target.value); setDate(""); }}>
            {choices.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="w-full sm:w-52">
          <span className="block text-[13px] text-mute mb-1.5">Day</span>
          <input className={inputCls} type="date" value={date || rep?.day || ""} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="ghost" onClick={() => setSched(true)}>Every day…</Button>
          <a href={excel} className={btnCls("primary")} onClick={() => setTimeout(() => api.reports().then((r) => setFiles(r.reports)), 1500)}>
            <Download size={16} /> Download Excel
          </a>
        </div>
      </div>

      {error && <ErrorNote message={error} />}
      {busy && !rep && <Spinner label="Preparing the report" />}
      {rep && (
        <div className={busy ? "opacity-60 transition-opacity" : ""}>
          <div className="mb-8">
            <h2 className="text-[22px] font-semibold tracking-[-0.01em]">{longDate(rep.day)}</h2>
            <p className="text-[14px] text-mute mt-1">{rep.dataset} · {rep.basis}{rep.previous_day ? ` · compared with ${short(rep.previous_day)}` : ""}</p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-x-12 gap-y-10">
            <div className="min-w-0">
              <Section title="Numbers for the day">
                <Panel className="overflow-x-auto">
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr className="text-left text-[12px] text-mute">
                        <th className="font-medium px-5 py-3" />
                        <th className="font-medium px-4 py-3 text-right">{short(rep.day)}</th>
                        <th className="font-medium px-4 py-3 text-right">{short(rep.previous_day)}</th>
                        <th className="font-medium px-4 py-3 text-right">Change</th>
                        <th className="font-medium px-4 py-3 text-right">Same day last week</th>
                        <th className="font-medium px-5 py-3 text-right">Month to date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rep.metrics.map((m) => (
                        <tr key={m.label} className="border-t border-line">
                          <td className="px-5 py-3 font-medium whitespace-nowrap">{m.label}{m.kind === "avg" ? " (avg)" : ""}</td>
                          <td className="px-4 py-3 text-right num font-semibold">{fmtFull(m.today, m.label)}</td>
                          <td className="px-4 py-3 text-right num text-ink-2">{fmtFull(m.previous, m.label)}</td>
                          <td className="px-4 py-3 text-right num"><Change v={m.change} /></td>
                          <td className="px-4 py-3 text-right num text-ink-2">{fmtFull(m.week_ago, m.label)}</td>
                          <td className="px-5 py-3 text-right num text-ink-2">{m.month_to_date == null ? "–" : fmtFull(m.month_to_date, m.label)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              </Section>

              {rep.groups.map((g) => (
                <Section key={g.dimension} title={`By ${g.dimension}`}>
                  <Panel className="overflow-x-auto">
                    <table className="w-full text-[14px]">
                      <thead>
                        <tr className="text-left text-[12px] text-mute">
                          {g.headers.map((h, i) => <th key={h} className={`font-medium px-4 py-3 whitespace-nowrap ${i ? "text-right" : "pl-5"}`}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((r, ri) => (
                          <tr key={ri} className="border-t border-line">
                            {r.map((v, i) => (
                              <td key={i} className={`px-4 py-2.5 num ${i ? "text-right" : "pl-5 font-medium"} ${i % 2 === 1 && i > 1 ? "text-mute" : ""}`}>
                                {typeof v === "number" ? (g.money[i] ? fmtFull(v, "amount") : v.toLocaleString("en-IN")) : v}
                              </td>
                            ))}
                          </tr>
                        ))}
                        <tr className="border-t border-line-2 bg-sunken/50 font-semibold">
                          {g.total.map((v, i) => (
                            <td key={i} className={`px-4 py-2.5 num ${i ? "text-right" : "pl-5"}`}>
                              {typeof v === "number" ? (g.money[i] ? fmtFull(v, "amount") : v.toLocaleString("en-IN")) : v}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </Panel>
                </Section>
              ))}

              {rep.rows.data.length > 0 && (
                <Section title={`The day's ${rep.metrics[0]?.label.toLowerCase() ?? "rows"}`} action={<span className="text-[13px] text-mute">{rep.rows.total > rep.rows.data.length ? `First ${rep.rows.data.length} of ${rep.rows.total}; all in the Excel file` : `${rep.rows.total}`}</span>}>
                  <Panel className="overflow-x-auto max-h-[28rem]">
                    <table className="text-[13px] whitespace-nowrap w-full">
                      <thead className="sticky top-0 bg-surface"><tr className="text-left text-mute">{rep.rows.columns.map((c) => <th key={c} className="font-medium px-4 py-2.5">{c}</th>)}</tr></thead>
                      <tbody>
                        {rep.rows.data.map((r, i) => (
                          <tr key={i} className="border-t border-line">
                            {r.map((v, j) => <td key={j} className={`px-4 py-2 num ${typeof v === "number" ? "text-right" : ""}`}>{v == null ? <span className="text-faint">–</span> : typeof v === "number" ? fmtFull(v, rep.rows.columns[j]) : String(v).replace("T00:00:00", "")}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Panel>
                </Section>
              )}
            </div>

            <aside className="space-y-8">
              <div>
                <div className="label mb-3">Highlights</div>
                <Panel className="p-5">
                  <ul className="space-y-3 text-[14.5px] leading-relaxed text-ink-2">
                    {rep.highlights.map((h, i) => <li key={i} className="flex gap-2.5"><span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-ink shrink-0" />{h}</li>)}
                  </ul>
                </Panel>
              </div>
              <div>
                <div className="label mb-3">Checks</div>
                <Panel className="divide-y divide-line">
                  {rep.checks.length === 0 && <div className="px-5 py-4 text-[14px] text-good">No problems found in this day's data.</div>}
                  {rep.checks.map((c, i) => (
                    <div key={i} className="px-5 py-3.5 text-[14px]">
                      <div className="font-medium">{c.column}</div>
                      <div className="text-[13px] text-bad mt-0.5">{c.problem}{c.rows > 1 && !c.problem.includes(":") ? ` (${c.rows})` : ""}</div>
                    </div>
                  ))}
                </Panel>
              </div>
              <div>
                <div className="label mb-3">Recent reports</div>
                <Panel className="divide-y divide-line">
                  {!files.length && <div className="px-5 py-4 text-[14px] text-mute">Downloaded and scheduled reports are kept here.</div>}
                  {files.slice(0, 8).map((f) => (
                    <a key={f.file} href={fileUrl(`/api/mis/reports/${f.file}`)} className="flex items-center gap-3 px-5 h-12 text-[14px] hover:bg-sunken/60">
                      <span className="flex-1 truncate">{f.dataset}</span>
                      <span className="text-[13px] text-mute num">{short(f.date)}</span>
                      <Download size={14} className="text-mute" />
                    </a>
                  ))}
                </Panel>
              </div>
            </aside>
          </div>
        </div>
      )}
      <ScheduleSheet open={sched} onClose={() => setSched(false)} tableId={tableId} />
    </>
  );
}
