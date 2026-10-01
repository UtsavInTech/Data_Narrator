import { ChevronRight, ClipboardList, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type MisTable } from "../api";
import { Button, Card, Empty, ErrorNote, PageTitle, Spinner } from "../components/ui";
import { ago } from "../format";

export default function Entry() {
  const [tables, setTables] = useState<MisTable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  const load = () => api.misTables().then((r) => setTables(r.tables)).catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const upload = async (files: File[]) => {
    setError(null);
    try {
      await api.upload(files);
      setNote("Uploaded. Sheets with the same columns are added to their table in a few seconds.");
      setTimeout(load, 3000);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <PageTitle
        title="Data entry"
        subtitle="Pick a table, add rows, then commit."
        action={<Button variant="secondary" onClick={() => file.current?.click()} className="px-4!"><Upload size={18} /> Upload sheet</Button>}
      />
      <input ref={file} type="file" hidden multiple accept=".xlsx,.xls,.csv" onChange={(e) => upload(Array.from(e.target.files ?? []))} />
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}
      {note && <div className="mb-4 rounded-xl bg-surface border border-line px-4 py-3 text-[15px]">{note}</div>}
      {!tables && !error && <Spinner />}
      {tables && !tables.length && (
        <Empty icon={<ClipboardList size={28} />} title="No tables yet" text="An admin adds a table first (upload an Excel or connect a database). Then its entry form appears here." />
      )}
      <div className="flex flex-col gap-3">
        {tables?.map((t) => (
          <Card key={t.id} onClick={() => nav(`/entry/${t.id}`)} className="p-4 flex items-center gap-4">
            <span className="flex-1 min-w-0">
              <span className="block text-[17px] font-semibold truncate">{t.name}</span>
              <span className="block text-[14px] text-mute mt-0.5">
                {t.row_count?.toLocaleString()} rows{t.last_added ? ` · last added ${ago(t.last_added)}` : ""}
              </span>
            </span>
            {t.drafts > 0 && <span className="text-[13px] font-medium px-2.5 py-1 rounded-full bg-amber-50 text-warn">{t.drafts} draft{t.drafts > 1 ? "s" : ""}</span>}
            <ChevronRight size={20} className="text-mute" />
          </Card>
        ))}
      </div>
    </>
  );
}
