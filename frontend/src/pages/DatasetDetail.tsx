import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Column, type DatasetDetail as Detail } from "../api";
import { Button, ErrorNote, PageHeader, Panel, Section, Segmented, Sheet, Spinner, Stepper } from "../components/ui";
import { useData } from "../state";

const ROLE: Record<Column["role"], string> = {
  measure: "Number", dimension: "Category", time: "Date", entity: "Name", id: "ID / key",
  text: "Free text", empty: "Empty", constant: "Same everywhere", other: "Other",
};

const n = (v: string | null) => (v == null || isNaN(Number(v)) ? v ?? "–" : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const day = (v: string | null) => {
  const t = v ? new Date(String(v).replace(" ", "T")) : null;
  return t && !isNaN(t.getTime()) ? t.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : v ?? "–";
};

function describe(c: Column) {
  if (c.role === "measure") return `${c.agg === "avg" ? "Averaged" : "Added up"} · ${n(c.min)} to ${n(c.max)}`;
  if (c.role === "time") return c.subtype === "year" ? `${c.min} to ${c.max}` : `${day(c.min)} to ${day(c.max)}`;
  if (c.role === "dimension" || c.role === "entity") return `${c.unique.toLocaleString()} different values`;
  if (c.role === "id") return "Used to link tables";
  return "";
}

type Tab = "overview" | "columns" | "history" | "preview";

export default function DatasetDetail() {
  const { id = "" } = useParams();
  const { datasets, reload, select } = useData();
  const ds = datasets.find((d) => d.id === id);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [preview, setPreview] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    api.dataset(id).then(setDetail).catch((e: Error) => setError(e.message));
  }, [id, ds?.updated_at]);
  useEffect(() => {
    if (tab === "preview" && !preview) api.preview(id, 50).then(setPreview).catch(() => setPreview({ columns: [], rows: [] }));
  }, [tab, id, preview]);

  const back = { to: "/data", label: "Data" };
  if (error) return <><PageHeader title="Table" back={back} /><ErrorNote message={error} /></>;
  if (!detail) return <Spinner />;

  const d = detail.dataset;
  const working = ds && (ds.status === "importing" || ds.status === "processing");
  const rep = detail.import_report;
  const parts = rep?.parts ?? (rep ? [rep] : []);
  const nameOf = (tid: string) => datasets.find((x) => x.id === tid)?.name ?? "table";
  const notes = parts.flatMap((p) => p.notes ?? []);
  const conversions = Object.entries(rep?.conversions ?? {});

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
        description={<span className="num">{d.row_count?.toLocaleString()} rows · {d.column_count} columns · {d.kind === "model" ? "combined automatically" : d.source_label}</span>}
        actions={<>
          <Button variant="secondary" onClick={() => { select(id); nav("/insights"); }} disabled={ds?.status !== "ready"}>View insights</Button>
          <Button variant="ghost" onClick={async () => { await api.refresh(id); await reload(); }}>Re-analyse</Button>
        </>} />

      {working && <Panel className="p-5 mb-8 max-w-md"><Stepper status={ds!.status} stage={ds!.stage} /></Panel>}
      {d.error && <div className="mb-8"><ErrorNote message={d.error} /></div>}

      <div className="mb-6">
        <Segmented<Tab> value={tab} onChange={setTab} options={[
          { value: "overview", label: "Overview" }, { value: "columns", label: "Columns" },
          ...(detail.batches.length ? [{ value: "history" as Tab, label: "History" }] : []), { value: "preview", label: "Preview" },
        ]} />
      </div>

      {tab === "overview" && (
        <>
          {detail.model && (
            <Section title="How these tables connect">
              <Panel className="divide-y divide-line">
                {detail.model.links.map((l, i) => (
                  <div key={i} className="px-5 py-4 text-[14px]">
                    <b className="font-medium">{nameOf(l.many)}</b> <span className="text-mute">is linked to</span> <b className="font-medium">{nameOf(l.one)}</b>
                    <span className="text-mute"> through “{l.many_col}” · {Math.round(l.coverage * 100)}% of values match</span>
                  </div>
                ))}
              </Panel>
            </Section>
          )}
          {(notes.length > 0 || conversions.length > 0 || rep?.blank_rows_removed) && (
            <Section title="How we read it">
              <Panel className="p-5">
                {parts.filter((p) => p.sheet).map((p, i) => (
                  <p key={i} className="text-[14px] text-mute mb-2">Sheet “{p.sheet}”{p.range && p.range !== "multiple" ? ` · cells ${p.range}` : ""}{p.header_row ? ` · headings on row ${p.header_row}` : ""}</p>
                ))}
                <ul className="text-[14px] text-ink-2 space-y-1.5 list-disc pl-5">
                  {notes.map((n, i) => <li key={i}>{n.charAt(0).toUpperCase() + n.slice(1)}</li>)}
                  {rep?.blank_rows_removed ? <li>Removed {rep.blank_rows_removed} blank rows</li> : null}
                  {conversions.map(([c, n]) => <li key={c}>“{c}”: {n}</li>)}
                </ul>
              </Panel>
            </Section>
          )}
          {!detail.model && !notes.length && !conversions.length && (
            <p className="text-[14px] text-mute mb-10">The file was clean: nothing needed fixing.</p>
          )}
          {d.kind === "table" && (
            <Section title="Remove">
              <p className="text-[14px] text-mute mb-3">Deletes this table and its insights from this server. Your original file or database isn't touched.</p>
              <Button variant="danger" onClick={() => setConfirm(true)}>Delete table</Button>
            </Section>
          )}
        </>
      )}

      {tab === "columns" && detail.profile && (
        <Panel className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[12px] text-mute">
                <th className="font-medium px-5 py-3">Column</th><th className="font-medium px-5 py-3">Understood as</th>
                <th className="font-medium px-5 py-3">Details</th><th className="font-medium px-5 py-3 text-right">Empty</th>
              </tr>
            </thead>
            <tbody>
              {detail.profile.columns.map((c) => (
                <tr key={c.name} className="border-t border-line">
                  <td className="px-5 py-3 font-medium">{c.name}</td>
                  <td className="px-5 py-3">{ROLE[c.role]}</td>
                  <td className="px-5 py-3 text-mute num">{describe(c)}</td>
                  <td className="px-5 py-3 text-right num text-mute">{c.null_pct ? `${c.null_pct}%` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {tab === "history" && (
        <Panel className="divide-y divide-line">
          {detail.batches.map((b) => (
            <div key={b.id} className="flex items-center gap-4 px-5 py-3.5 text-[14px]">
              <span className="flex-1 min-w-0">
                <span className="block font-medium">{b.kind === "entry" ? "Entered in the app" : "Imported"}</span>
                <span className="block text-[13px] text-mute truncate">{b.source}{b.created_by ? ` · by ${b.created_by}` : ""}</span>
              </span>
              <span className="text-right text-[13px] text-mute num">+{b.rows.toLocaleString()} rows<br />{new Date(b.created_at * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>
          ))}
        </Panel>
      )}

      {tab === "preview" && (
        !preview ? <Spinner /> : (
          <Panel className="overflow-x-auto">
            <table className="text-[13px] whitespace-nowrap">
              <thead><tr className="text-left text-mute">{preview.columns.map((c) => <th key={c} className="font-medium px-4 py-3">{c}</th>)}</tr></thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    {preview.columns.map((c) => <td key={c} className="px-4 py-2.5 num">{r[c] == null ? <span className="text-faint">–</span> : String(r[c])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
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
