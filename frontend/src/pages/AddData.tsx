import { ChevronRight, Cloud, FileSpreadsheet, Server, UploadCloud, X } from "lucide-react";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { Button, ErrorNote, Field, inputCls, PageHeader, Panel, Row, Section } from "../components/ui";
import { useData } from "../state";

type Mode = "cloud" | "database" | null;
const ACCEPT = ".xlsx,.xlsm,.xls,.xlsb,.ods,.csv,.tsv,.txt,.parquet,.json,.jsonl";

export default function AddData() {
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();
  const { reload } = useData();

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
      nav("/data");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader back={{ to: "/data", label: "Data" }} title="Add data"
        description="No setup or column mapping. We read the data, work out what each column means, and find what matters." />
      {error && <div className="mb-6"><ErrorNote message={error} /></div>}

      {!mode && (
        <>
          <Uploader busy={busy} onUpload={(f) => run(() => api.upload(f))} />
          <Section title="Or connect a source" className="mt-10">
            <Panel className="divide-y divide-line overflow-hidden">
              <Row onClick={() => setMode("cloud")}>
                <Cloud size={20} className="text-mute shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium">Cloud folder or link</span>
                  <span className="block text-[13px] text-mute">Google Drive & Sheets, OneDrive, SharePoint, Dropbox, Amazon S3, Google Cloud, Azure</span>
                </span>
                <ChevronRight size={16} className="text-faint" />
              </Row>
              <Row onClick={() => setMode("database")}>
                <Server size={20} className="text-mute shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium">Company database</span>
                  <span className="block text-[13px] text-mute">PostgreSQL or MySQL, in the cloud or on your own servers</span>
                </span>
                <ChevronRight size={16} className="text-faint" />
              </Row>
            </Panel>
          </Section>
        </>
      )}
      {mode && (
        <button type="button" onClick={() => setMode(null)} className="text-[14px] text-mute hover:text-ink mb-5 inline-flex items-center gap-1">
          <ChevronRight size={15} className="rotate-180" /> All options
        </button>
      )}
      {mode === "cloud" && <CloudForm busy={busy} onSubmit={(b) => run(() => api.connectUrl(b))} />}
      {mode === "database" && <DbForm busy={busy} onSubmit={(b) => run(() => api.connectDb(b))} />}
    </>
  );
}

function Uploader({ busy, onUpload }: { busy: boolean; onUpload: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    setFiles([...files, ...Array.from(e.dataTransfer.files)]);
  };
  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        className={`rounded-[14px] border-2 border-dashed px-6 py-14 text-center cursor-pointer transition-colors ${over ? "border-ink bg-sunken" : "border-line-2 bg-surface hover:bg-sunken/50"}`}
      >
        <UploadCloud size={30} className="mx-auto text-ink-2" strokeWidth={1.6} />
        <div className="text-[17px] font-semibold mt-3">Drop files here, or click to choose</div>
        <div className="text-[14px] text-mute mt-1">Excel (any layout: several sheets, titles, merged cells, totals are fine) · CSV · Parquet · JSON</div>
        <div className="text-[13px] text-faint mt-3">Choose related files together, like orders and customers, and we'll link them.</div>
      </div>
      <input ref={input} type="file" multiple hidden accept={ACCEPT} onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
      {files.length > 0 && (
        <Panel className="mt-4 divide-y divide-line">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="flex items-center gap-3 px-4 sm:px-5 h-14">
              <FileSpreadsheet size={18} className="text-mute shrink-0" />
              <span className="flex-1 truncate text-[14px]">{f.name}</span>
              <span className="text-[13px] text-mute num">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="w-8 h-8 flex items-center justify-center text-mute hover:text-ink" aria-label={`Remove ${f.name}`}><X size={16} /></button>
            </div>
          ))}
          <div className="p-4 sm:px-5 flex justify-end">
            <Button busy={busy} onClick={() => onUpload(files)}>Upload {files.length} file{files.length > 1 ? "s" : ""}</Button>
          </div>
        </Panel>
      )}
    </div>
  );
}

function CloudForm({ busy, onSubmit }: { busy: boolean; onSubmit: (b: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>({ url: "" });
  const scheme = v.url.split("://")[0]?.toLowerCase();
  const needsKeys = ["s3", "gs", "gcs", "r2"].includes(scheme);
  const set = (k: string) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(Object.fromEntries(Object.entries(v).filter(([, x]) => x)));
  };
  return (
    <Panel className="p-5 sm:p-6 max-w-xl">
      <h2 className="text-[17px] font-semibold mb-1">Cloud folder or link</h2>
      <p className="text-[14px] text-mute mb-5">Paste a share link as it is. For a whole folder of files use a path like s3://bucket/sales/*.parquet.</p>
      <form onSubmit={submit}>
        <Field label="Link or path"><input className={inputCls} value={v.url} onChange={set("url")} placeholder="https://docs.google.com/spreadsheets/d/…" required /></Field>
        <Field label="Name" hint="Optional. Shown in the app instead of the file name."><input className={inputCls} value={v.name ?? ""} onChange={set("name")} placeholder="Monthly sales" /></Field>
        {needsKeys && (
          <>
            <Field label="Access key ID"><input className={inputCls} value={v.key_id ?? ""} onChange={set("key_id")} autoComplete="off" /></Field>
            <Field label="Secret key"><input className={inputCls} type="password" value={v.secret ?? ""} onChange={set("secret")} autoComplete="off" /></Field>
            {scheme === "s3" && (
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field label="Region"><input className={inputCls} value={v.region ?? ""} onChange={set("region")} placeholder="ap-south-1" /></Field>
                <Field label="Custom endpoint" hint="MinIO and similar"><input className={inputCls} value={v.endpoint ?? ""} onChange={set("endpoint")} /></Field>
              </div>
            )}
            {scheme === "r2" && <Field label="Account ID"><input className={inputCls} value={v.account_id ?? ""} onChange={set("account_id")} /></Field>}
          </>
        )}
        {["az", "azure", "abfss"].includes(scheme) && (
          <Field label="Connection string"><input className={inputCls} type="password" value={v.connection_string ?? ""} onChange={set("connection_string")} /></Field>
        )}
        <Button className="w-full" busy={busy} type="submit">Connect</Button>
      </form>
    </Panel>
  );
}

function DbForm({ busy, onSubmit }: { busy: boolean; onSubmit: (b: Record<string, unknown>) => void }) {
  const [v, setV] = useState({ type: "postgres", host: "", port: "", database: "", user: "", password: "", schema: "", tables: "" });
  const [writeback, setWriteback] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ ...v, port: v.port ? Number(v.port) : null, schema: v.schema || null,
      tables: v.tables.split(",").map((t) => t.trim()).filter(Boolean), allow_writeback: writeback });
  };
  return (
    <Panel className="p-5 sm:p-6 max-w-xl">
      <h2 className="text-[17px] font-semibold mb-1">Company database</h2>
      <p className="text-[14px] text-mute mb-5">We read the tables once and analyse a copy, so your database isn't slowed down.</p>
      <form onSubmit={submit}>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {(["postgres", "mysql"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setV({ ...v, type: t })}
              className={`min-h-11 rounded-[10px] border text-[15px] ${v.type === t ? "border-ink bg-surface font-medium" : "border-line-2 text-ink-2 hover:bg-sunken"}`}>
              {t === "postgres" ? "PostgreSQL" : "MySQL"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-x-3">
          <div className="col-span-2"><Field label="Host"><input className={inputCls} value={v.host} onChange={set("host")} placeholder="db.company.internal" required /></Field></div>
          <Field label="Port"><input className={inputCls} inputMode="numeric" value={v.port} onChange={set("port")} placeholder={v.type === "postgres" ? "5432" : "3306"} /></Field>
        </div>
        <Field label="Database"><input className={inputCls} value={v.database} onChange={set("database")} required /></Field>
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="User"><input className={inputCls} value={v.user} onChange={set("user")} autoComplete="off" required /></Field>
          <Field label="Password"><input className={inputCls} type="password" value={v.password} onChange={set("password")} autoComplete="off" /></Field>
        </div>
        <details className="mb-5 group">
          <summary className="text-[14px] text-mute cursor-pointer hover:text-ink list-none">More options</summary>
          <div className="mt-4">
            <Field label="Schema" hint={v.type === "postgres" ? "Default: public" : undefined}><input className={inputCls} value={v.schema} onChange={set("schema")} /></Field>
            <Field label="Only these tables" hint="Comma-separated. Empty imports every table (up to 100)."><input className={inputCls} value={v.tables} onChange={set("tables")} placeholder="orders, customers" /></Field>
            <label className="flex items-start gap-3 text-[14px]">
              <input type="checkbox" checked={writeback} onChange={(e) => setWriteback(e.target.checked)} className="w-5 h-5 mt-0.5 accent-[#1c1b19]" />
              <span>Save committed entries back to this database
                <span className="block text-[13px] text-mute">The connection is then kept on this server. Leave off for read-only.</span></span>
            </label>
          </div>
        </details>
        <Button className="w-full" busy={busy} type="submit">Connect</Button>
      </form>
    </Panel>
  );
}
