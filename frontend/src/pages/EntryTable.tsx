import { CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, type Dataset, type Entry, type Field as F } from "../api";
import { useAuth } from "../auth";
import { Button, ErrorNote, Field, inputCls, Notice, PageHeader, Panel, Sheet, Spinner } from "../components/ui";

const OTHER = "__other__";
const blank = (fields: F[]) => Object.fromEntries(fields.map((f) => [f.name, f.default ?? ""])) as Record<string, string>;

function Input({ f, value, onChange, invalid }: { f: F; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const [custom, setCustom] = useState(false);
  const cls = `${inputCls} ${invalid ? "border-bad!" : ""}`;
  if (f.kind === "select" && f.options && !custom && (value === "" || f.options.includes(value))) {
    return (
      <select className={cls} value={value} onChange={(e) => (e.target.value === OTHER ? (setCustom(true), onChange("")) : onChange(e.target.value))}>
        <option value="">Choose…</option>
        {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value={OTHER}>Something else…</option>
      </select>
    );
  }
  if (f.kind === "boolean") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {["Yes", "No"].map((o) => (
          <button key={o} type="button" onClick={() => onChange(o)}
            className={`min-h-11 rounded-[10px] border text-[15px] ${value === o ? "border-ink font-medium" : "border-line-2 text-ink-2"}`}>{o}</button>
        ))}
      </div>
    );
  }
  if (f.kind === "textarea") return <textarea className={`${cls} py-2.5 min-h-24`} value={value} onChange={(e) => onChange(e.target.value)} />;
  const listId = f.suggestions ? `s-${f.name}` : undefined;
  return (
    <>
      <input className={`${cls} ${f.kind === "number" ? "num" : ""}`} value={value} onChange={(e) => onChange(e.target.value)}
        type={f.kind === "date" ? "date" : f.kind === "datetime" ? "datetime-local" : "text"}
        inputMode={f.kind === "number" ? (f.integer ? "numeric" : "decimal") : undefined} list={listId} autoComplete="off" />
      {listId && <datalist id={listId}>{f.suggestions!.map((s) => <option key={s} value={s} />)}</datalist>}
    </>
  );
}

export default function EntryTable() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [ds, setDs] = useState<Dataset | null>(null);
  const [fields, setFields] = useState<F[] | null>(null);
  const [drafts, setDrafts] = useState<Entry[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [last, setLast] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const loadDrafts = useCallback(() => api.entries(id).then((r) => setDrafts(r.entries)), [id]);
  useEffect(() => {
    api.form(id).then((r) => { setDs(r.dataset); setFields(r.fields); setValues(blank(r.fields)); }).catch((e: Error) => setError(e.message));
    loadDrafts().catch(() => undefined);
  }, [id, loadDrafts]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const r = editing ? await api.editEntry(id, editing, values) : await api.addEntry(id, values);
      setLast(r);
      if (Object.keys(r.errors).length) setEditing(r.id); // keep it in the form to fix
      else { setEditing(null); setValues(blank(fields!)); }
      await loadDrafts();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const edit = (d: Entry) => {
    setEditing(d.id);
    setLast(d);
    setValues(Object.fromEntries(fields!.map((f) => [f.name, d.data[f.name] == null ? "" : String(d.data[f.name])])));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (error && !fields) return <><PageHeader title="Data entry" back={{ to: "/entry", label: "Data entry" }} /><ErrorNote message={error} /></>;
  if (!fields || !ds) return <Spinner />;
  const blocked = drafts.some((d) => Object.keys(d.errors).length);
  const showIssues = last && editing === last.id;
  const preview = fields.slice(0, 3);
  const hasNav = user!.role !== "operator";

  return (
    <>
      <PageHeader back={{ to: "/entry", label: "Data entry" }} title={ds.name}
        description="Fill in a row and add it. Rows stay as drafts until you commit them with your Employee ID." />
      {done && <div className="mb-6"><Notice tone="success"><span className="inline-flex items-center gap-2"><CheckCircle2 size={16} />{done}</span></Notice></div>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-8 items-start">
        <Panel className="p-5 sm:p-6">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-[16px] font-semibold">{editing ? "Edit row" : "New row"}</h2>
            <span className="text-[13px] text-mute">* required</span>
          </div>
          <form onSubmit={save}>
            <div className="grid sm:grid-cols-2 gap-x-4">
              {fields.map((f) => (
                <div key={f.name} className={f.kind === "textarea" ? "sm:col-span-2" : ""}>
                  <Field label={`${f.name}${f.required ? " *" : ""}`}
                    error={showIssues && last!.errors[f.name] ? `${f.name} ${last!.errors[f.name]}` : undefined}
                    hint={showIssues && last!.warnings[f.name] ? `${f.name} ${last!.warnings[f.name]}` : undefined}>
                    <Input f={f} value={values[f.name] ?? ""} onChange={(v) => setValues({ ...values, [f.name]: v })} invalid={!!(showIssues && last!.errors[f.name])} />
                  </Field>
                </div>
              ))}
            </div>
            {error && <div className="mb-4"><ErrorNote message={error} /></div>}
            <div className="flex gap-2 pt-1">
              {editing && <Button type="button" variant="secondary" onClick={() => { setEditing(null); setLast(null); setValues(blank(fields)); }}>Cancel</Button>}
              <Button type="submit" busy={busy} className="flex-1 sm:flex-none sm:min-w-40">{editing ? "Save changes" : "Add row"}</Button>
            </div>
          </form>
        </Panel>

        <div className="lg:sticky lg:top-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[16px] font-semibold">Drafts</h2>
            <span className="text-[13px] text-mute num">{drafts.length}</span>
          </div>
          {!drafts.length ? (
            <Panel className="p-5 text-[14px] text-mute">Rows you add appear here. Check them, then commit.</Panel>
          ) : (
            <Panel className="overflow-hidden">
              <ul className="divide-y divide-line">
                {drafts.map((d) => {
                  const bad = Object.keys(d.errors).length > 0;
                  return (
                    <li key={d.id} className="flex items-start gap-2 pl-4 pr-2 py-3">
                      <span className={`mt-[7px] w-2 h-2 rounded-full shrink-0 ${bad ? "bg-bad" : Object.keys(d.warnings).length ? "bg-warn" : "bg-good"}`} />
                      <div className="flex-1 min-w-0 text-[14px]">
                        <div className="truncate">{preview.map((f) => String(d.data[f.name] ?? "–")).join(" · ")}</div>
                        {Object.entries(d.errors).map(([k, m]) => <div key={k} className="text-bad text-[13px]">{k} {m}</div>)}
                        {Object.entries(d.warnings).map(([k, m]) => <div key={k} className="text-warn text-[13px]">{k} {m}</div>)}
                      </div>
                      <button type="button" onClick={() => edit(d)} className="w-9 h-9 flex items-center justify-center text-mute hover:text-ink rounded-[8px]" aria-label="Edit row"><Pencil size={16} /></button>
                      <button type="button" onClick={() => api.deleteEntry(id, d.id).then(loadDrafts)} className="w-9 h-9 flex items-center justify-center text-mute hover:text-bad rounded-[8px]" aria-label="Delete row"><Trash2 size={16} /></button>
                    </li>
                  );
                })}
              </ul>
              <div className="hidden lg:block border-t border-line p-4">
                {blocked && <p className="text-[13px] text-bad mb-3">Fix rows marked red first.</p>}
                <Button className="w-full" disabled={blocked} onClick={() => setCommitOpen(true)}>Commit {drafts.length} row{drafts.length > 1 ? "s" : ""}</Button>
              </div>
            </Panel>
          )}
        </div>
      </div>

      {/* Phones: commit stays in reach */}
      {drafts.length > 0 && (
        <div className={`lg:hidden fixed inset-x-0 z-30 bg-surface border-t border-line px-4 py-3 ${hasNav ? "bottom-[calc(4rem+env(safe-area-inset-bottom))]" : "bottom-0 pb-safe"}`}>
          <Button className="w-full" disabled={blocked} onClick={() => setCommitOpen(true)}>
            {blocked ? "Fix red rows to commit" : `Commit ${drafts.length} row${drafts.length > 1 ? "s" : ""}`}
          </Button>
        </div>
      )}
      {drafts.length > 0 && <div className="lg:hidden h-20" />}

      <CommitSheet open={commitOpen} onClose={() => setCommitOpen(false)} count={drafts.length} writeback={!!ds.writeback}
        defaultId={user!.employee_id}
        onCommit={async (b) => {
          const r = await api.commit(id, b);
          setCommitOpen(false);
          setDone(`${r.rows} row${r.rows > 1 ? "s" : ""} saved by ${r.committed_by.name}${r.pushed ? " and written to the source database" : ""}.`);
          await loadDrafts();
        }} />
    </>
  );
}

function CommitSheet({ open, onClose, count, writeback, defaultId, onCommit }: {
  open: boolean; onClose: () => void; count: number; writeback: boolean; defaultId: string;
  onCommit: (b: { employee_id: string; password: string; push: boolean }) => Promise<void>;
}) {
  const [emp, setEmp] = useState(defaultId);
  const [pw, setPw] = useState("");
  const [push, setPush] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onCommit({ employee_id: emp, password: pw, push: writeback && push });
      setPw("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Commit ${count} row${count > 1 ? "s" : ""}`}>
      <form onSubmit={submit}>
        <p className="text-[14px] text-ink-2 mb-5">Confirm it's you. The rows are saved under your name and can't be edited here afterwards.</p>
        <Field label="Employee ID"><input className={inputCls} value={emp} onChange={(e) => setEmp(e.target.value)} autoCapitalize="characters" required /></Field>
        <Field label="Password"><input className={inputCls} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required autoFocus /></Field>
        {writeback && (
          <label className="flex items-center gap-3 mb-5 text-[14px]">
            <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} className="w-5 h-5 accent-[#1c1b19]" />
            Also save to the company database
          </label>
        )}
        {error && <div className="mb-4"><ErrorNote message={error} /></div>}
        <Button type="submit" busy={busy} className="w-full">Commit</Button>
      </form>
    </Sheet>
  );
}
