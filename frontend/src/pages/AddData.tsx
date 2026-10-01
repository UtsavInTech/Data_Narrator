import { ArrowLeft, Cloud, FileSpreadsheet, Server, UploadCloud } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { Button, Card, ErrorNote, Field, inputCls } from "../components/ui";
import { useData } from "../state";

type Mode = "file" | "cloud" | "database" | null;

const OPTIONS: { mode: Exclude<Mode, null>; icon: ReactNode; title: string; text: string }[] = [
  { mode: "file", icon: <FileSpreadsheet size={24} />, title: "Upload a file", text: "Excel (any layout), CSV, Parquet, JSON" },
  { mode: "cloud", icon: <Cloud size={24} />, title: "Cloud link", text: "Google Drive & Sheets, OneDrive, Dropbox, S3, GCS, Azure" },
  { mode: "database", icon: <Server size={24} />, title: "Database", text: "PostgreSQL or MySQL, in the cloud or on your own servers" },
];

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
      <button type="button" onClick={() => (mode ? setMode(null) : nav(-1))} className="flex items-center gap-1.5 min-h-11 -ml-1 text-[16px] text-ink-2 mb-2">
        <ArrowLeft size={20} /> Back
      </button>
      <h1 className="text-[26px] font-semibold tracking-tight mb-1">Add data</h1>
      <p className="text-[15px] text-mute mb-6">We read it, work out what every column means, and build insights. No setup needed.</p>
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      {!mode && (
        <div className="flex flex-col gap-3 max-w-xl">
          {OPTIONS.map((o) => (
            <Card key={o.mode} onClick={() => setMode(o.mode)} className="p-4 flex items-center gap-4">
              <span className="w-12 h-12 rounded-xl bg-canvas flex items-center justify-center shrink-0">{o.icon}</span>
              <span>
                <span className="block text-[17px] font-semibold">{o.title}</span>
                <span className="block text-[14px] text-mute mt-0.5">{o.text}</span>
              </span>
            </Card>
          ))}
        </div>
      )}
      {mode === "file" && <FileForm busy={busy} onSubmit={(files) => run(() => api.upload(files))} />}
      {mode === "cloud" && <CloudForm busy={busy} onSubmit={(b) => run(() => api.connectUrl(b))} />}
      {mode === "database" && <DbForm busy={busy} onSubmit={(b) => run(() => api.connectDb(b))} />}
    </>
  );
}

function FileForm({ busy, onSubmit }: { busy: boolean; onSubmit: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  return (
    <div className="max-w-xl">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="w-full rounded-2xl border-2 border-dashed border-zinc-300 bg-surface py-12 flex flex-col items-center gap-3 active:bg-zinc-50"
      >
        <UploadCloud size={36} className="text-ink-2" />
        <span className="text-[17px] font-semibold">Choose files</span>
        <span className="text-[14px] text-mute px-6 text-center">Several sheets, titles, merged cells and totals are all fine. Pick related files together and we'll link them.</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept=".xlsx,.xlsm,.xls,.xlsb,.ods,.csv,.tsv,.txt,.parquet,.json,.jsonl"
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
      />
      {files.length > 0 && (
        <Card className="divide-y divide-line mt-4">
          {files.map((f) => (
            <div key={f.name} className="flex items-center gap-3 px-4 min-h-14">
              <FileSpreadsheet size={20} className="text-ink-2" />
              <span className="flex-1 truncate text-[15px]">{f.name}</span>
              <span className="text-[13px] text-mute">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          ))}
        </Card>
      )}
      <Button className="w-full mt-5" disabled={!files.length} busy={busy} onClick={() => onSubmit(files)}>
        Upload {files.length > 1 ? `${files.length} files` : ""}
      </Button>
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
    <form onSubmit={submit} className="max-w-xl">
      <Field label="Link or path" hint="Share links work as-is. Folders: s3://bucket/sales/*.parquet">
        <input className={inputCls} value={v.url} onChange={set("url")} placeholder="https://docs.google.com/spreadsheets/d/…" required />
      </Field>
      <Field label="Name (optional)">
        <input className={inputCls} value={v.name ?? ""} onChange={set("name")} placeholder="Monthly sales" />
      </Field>
      {needsKeys && (
        <>
          <Field label="Access key ID"><input className={inputCls} value={v.key_id ?? ""} onChange={set("key_id")} autoComplete="off" /></Field>
          <Field label="Secret key"><input className={inputCls} type="password" value={v.secret ?? ""} onChange={set("secret")} autoComplete="off" /></Field>
          {scheme === "s3" && (
            <>
              <Field label="Region"><input className={inputCls} value={v.region ?? ""} onChange={set("region")} placeholder="ap-south-1" /></Field>
              <Field label="Custom endpoint (MinIO etc., optional)"><input className={inputCls} value={v.endpoint ?? ""} onChange={set("endpoint")} /></Field>
            </>
          )}
          {scheme === "r2" && <Field label="Account ID"><input className={inputCls} value={v.account_id ?? ""} onChange={set("account_id")} /></Field>}
        </>
      )}
      {(scheme === "az" || scheme === "azure" || scheme === "abfss") && (
        <Field label="Connection string">
          <input className={inputCls} type="password" value={v.connection_string ?? ""} onChange={set("connection_string")} />
        </Field>
      )}
      <Button className="w-full mt-2" busy={busy} type="submit">Connect</Button>
    </form>
  );
}

function DbForm({ busy, onSubmit }: { busy: boolean; onSubmit: (b: Record<string, unknown>) => void }) {
  const [v, setV] = useState({ type: "postgres", host: "", port: "", database: "", user: "", password: "", schema: "", tables: "" });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...v,
      port: v.port ? Number(v.port) : null,
      schema: v.schema || null,
      tables: v.tables.split(",").map((t) => t.trim()).filter(Boolean),
    });
  };
  return (
    <form onSubmit={submit} className="max-w-xl">
      <div className="grid grid-cols-2 gap-2 mb-4">
        {(["postgres", "mysql"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setV({ ...v, type: t })}
            className={`min-h-12 rounded-xl border text-[16px] font-medium ${v.type === t ? "bg-ink text-white border-ink" : "bg-surface border-line"}`}
          >
            {t === "postgres" ? "PostgreSQL" : "MySQL"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2"><Field label="Host"><input className={inputCls} value={v.host} onChange={set("host")} placeholder="db.company.internal" required /></Field></div>
        <Field label="Port"><input className={inputCls} inputMode="numeric" value={v.port} onChange={set("port")} placeholder={v.type === "postgres" ? "5432" : "3306"} /></Field>
      </div>
      <Field label="Database"><input className={inputCls} value={v.database} onChange={set("database")} required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="User"><input className={inputCls} value={v.user} onChange={set("user")} autoComplete="off" required /></Field>
        <Field label="Password"><input className={inputCls} type="password" value={v.password} onChange={set("password")} autoComplete="off" /></Field>
      </div>
      <Field label="Schema (optional)"><input className={inputCls} value={v.schema} onChange={set("schema")} placeholder={v.type === "postgres" ? "public" : ""} /></Field>
      <Field label="Tables (optional)" hint="Comma-separated. Leave empty to import every table (up to 100).">
        <input className={inputCls} value={v.tables} onChange={set("tables")} placeholder="orders, customers" />
      </Field>
      <p className="text-[13px] text-mute mb-4">Read-only. We take a snapshot; your password is not stored.</p>
      <Button className="w-full" busy={busy} type="submit">Connect</Button>
    </form>
  );
}
