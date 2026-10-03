import { CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, type Dataset, type Entry, type Field as F } from "../api";
import { useAuth } from "../auth";
import { Lookup } from "../components/Lookup";
import { Button, ErrorNote, Field, inputCls, Notice, PageHeader, Panel, Sheet, Spinner } from "../components/ui";
import { fmtFull, singular } from "../format";

const OTHER = "__other__";
type Values = Record<string, string>;

const blank = (fields: F[]): Values => applyFormulas(fields, Object.fromEntries(fields.map((f) => [f.name, f.default ?? ""])), new Set());

/** Fill calculated columns (GST, totals, due dates) from the ones typed, unless someone typed over them. */
function applyFormulas(fields: F[], v: Values, typed: Set<string>): Values {
  const out = { ...v };
  for (let pass = 0; pass < 2; pass++) {
    for (const f of fields) {
      const r = f.formula;
      if (!r || typed.has(f.name)) continue;
      const args = r.args.map((a) => out[a]);
      if (args.some((a) => a === "" || a == null)) continue;
      if (r.op === "days") {
        const d = new Date(args[0]);
        if (!isNaN(d.getTime())) { d.setDate(d.getDate() + (r.k ?? 0)); out[f.name] = d.toISOString().slice(0, 10); }
        continue;
      }
      const nums = args.map((a) => Number(String(a).replace(/[₹,\s]/g, "")));
      if (nums.some((x) => isNaN(x))) continue;
      const res = r.op === "add" ? nums.reduce((s, x) => s + x, 0) : nums[0] * (r.k ?? 1);
      out[f.name] = String(Math.round(res * 100) / 100);
    }
  }
  return out;
}

function formulaHint(f: F) {
  const r = f.formula!;
  if (r.op === "days") return `Calculated: ${r.args[0]} + ${r.k} days`;
  if (r.op === "add") return `Calculated: ${r.args.join(" + ")}`;
  return `Calculated: ${Math.round((r.k ?? 0) * 10000) / 100}% of ${r.args[0]}`;
}

function Input({ f, value, onChange, invalid }: { f: F; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const [custom, setCustom] = useState(false);
  const cls = `${inputCls} ${invalid ? "border-bad!" : ""}`;
  if (f.kind === "lookup" && f.lookup) return <Lookup value={value} options={f.lookup.options} onChange={onChange} invalid={invalid} />;
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
  if (f.kind === "textarea") return <textarea className={`${cls} py-2.5 min-h-20`} value={value} onChange={(e) => onChange(e.target.value)} />;
  const listId = f.suggestions ? `s-${f.name}` : undefined;
  return (
    <>
      <input className={`${cls} ${f.kind === "number" ? "num" : ""} ${f.formula ? "bg-sunken/60" : ""}`} value={value} onChange={(e) => onChange(e.target.value)}
        type={f.kind === "date" ? "date" : f.kind === "datetime" ? "datetime-local" : "text"}
        inputMode={f.kind === "number" ? (f.integer ? "numeric" : "decimal") : undefined} list={listId} autoComplete="off" />
      {listId && <datalist id={listId}>{f.suggestions!.map((s) => <option key={s} value={s} />)}</datalist>}
    </>
  );
}

/** What we know about the chosen customer (or product, supplier…). */
function LookupDetail({ f, value }: { f: F; value: string }) {
  const o = f.lookup?.options.find((x) => x.value === value);
  if (!o) return null;
  const entries = Object.entries(o.detail).filter(([, v]) => v != null && v !== "").slice(0, 6);
  return (
    <div className="-mt-3 mb-5 rounded-[10px] bg-sunken/70 border border-line px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
      {entries.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <span className="text-mute">{k}: </span>
          <span className="text-ink-2">{typeof v === "number" ? fmtFull(v, k) : String(v).slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/) ? new Date(String(v)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : String(v)}</span>
        </div>
      ))}
    </div>
  );
}

export default function EntryTable() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [ds, setDs] = useState<Dataset | null>(null);
  const [fields, setFields] = useState<F[] | null>(null);
  const [drafts, setDrafts] = useState<Entry[]>([]);
  const [values, setValues] = useState<Values>({});
  const [typed, setTyped] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [last, setLast] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const loadDrafts = useCallback(() => api.entries(id).then((r) => setDrafts(r.entries)), [id]);
  const loadForm = useCallback(() => api.form(id).then((r) => { setDs(r.dataset); setFields(r.fields); setValues(blank(r.fields)); setTyped(new Set()); }), [id]);
  useEffect(() => {
    loadForm().catch((e: Error) => setError(e.message));
    loadDrafts().catch(() => undefined);
  }, [loadForm, loadDrafts]);

  const change = (f: F, v: string) => {
    const nextTyped = new Set(typed);
    if (f.formula) nextTyped.add(f.name);
    let next = { ...values, [f.name]: v };
    if (f.kind === "lookup") {  // copy matching details (e.g. the customer's Salesperson) into empty fields
      const o = f.lookup?.options.find((x) => x.value === v);
      for (const [k, dv] of Object.entries(o?.detail ?? {})) {
        if (k in next && !next[k] && dv != null) next[k] = String(dv);
      }
    }
    next = applyFormulas(fields!, next, nextTyped);
    setTyped(nextTyped);
    setValues(next);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const r = editing ? await api.editEntry(id, editing, values) : await api.addEntry(id, values);
      setLast(r);
      if (Object.keys(r.errors).length) setEditing(r.id);
      else {
        setEditing(null);
        // Next record: fresh form, next number.
        const nextId = fields!.find((f) => f.unique && f.next);
        const fresh = blank(fields!);
        if (nextId && values[nextId.name]) {
          const m = values[nextId.name].match(/^(.*?)(\d+)$/);
          if (m) fresh[nextId.name] = m[1] + String(Number(m[2]) + 1).padStart(m[2].length, "0");
        }
        setValues(fresh);
        setTyped(new Set());
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
    setTyped(new Set(fields!.filter((f) => f.formula).map((f) => f.name)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (error && !fields) return <><PageHeader title="Record data" back={{ to: "/entry", label: "Record data" }} /><ErrorNote message={error} /></>;
  if (!fields || !ds) return <Spinner />;
  const one = singular(ds.name);
  const blocked = drafts.some((d) => Object.keys(d.errors).length);
  const showIssues = last && editing === last.id;
  const cols = fields.filter((f) => f.kind !== "textarea").slice(0, 5);
  const hasNav = user!.role !== "operator";

  return (
    <>
      <PageHeader back={{ to: "/entry", label: "Record data" }} title={editing ? `Edit ${one.toLowerCase()}` : `New ${one.toLowerCase()}`}
        description={`Goes into ${ds.name}. Entries wait here as drafts until you save them with your Employee ID and password.`} />
      {done && <div className="mb-6"><Notice tone="success"><span className="inline-flex items-center gap-2"><CheckCircle2 size={16} />{done}</span></Notice></div>}

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,44rem)_minmax(0,1fr)] gap-10 items-start">
        <Panel className="p-6 lg:p-8 max-w-[44rem]">
          <form onSubmit={save} onKeyDown={(e) => {
            // Enter moves to the next box (like a spreadsheet); Ctrl/Cmd+Enter adds the row.
            const el = e.target as HTMLElement;
            if (e.key !== "Enter" || el.tagName === "TEXTAREA" || el.tagName === "BUTTON") return;
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) { (e.currentTarget as HTMLFormElement).requestSubmit(); return; }
            const boxes = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("input, select, textarea, button[type=submit]"));
            boxes[boxes.indexOf(el) + 1]?.focus();
          }}>
            <div className="grid sm:grid-cols-2 gap-x-5">
              {fields.map((f) => (
                <div key={f.name} className={f.kind === "textarea" || f.kind === "lookup" ? "sm:col-span-2" : ""}>
                  <Field label={`${f.name}${f.required ? " *" : ""}`}
                    error={showIssues && last!.errors[f.name] ? `${f.name} ${last!.errors[f.name]}` : undefined}
                    hint={showIssues && last!.warnings[f.name] ? `${f.name} ${last!.warnings[f.name]}`
                      : f.formula && !typed.has(f.name) ? formulaHint(f) : f.unique && f.next ? "Next number, filled in for you" : undefined}>
                    <Input f={f} value={values[f.name] ?? ""} onChange={(v) => change(f, v)} invalid={!!(showIssues && last!.errors[f.name])} />
                  </Field>
                  {f.kind === "lookup" && <LookupDetail f={f} value={values[f.name] ?? ""} />}
                </div>
              ))}
            </div>
            {error && <div className="mb-4"><ErrorNote message={error} /></div>}
            <div className="flex items-center gap-3 border-t border-line mt-1 pt-5">
              {editing && <Button type="button" variant="secondary" onClick={() => { setEditing(null); setLast(null); setValues(blank(fields)); setTyped(new Set()); }}>Cancel</Button>}
              <Button type="submit" busy={busy} className="min-w-44">{editing ? "Save changes" : "Add to drafts"}</Button>
              <span className="text-[13px] text-mute">* required · Enter moves to the next box · Ctrl+Enter adds the row</span>
            </div>
          </form>
        </Panel>

        <div className="min-w-0 2xl:sticky 2xl:top-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[16px] font-semibold">Drafts <span className="text-mute font-normal num">· {drafts.length}</span></h2>
            {drafts.length > 0 && (
              <Button disabled={blocked} onClick={() => setCommitOpen(true)} className="hidden lg:inline-flex">
                Save {drafts.length} to {ds.name}
              </Button>
            )}
          </div>
          {blocked && <p className="text-[13px] text-bad mb-3">Fix the rows marked in red before saving.</p>}
          {!drafts.length ? (
            <Panel className="p-6 text-[14px] text-mute">Each {one.toLowerCase()} you add appears here. Check them, then save them all at once.</Panel>
          ) : (
            <Panel className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-mute">
                    <th className="w-6" />
                    {cols.map((f) => <th key={f.name} className="font-medium px-3 py-2.5 whitespace-nowrap">{f.name}</th>)}
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d) => {
                    const bad = Object.keys(d.errors).length > 0;
                    const warn = Object.keys(d.warnings).length > 0;
                    return (
                      <tr key={d.id} className="border-t border-line align-top">
                        <td className="pl-3 pt-3.5"><span className={`block w-2 h-2 rounded-full ${bad ? "bg-bad" : warn ? "bg-warn" : "bg-good"}`} title={bad ? "Has errors" : warn ? "Has warnings" : "Ready"} /></td>
                        {cols.map((f) => <td key={f.name} className="px-3 py-2.5 whitespace-nowrap num">{String(d.data[f.name] ?? "–")}</td>)}
                        <td className="pr-2 py-1.5 whitespace-nowrap text-right">
                          <button type="button" onClick={() => edit(d)} className="w-8 h-8 inline-flex items-center justify-center text-mute hover:text-ink rounded-[8px]" aria-label="Edit"><Pencil size={15} /></button>
                          <button type="button" onClick={() => api.deleteEntry(id, d.id).then(loadDrafts).catch((e: Error) => setError(e.message))} className="w-8 h-8 inline-flex items-center justify-center text-mute hover:text-bad rounded-[8px]" aria-label="Delete"><Trash2 size={15} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {drafts.some((d) => Object.keys(d.errors).length || Object.keys(d.warnings).length) && (
                <div className="border-t border-line px-4 py-3 space-y-1 text-[13px]">
                  {drafts.flatMap((d) => [
                    ...Object.entries(d.errors).map(([k, m]) => <div key={d.id + k} className="text-bad">{String(d.data[cols[0]?.name ?? "Row"] ?? "")}: {k} {m}</div>),
                    ...Object.entries(d.warnings).map(([k, m]) => <div key={d.id + k + "w"} className="text-warn">{String(d.data[cols[0]?.name ?? "Row"] ?? "")}: {k} {m}</div>),
                  ])}
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>

      {drafts.length > 0 && (
        <div className={`lg:hidden fixed inset-x-0 z-30 bg-surface border-t border-line px-4 py-3 ${hasNav ? "bottom-[calc(4rem+env(safe-area-inset-bottom))]" : "bottom-0 pb-safe"}`}>
          <Button className="w-full" disabled={blocked} onClick={() => setCommitOpen(true)}>{blocked ? "Fix red rows to save" : `Save ${drafts.length} to ${ds.name}`}</Button>
        </div>
      )}

      <CommitSheet open={commitOpen} onClose={() => setCommitOpen(false)} count={drafts.length} table={ds.name} writeback={!!ds.writeback}
        defaultId={user!.employee_id}
        onCommit={async (b) => {
          const r = await api.commit(id, b);
          setCommitOpen(false);
          setDone(`${r.rows} saved to ${ds.name} by ${r.committed_by.name}${r.pushed ? ", and written to the company database" : ""}.`);
          await loadDrafts();
          await loadForm();
        }} />
    </>
  );
}

function CommitSheet({ open, onClose, count, table, writeback, defaultId, onCommit }: {
  open: boolean; onClose: () => void; count: number; table: string; writeback: boolean; defaultId: string;
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
    <Sheet open={open} onClose={onClose} title={`Save ${count} to ${table}`}>
      <form onSubmit={submit}>
        <p className="text-[14px] text-ink-2 mb-5">Confirm it's you. The entries are saved under your name and appear in insights and reports.</p>
        <Field label="Employee ID"><input className={inputCls} value={emp} onChange={(e) => setEmp(e.target.value)} autoCapitalize="characters" required /></Field>
        <Field label="Password"><input className={inputCls} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required autoFocus /></Field>
        {writeback && (
          <label className="flex items-center gap-3 mb-5 text-[14px]">
            <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} className="w-5 h-5 accent-[#1c1b19]" />
            Also save to the company database
          </label>
        )}
        {error && <div className="mb-4"><ErrorNote message={error} /></div>}
        <Button type="submit" busy={busy} className="w-full">Save</Button>
      </form>
    </Sheet>
  );
}
