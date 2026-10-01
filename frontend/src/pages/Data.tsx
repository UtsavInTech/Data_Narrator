import { ChevronRight, Database, FileSpreadsheet, Layers, Link2, Plus, Server } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { Dataset } from "../api";
import { Button, Card, Empty, ErrorNote, PageTitle, Spinner, StatusBadge } from "../components/ui";
import { ago } from "../format";
import { useData } from "../state";

function SourceIcon({ d }: { d: Dataset }) {
  const Icon = d.kind === "model" ? Layers : d.source_type === "url" ? Link2 : d.source_type === "upload" ? FileSpreadsheet : Server;
  return (
    <span className="w-11 h-11 rounded-xl bg-canvas flex items-center justify-center shrink-0 text-ink-2">
      <Icon size={20} />
    </span>
  );
}

function Row({ d }: { d: Dataset }) {
  const inner = (
    <>
      <SourceIcon d={d} />
      <span className="flex-1 min-w-0">
        <span className="block text-[16px] font-medium truncate">{d.name}</span>
        <span className="block text-[13px] text-mute truncate">
          {d.status === "error"
            ? d.error
            : d.row_count != null
              ? `${d.row_count.toLocaleString()} rows · ${d.column_count} columns · ${ago(d.updated_at)}`
              : d.source_label}
        </span>
      </span>
      <StatusBadge status={d.status} />
      {d.kind !== "import" && <ChevronRight size={18} className="text-mute" />}
    </>
  );
  const cls = "flex items-center gap-3 px-4 min-h-[72px] py-2";
  return d.kind === "import" ? <div className={cls}>{inner}</div> : <Link to={`/data/${d.id}`} className={cls}>{inner}</Link>;
}

export default function Data() {
  const { datasets, loading, error } = useData();
  const nav = useNavigate();
  const add = (
    <Button onClick={() => nav("/data/add")} className="px-4!">
      <Plus size={20} /> Add
    </Button>
  );
  if (loading) return <Spinner />;

  const models = datasets.filter((d) => d.kind === "model");
  const tables = datasets.filter((d) => d.kind !== "model");

  return (
    <>
      <PageTitle title="Your data" subtitle="Files, cloud links and databases" action={add} />
      {error && <ErrorNote message={error} />}
      {!datasets.length && !error && (
        <Empty
          icon={<Database size={28} />}
          title="No data yet"
          text="Excel workbooks, CSV, Google Sheets, OneDrive, S3, PostgreSQL, MySQL and more."
          action={<Button onClick={() => nav("/data/add")}><Plus size={20} /> Add your data</Button>}
        />
      )}
      {models.length > 0 && (
        <>
          <h2 className="text-[15px] font-semibold text-ink-2 mb-2.5 mt-2">Joined automatically</h2>
          <Card className="divide-y divide-line mb-6">{models.map((d) => <Row key={d.id} d={d} />)}</Card>
        </>
      )}
      {tables.length > 0 && (
        <>
          <h2 className="text-[15px] font-semibold text-ink-2 mb-2.5">Tables</h2>
          <Card className="divide-y divide-line">{tables.map((d) => <Row key={d.id} d={d} />)}</Card>
        </>
      )}
    </>
  );
}
