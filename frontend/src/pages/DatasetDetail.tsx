import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Column, type DatasetDetail as Detail, type InsightsResponse } from "../api";
import { Button, ErrorNote, PageHeader, Panel, Section, Segmented, Sheet, Spinner, Stepper } from "../components/ui";
import { fmt } from "../format";
import { useData } from "../state";

const ROLE: Record<Column["role"], string> = {
  measure: "Amount / number", dimension: "Category", time: "Date", entity: "Name", id: "ID",
  text: "Description", empty: "Empty", constant: "Same on every row", attribute: "Detail from a linked table", other: "Other",
};

const n = (v: string | null) => (v == null || isNaN(Number(v)) ? v ?? "–" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const day = (v: string | null) => {
  const t = v ? new Date(String(v).replace(" ", "T")) : null;
  return t && !isNaN(t.getTime()) ? t.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : v ?? "–";
};

function describe(c: Column) {
  if (c.role === "measure") return `${c.agg === "avg" ? "Averaged" : "Added up"} · ${n(c.min)} to ${n(c.max)}`;
  if (c.role === "time") return c.subtype === "year" ? `${c.min} to ${c.max}` : `${day(c.min)} to ${day(c.max)}`;
  if (c.role === "dimension") return c.values?.length ? c.values.slice(0, 6).join(", ") + (c.values.length > 6 ? "…" : "") : `${c.unique} values`;
  if (c.role === "entity" || c.role === "id") return `${c.unique.toLocaleString("en-IN")} different`;
  return "";
}

/** Import notes, said the way a person would say them. */
function plain(note: string): string {
  let m;
  if ((m = note.match(/skipped (\d+) title row/))) return `Skipped ${m[1]} title line${m[1] === "1" ? "" : "s"} above the headings.`;
  if ((m = note.match(/removed (\d+) total\/subtotal row/))) return `Left out ${m[1]} total and subtotal rows, so nothing is counted twice.`;
  if ((m = note.match(/removed (\d+) repeated header row/))) return `Left out ${m[1]} repeated heading rows.`;
  if ((m = note.match(/filled down grouped values in: (.+)/))) return `Filled in ${m[1]} on rows where it was written only once for a group.`;
  if ((m = note.match(/unpivoted (\d+) period columns \((.+?) … (.+?)\)/))) return `Turned ${m[1]} month columns (${m[2]} to ${m[3]}) into rows, so months can be compared.`;
  if ((m = note.match(/stacked (\d+) tables/))) return `Combined ${m[1]} sheets with the same columns into one table, and noted which sheet each row came from.`;
  if (/combined a two-row header/.test(note)) return "Joined a two-line heading into single column names.";
  if ((m = note.match(/dropped (\d+) empty column/))) return `Ignored ${m[1]} empty column${m[1] === "1" ? "" : "s"}.`;
  if ((m = note.match(/(\d+) Excel error cell/))) return `Treated ${m[1]} Excel error cells (#N/A, #DIV/0!) as empty.`;
  if (/read Excel Table/.test(note)) return note.replace("read Excel Table", "Read the Excel table");
  if (/no header row found/.test(note)) return "There were no headings, so columns were numbered.";
  return note.charAt(0).toUpperCase() + note.slice(1) + ".";
}

type Tab = "overview" | "history" | "preview";

export default function DatasetDetail() {
  const { id = "" } = useParams();
  const { datasets, links, reload, select } = useData();
  const ds = datasets.find((d) => d.id === id);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [ins, setIns] = useState<InsightsResponse | null>(null);
  const [preview, setPreview] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    api.dataset(id).then(setDetail).catch((e: Error) => setError(e.message));
    api.insights(id).then(setIns).catch(() => setIns(null));
    api.preview(id, 50).then(setPreview).catch(() => setPreview({ columns: [], rows: [] }));
  }, [id, ds?.updated_at]);

  const back = { to: "/data", label: "Data" };
  if (error) return <><PageHeader title="Table" back={back} /><ErrorNote message={error} /></>;
  if (!detail) return <Spinner />;

  const d = detail.dataset;
  const working = ds && (ds.status === "importing" || ds.status === "processing");
  const rep = detail.import_report;
  const parts = rep?.parts ?? (rep ? [rep] : []);
  const nameOf = (tid: string) => datasets.find((x) => x.id === tid)?.name ?? "another table";
  const notes = [
    ...parts.flatMap((p) => p.notes ?? []).map(plain),
    ...(rep?.blank_rows_removed ? [`Left out ${rep.blank_rows_removed} blank rows.`] : []),
    ...Object.entries(rep?.conversions ?? {}).map(([c, k]) => k.includes("numbers") ? `Read “${c}” as numbers (amounts like ₹1,200 or (500)).` : `Read “${c}” as dates.`),
  ];
  const myLinks = detail.model?.links ?? links.filter((l) => l.many === id || l.one === id);
  const example = (col: string) => {
    const v = preview?.rows.find((r) => r[col] != null)?.[col];
    return v == null ? "–" : String(v);
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.remove(id);
      await reload();
      nav("/data", { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader back={back} title={d.name}
        description={d.kind === "model" ? "Tables combined automatically" : d.source_label}
        actions={<>
          <Button variant="secondary" onClick={() => { select(id); nav("/"); }} disabled={ds?.status !== "ready"}>Read the story</Button>
          <Button variant="ghost" onClick={async () => { await api.refresh(id); await reload(); }}>Re-analyse</Button>
        </>} />

      {working && <Panel className="p-5 mb-8 max-w-md"><Stepper status={ds!.status} stage={ds!.stage} /></Panel>}
      {d.error && <div className="mb-8"><ErrorNote message={d.error} /></div>}

      <div className="mb-8">
        <Segmented<Tab> value={tab} onChange={setTab} options={[
          { value: "overview", label: "Overview" },
          ...(detail.batches.length ? [{ value: "history" as Tab, label: "History" }] : []),
          { value: "preview", label: "Rows" },
        ]} />
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] gap-x-12 gap-y-10">
          <div className="min-w-0">
            <Section title="What's in this table">
              <p className="text-[18px] leading-relaxed text-ink max-w-3xl">{ins?.about ?? `${d.row_count?.toLocaleString("en-IN")} rows and ${d.column_count} columns.`}</p>
            </Section>

            {detail.profile && (
              <Section title="Columns" action={<span className="text-[13px] text-mute">{detail.profile.columns.length} columns, understood automatically</span>}>
                <Panel className="overflow-x-auto">
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr className="text-left text-[12px] text-mute">
                        <th className="font-medium px-5 py-3">Column</th><th className="font-medium px-5 py-3">Understood as</th>
                        <th className="font-medium px-5 py-3">Example</th><th className="font-medium px-5 py-3">Values</th>
                        <th className="font-medium px-5 py-3 text-right">Empty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.profile.columns.map((c) => (
                        <tr key={c.name} className="border-t border-line align-top">
                          <td className="px-5 py-3 font-medium whitespace-nowrap">{c.name}</td>
                          <td className="px-5 py-3 whitespace-nowrap">{ROLE[c.role]}</td>
                          <td className="px-5 py-3 text-ink-2 num max-w-[14rem] truncate" title={example(c.name)}>{example(c.name)}</td>
                          <td className="px-5 py-3 text-mute num">{describe(c)}</td>
                          <td className="px-5 py-3 text-right num text-mute">{c.null_pct ? `${c.null_pct}%` : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              </Section>
            )}

            {notes.length > 0 && (
              <Section title="How we tidied the file">
                <Panel className="p-5">
                  {parts.filter((p) => p.sheet).slice(0, 4).map((p, i) => (
                    <p key={i} className="text-[13px] text-mute mb-2">From sheet “{p.sheet}”{p.header_row ? `, headings on row ${p.header_row}` : ""}.</p>
                  ))}
                  <ul className="text-[14px] text-ink-2 space-y-1.5 list-disc pl-5">{notes.map((t, i) => <li key={i}>{t}</li>)}</ul>
                  <p className="text-[13px] text-mute mt-3">Your original file is unchanged.</p>
                </Panel>
              </Section>
            )}
          </div>

          <aside className="space-y-8">
            {ins && (
              <div>
                <div className="label mb-3">Totals</div>
                <Panel className="divide-y divide-line">
                  {ins.kpis.map((k) => (
                    <div key={k.label} className="px-5 py-3.5 flex items-baseline justify-between gap-3">
                      <span className="text-[13px] text-mute">{k.label}{k.agg === "Average" ? " (avg)" : ""}</span>
                      <span className="text-[16px] font-semibold num">{k.display}</span>
                    </div>
                  ))}
                </Panel>
              </div>
            )}
            {myLinks.length > 0 && (
              <div>
                <div className="label mb-3">Linked tables</div>
                <Panel className="divide-y divide-line">
                  {myLinks.map((l, i) => (
                    <div key={i} className="px-5 py-3.5 text-[14px]">
                      <span className="font-medium">{nameOf(l.many)}</span> <span className="text-mute">→</span> <span className="font-medium">{nameOf(l.one)}</span>
                      <div className="text-[13px] text-mute">through {l.many_col} · {Math.round(l.coverage * 100)}% match</div>
                    </div>
                  ))}
                </Panel>
              </div>
            )}
            {d.kind === "table" && (
              <div>
                <div className="label mb-3">Remove</div>
                <p className="text-[13px] text-mute mb-3">Deletes this table and its insights here. Your original file or database isn't touched.</p>
                <Button variant="danger" onClick={() => setConfirm(true)}>Delete table</Button>
              </div>
            )}
          </aside>
        </div>
      )}

      {tab === "history" && (
        <Panel className="divide-y divide-line max-w-3xl">
          {detail.batches.map((b) => (
            <div key={b.id} className="flex items-center gap-4 px-5 py-3.5 text-[14px]">
              <span className="flex-1 min-w-0">
                <span className="block font-medium">{b.kind === "entry" ? "Entered in Data Narrator" : "Imported"}</span>
                <span className="block text-[13px] text-mute truncate">{b.source}{b.created_by ? ` · by ${b.created_by}` : ""}</span>
              </span>
              <span className="text-right text-[13px] text-mute num">+{b.rows.toLocaleString("en-IN")} rows<br />{new Date(b.created_at * 1000).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>
          ))}
        </Panel>
      )}

      {tab === "preview" && (
        !preview ? <Spinner /> : (
          <Panel className="overflow-x-auto">
            <table className="text-[13px] whitespace-nowrap w-full">
              <thead><tr className="text-left text-mute">{preview.columns.map((c) => <th key={c} className="font-medium px-4 py-3">{c}</th>)}</tr></thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    {preview.columns.map((c) => {
                      const v = r[c];
                      return <td key={c} className={`px-4 py-2.5 num ${typeof v === "number" ? "text-right" : ""}`}>{v == null ? <span className="text-faint">–</span> : typeof v === "number" ? fmt(v) : String(v)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-3 text-[12px] text-mute border-t border-line">First {preview.rows.length} rows.</p>
          </Panel>
        )
      )}

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Delete this table?">
        <p className="text-[15px] text-ink-2 mb-5">“{d.name}” and its insights are removed from Data Narrator. Your original file or database is not touched.</p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button className="flex-1 bg-bad! hover:bg-bad/90!" busy={busy} onClick={remove}>Delete</Button>
        </div>
      </Sheet>
    </>
  );
}
