import { ArrowLeft, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Dataset, type Entry, type Field as F } from "../api";
import { useAuth } from "../auth";
import { Button, Card, ErrorNote, Field, inputCls, Sheet, Spinner } from "../components/ui";

const OTHER = "__other__";

function blank(fields: F[]) {
  return Object.fromEntries(fields.map((f) => [f.name, f.default ?? ""])) as Record<string, string>;
}

function Input({ f, value, onChange }: { f: F; value: string; onChange: (v: string) => void }) {
  const [custom, setCustom] = useState(false);
  if (f.kind === "select" && f.options && !custom && (value === "" || f.options.includes(value))) {
    return (
      <select className={inputCls} value={value} onChange={(e) => (e.target.value === OTHER ? (setCustom(true), onChange("")) : onChange(e.target.value))}>
        <option value="">Choose…</option>
        {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value={OTHER}>Other (type a new value)…</option>
      </select>
    );
  }
  if (f.kind === "boolean") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {["Yes", "No"].map((o) => (
          <button key={o} type="button" onClick={() => onChange(o)}
            className={`min-h-12 rounded-xl border text-[16px] ${value === o ? "bg-ink text-white border-ink" : "bg-surface border-line"}`}>{o}</button>
        ))}
      </div>
    );
  }
  if (f.kind === "textarea") return <textarea className={`${inputCls} py-3 min-h-24`} value={value} onChange={(e) => onChange(e.target.value)} />;
  const listId = f.suggestions ? `s-${f.name}` : undefined;
  return (
    <>
      <input
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={f.kind === "date" ? "date" : f.kind === "datetime" ? "datetime-local" : "text"}
        inputMode={f.kind === "number" ? (f.integer ? "numeric" : "decimal") : undefined}
        list={listId}
        autoComplete="off"
      />
      {listId && <datalist id={listId}>{f.suggestions!.map((s) => <option key={s} value={s} />)}</datalist>}
    </>
  );
}

export default function EntryTable() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
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
    api.form(id).then((r) => {
      setDs(r.dataset);
      setFields(r.fields);
      setValues(blank(r.fields));
    }).catch((e: Error) => setError(e.message));
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
      if (Object.keys(r.errors).length) {
        setEditing(r.id); // keep the row in the form so it can be fixed right away
      } else {
        setEditing(null);
        setValues(blank(fields!));
      }
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

  if (error && !fields) return <div className="pt-4"><ErrorNote message={error} /></div>;
  if (!fields || !ds) return <Spinner />;
  const blocked = drafts.some((d) => Object.keys(d.errors).length);
  const preview = fields.slice(0, 4);

  return (
    <>
      <button type="button" onClick={() => nav("/entry")} className="flex items-center gap-1.5 min-h-11 -ml-1 text-[16px] text-ink-2 mb-2">
        <ArrowLeft size={20} /> Tables
      </button>
      <h1 className="text-[26px] font-semibold tracking-tight leading-tight">{ds.name}</h1>
      <p className="text-[15px] text-mute mt-1 mb-5">Rows are saved as drafts. Nothing is final until you commit.</p>

      {done && <div className="mb-4 rounded-xl bg-emerald-50 text-good border border-emerald-100 px-4 py-3 text-[15px] flex items-center gap-2"><CheckCircle2 size={18} /> {done}</div>}

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <Card className="p-5">
          <h2 className="text-[17px] font-semibold mb-4">{editing ? "Edit draft" : "New row"}</h2>
          <form onSubmit={save}>
            {fields.map((f) => (
              <Field key={f.name} label={`${f.name}${f.required ? " *" : ""}`}>
                <Input f={f} value={values[f.name] ?? ""} onChange={(v) => setValues({ ...values, [f.name]: v })} />
                {last && editing === last.id && last.errors[f.name] && <span className="block text-[13px] text-bad mt-1">{f.name} {last.errors[f.name]}</span>}
                {last && editing === last.id && !last.errors[f.name] && last.warnings[f.name] && <span className="block text-[13px] text-warn mt-1">{f.name} {last.warnings[f.name]}</span>}
              </Field>
            ))}
            {error && <div className="mb-4"><ErrorNote message={error} /></div>}
            <div className="flex gap-2">
              {editing && <Button type="button" variant="secondary" onClick={() => { setEditing(null); setValues(blank(fields)); }}>Cancel</Button>}
              <Button type="submit" busy={busy} className="flex-1">{editing ? "Save changes" : "Add to drafts"}</Button>
            </div>
          </form>
        </Card>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[17px] font-semibold">Drafts · {drafts.length}</h2>
            {drafts.length > 0 && (
              <Button onClick={() => setCommitOpen(true)} disabled={blocked} className="px-4!">Commit {drafts.length}</Button>
            )}
          </div>
          {blocked && <p className="text-[14px] text-bad mb-3">Fix the rows marked in red before committing.</p>}
          {!drafts.length && <Card className="p-5 text-[15px] text-mute">No drafts. Rows you add appear here.</Card>}
          <div className="flex flex-col gap-2">
            {drafts.map((d) => (
              <Card key={d.id} className={`p-4 ${Object.keys(d.errors).length ? "border-red-200!" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 text-[15px]">
                    {preview.map((f) => (
                      <span key={f.name} className="mr-3 inline-block"><span className="text-mute">{f.name}:</span> {String(d.data[f.name] ?? "—")}</span>
                    ))}
                    {Object.entries(d.errors).map(([k, m]) => <div key={k} className="text-bad text-[14px] mt-1">{k} {m}</div>)}
                    {Object.entries(d.warnings).map(([k, m]) => <div key={k} className="text-warn text-[14px] mt-1">{k} {m}</div>)}
                  </div>
                  <button type="button" onClick={() => edit(d)} className="w-10 h-10 flex items-center justify-center text-ink-2" aria-label="Edit"><Pencil size={18} /></button>
                  <button type="button" onClick={() => api.deleteEntry(id, d.id).then(loadDrafts)} className="w-10 h-10 flex items-center justify-center text-bad" aria-label="Delete"><Trash2 size={18} /></button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <CommitSheet open={commitOpen} onClose={() => setCommitOpen(false)} count={drafts.length} writeback={!!ds.writeback}
        defaultId={user!.employee_id}
        onCommit={async (b) => {
          const r = await api.commit(id, b);
          setCommitOpen(false);
          setDone(`${r.rows} row${r.rows > 1 ? "s" : ""} committed by ${r.committed_by.name}${r.pushed ? " and saved to the source database" : ""}.`);
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
        <p className="text-[15px] text-ink-2 mb-4">Confirm with your Employee ID and password. Committed rows are recorded under your name.</p>
        <Field label="Employee ID"><input className={inputCls} value={emp} onChange={(e) => setEmp(e.target.value)} autoCapitalize="characters" required /></Field>
        <Field label="Password"><input className={inputCls} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></Field>
        {writeback && (
          <label className="flex items-center gap-3 min-h-12 mb-4 text-[15px]">
            <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} className="w-5 h-5 accent-zinc-900" />
            Also save to the source database
          </label>
        )}
        {error && <div className="mb-4"><ErrorNote message={error} /></div>}
        <Button type="submit" busy={busy} className="w-full">Commit</Button>
      </form>
    </Sheet>
  );
}
