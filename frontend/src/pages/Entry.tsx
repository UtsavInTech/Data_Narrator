import { ChevronRight, FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, fileUrl, type MisTable } from "../api";
import { Button, Empty, ErrorNote, Notice, PageHeader, Panel, Row, Section, Spinner } from "../components/ui";
import { ago } from "../format";

export default function Entry() {
  const [tables, setTables] = useState<MisTable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const load = () => api.misTables().then((r) => setTables(r.tables)).catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setError(null);
    setBusy(true);
    try {
      await api.upload(files);
      setNote("Uploaded. A sheet with the same columns as a table is added to that table in a few seconds.");
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
      <PageHeader title="Data entry" description="Add today's rows by hand, or upload a filled-in sheet." />
      {error && <div className="mb-6"><ErrorNote message={error} /></div>}
      {note && <div className="mb-6"><Notice tone="success">{note}</Notice></div>}
      {!tables && !error && <Spinner />}

      {tables && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-x-8">
          <Section title="Choose a table">
            {!tables.length ? (
              <Empty title="No tables yet" text="An admin adds a table first, from an Excel file or a database. Its entry form then appears here." />
            ) : (
              <Panel className="divide-y divide-line overflow-hidden">
                {tables.map((t) => (
                  <Row key={t.id} to={`/entry/${t.id}`}>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-medium truncate">{t.name}</span>
                      <span className="block text-[13px] text-mute num">{t.row_count?.toLocaleString()} rows{t.last_added ? ` · last added ${ago(t.last_added)}` : ""}</span>
                    </span>
                    {t.drafts > 0 && <span className="text-[13px] text-warn font-medium">{t.drafts} draft{t.drafts > 1 ? "s" : ""}</span>}
                    <ChevronRight size={16} className="text-faint" />
                  </Row>
                ))}
              </Panel>
            )}
          </Section>

          <div>
            <Section title="Upload a filled sheet">
              <Panel className="p-5">
                <p className="text-[14px] text-mute mb-4">Excel or CSV. If its columns match a table, the rows are added to it.</p>
                <Button variant="secondary" className="w-full" busy={busy} onClick={() => file.current?.click()}><Upload size={17} /> Choose file</Button>
                <input ref={file} type="file" hidden multiple accept=".xlsx,.xls,.csv" onChange={(e) => upload(Array.from(e.target.files ?? []))} />
              </Panel>
            </Section>
            {tables.length > 0 && (
              <Section title="Blank templates">
                <Panel className="divide-y divide-line overflow-hidden">
                  {tables.map((t) => (
                    <a key={t.id} href={fileUrl(`/api/mis/${t.id}/template.xlsx`)} className="flex items-center gap-3 px-5 h-12 text-[14px] hover:bg-sunken/60">
                      <FileSpreadsheet size={16} className="text-mute shrink-0" /><span className="flex-1 truncate">{t.name}</span>
                    </a>
                  ))}
                </Panel>
              </Section>
            )}
          </div>
        </div>
      )}
    </>
  );
}
