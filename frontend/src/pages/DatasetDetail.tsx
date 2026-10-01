import { ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Column, type DatasetDetail as Detail } from "../api";
import { Button, Card, ErrorNote, Sheet, Spinner, StatusBadge } from "../components/ui";
import { useData } from "../state";

const ROLE: Record<Column["role"], [string, string]> = {
  measure: ["Number", "Values we add up or average"],
  dimension: ["Category", "Groups to compare"],
  time: ["Date", "Used for trends"],
  entity: ["Name", "Customers, products… used for top lists"],
  id: ["ID / key", "Links tables together"],
  text: ["Text", "Free text, not charted"],
  empty: ["Empty", "No values"],
  constant: ["Same value", "Only one value"],
  other: ["Other", ""],
};

export default function DatasetDetail() {
  const { id = "" } = useParams();
  const { datasets, reload, select } = useData();
  const ds = datasets.find((d) => d.id === id);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [preview, setPreview] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    api.dataset(id).then(setDetail).catch((e: Error) => setError(e.message));
    api.preview(id, 20).then(setPreview).catch(() => setPreview(null));
  }, [id, ds?.updated_at]);

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

  const refresh = async () => {
    await api.refresh(id);
    await reload();
  };

  const rep = detail?.import_report;
  const parts = rep?.parts ?? (rep ? [rep] : []);
  const nameOf = (tid: string) => datasets.find((d) => d.id === tid)?.name ?? "table";
  const groups = (["measure", "time", "dimension", "entity", "id", "text", "empty", "constant", "other"] as const)
    .map((r) => [r, detail?.profile?.columns.filter((c) => c.role === r) ?? []] as const)
    .filter(([, cols]) => cols.length);

  return (
    <>
      <button type="button" onClick={() => nav("/data")} className="flex items-center gap-1.5 min-h-11 -ml-1 text-[16px] text-ink-2 mb-2">
        <ArrowLeft size={20} /> Your data
      </button>
      {error && <ErrorNote message={error} />}
      {!detail && !error && <Spinner />}
      {detail && (
        <>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-[26px] font-semibold tracking-tight leading-tight">{detail.dataset.name}</h1>
            <StatusBadge status={ds?.status ?? detail.dataset.status} />
          </div>
          <p className="text-[15px] text-mute mt-1">
            {detail.dataset.row_count?.toLocaleString()} rows · {detail.dataset.column_count} columns · {detail.dataset.source_label}
          </p>
          {detail.dataset.error && <div className="mt-3"><ErrorNote message={detail.dataset.error} /></div>}

          <div className="flex gap-2 mt-5">
            <Button onClick={() => { select(id); nav("/"); }} disabled={ds?.status !== "ready"}>See insights</Button>
            <Button variant="secondary" onClick={refresh} aria-label="Re-analyse"><RefreshCw size={18} /></Button>
            <Button variant="danger" onClick={() => setConfirm(true)} aria-label="Delete"><Trash2 size={18} /></Button>
          </div>

          {detail.model && (
            <Card className="p-4 mt-6">
              <h2 className="text-[17px] font-semibold mb-2">How these tables connect</h2>
              {detail.model.links.map((l, i) => (
                <p key={i} className="text-[15px] text-ink-2 py-1">
                  <b>{nameOf(l.many)}</b> → <b>{nameOf(l.one)}</b> on “{l.many_col}” ({Math.round(l.coverage * 100)}% matched)
                </p>
              ))}
            </Card>
          )}

          {parts.length > 0 && (parts.some((p) => p.notes?.length || p.sheet) || Object.keys(rep?.conversions ?? {}).length > 0) && (
            <Card className="p-4 mt-4">
              <h2 className="text-[17px] font-semibold mb-2">How we read it</h2>
              {parts.map((p, i) => (
                <div key={i} className="py-1.5">
                  {p.sheet && (
                    <div className="text-[15px] font-medium">
                      Sheet “{p.sheet}” · {p.range}{p.header_row ? ` · header on row ${p.header_row}` : ""}
                    </div>
                  )}
                  <ul className="text-[15px] text-ink-2 list-disc pl-5 mt-0.5">
                    {p.notes?.map((n) => <li key={n}>{n}</li>)}
                  </ul>
                </div>
              ))}
              {rep?.blank_rows_removed ? <p className="text-[15px] text-ink-2">Removed {rep.blank_rows_removed} blank rows.</p> : null}
              {Object.entries(rep?.conversions ?? {}).map(([c, n]) => (
                <p key={c} className="text-[15px] text-ink-2">“{c}”: {n}</p>
              ))}
            </Card>
          )}

          {groups.length > 0 && (
            <>
              <h2 className="text-[18px] font-semibold mt-8 mb-1">What we found in each column</h2>
              <p className="text-[14px] text-mute mb-3">Worked out automatically from the values. No setup needed.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {groups.map(([role, cols]) => (
                  <Card key={role} className="p-4">
                    <div className="text-[15px] font-semibold">{ROLE[role][0]} <span className="text-mute font-normal">· {cols.length}</span></div>
                    <div className="text-[13px] text-mute mb-2">{ROLE[role][1]}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {cols.map((c) => (
                        <span key={c.name} className="text-[14px] px-2.5 py-1 rounded-lg bg-canvas" title={`${c.type}, ${c.unique} distinct, ${c.null_pct}% empty`}>
                          {c.name}{c.agg ? <span className="text-mute"> · {c.agg === "avg" ? "average" : "total"}</span> : null}
                        </span>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}

          {preview && preview.rows.length > 0 && (
            <>
              <h2 className="text-[18px] font-semibold mt-8 mb-3">Preview</h2>
              <Card className="overflow-x-auto">
                <table className="text-[14px] whitespace-nowrap">
                  <thead>
                    <tr className="bg-canvas text-left text-mute">
                      {preview.columns.map((c) => <th key={c} className="font-medium px-3 py-2.5">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr key={i} className="border-t border-line">
                        {preview.columns.map((c) => <td key={c} className="px-3 py-2 tabular">{r[c] == null ? <span className="text-zinc-300">—</span> : String(r[c])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </>
      )}
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Delete this data?">
        <p className="text-[15px] text-ink-2 mb-5">Removes “{detail?.dataset.name}” and its insights from this server. Your original file or database is not touched.</p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button className="flex-1 bg-bad! active:bg-red-800!" busy={busy} onClick={remove}>Delete</Button>
        </div>
      </Sheet>
    </>
  );
}
