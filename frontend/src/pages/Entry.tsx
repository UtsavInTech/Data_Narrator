import { FileSpreadsheet, Plus, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, fileUrl, type MisTable } from "../api";
import { btnCls, Button, Empty, ErrorNote, Notice, PageHeader, Panel, Section, Spinner } from "../components/ui";
import { ago, singular } from "../format";

export default function Entry() {
  const [tables, setTables] = useState<MisTable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const load = () => api.misTables().then((r) => setTables(r.tables)).catch((e: Error) => setError(e.message));
  useEffect(() => { load(); }, []);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setError(null);
    setBusy(true);
    try {
      await api.upload(files);
      setNote("Uploaded. If the sheet has the same columns as one of your tables, its rows are added to that table in a few seconds.");
      setTimeout(load, 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };

  return (
    <>
      <PageHeader title="Record data" description="Add today's invoices, payments or other records. Each form is built from the columns of your own table, and checks entries before they are saved." />
      {error && <div className="mb-6"><ErrorNote message={error} /></div>}
      {note && <div className="mb-6"><Notice tone="success">{note}</Notice></div>}
      {!tables && !error && <Spinner />}

      {tables && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] gap-x-12 gap-y-10">
          <Section title="What do you want to record?">
            {!tables.length ? (
              <Empty title="No tables yet" text="An admin adds a table first, from an Excel file or a database. Its form then appears here." />
            ) : (
              <Panel className="divide-y divide-line overflow-hidden">
                {tables.map((t) => (
                  <div key={t.id} className="flex items-center gap-5 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold truncate">{t.name}</div>
                      <div className="text-[13px] text-mute num mt-0.5">
                        {t.row_count?.toLocaleString("en-IN")} saved{t.last_added ? ` · last added ${ago(t.last_added)}` : ""}
                        {t.drafts > 0 && <span className="text-warn"> · {t.drafts} draft{t.drafts > 1 ? "s" : ""} waiting</span>}
                      </div>
                    </div>
                    <Link to={`/entry/${t.id}`} className={`${btnCls(t.drafts ? "primary" : "secondary")} shrink-0`}>
                      <Plus size={16} /> {t.drafts ? "Continue" : `New ${singular(t.name).toLowerCase()}`}
                    </Link>
                  </div>
                ))}
              </Panel>
            )}
          </Section>

          <aside className="space-y-8">
            <div>
              <div className="label mb-3">Filled in Excel instead?</div>
              <Panel className="p-5">
                <p className="text-[14px] text-ink-2 mb-4">Upload the sheet. Rows go into the table with the same columns, and the same checks run.</p>
                <Button variant="secondary" className="w-full" busy={busy} onClick={() => file.current?.click()}><Upload size={16} /> Upload a sheet</Button>
                <input ref={file} type="file" hidden multiple accept=".xlsx,.xls,.csv" onChange={(e) => upload(Array.from(e.target.files ?? []))} />
              </Panel>
            </div>
            {tables.length > 0 && (
              <div>
                <div className="label mb-3">Blank Excel templates</div>
                <Panel className="divide-y divide-line overflow-hidden">
                  {tables.map((t) => (
                    <a key={t.id} href={fileUrl(`/api/mis/${t.id}/template.xlsx`)} className="flex items-center gap-3 px-5 h-12 text-[14px] hover:bg-sunken/60">
                      <FileSpreadsheet size={16} className="text-mute shrink-0" /><span className="flex-1 truncate">{t.name}</span>
                      <span className="text-[12px] text-mute">.xlsx</span>
                    </a>
                  ))}
                </Panel>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
