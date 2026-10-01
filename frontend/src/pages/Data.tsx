import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Dataset } from "../api";
import { ImportsInProgress } from "../components/Imports";
import { Button, Empty, ErrorNote, PageHeader, Panel, Row, Section, Spinner, Status } from "../components/ui";
import { ago } from "../format";
import { useData } from "../state";

const SOURCE: Record<string, string> = { upload: "File", url: "Cloud / link", postgres: "PostgreSQL", mysql: "MySQL", model: "Combined" };

function TableRow({ d }: { d: Dataset }) {
  return (
    <Row to={`/data/${d.id}`}>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-medium truncate">{d.name}</span>
        <span className="block text-[13px] text-mute truncate">
          {d.status === "error" ? <span className="text-bad">{d.error}</span>
            : <>{SOURCE[d.source_type] ?? d.source_type} · <span className="num">{d.row_count?.toLocaleString() ?? "–"}</span> rows · {d.column_count} columns</>}
        </span>
      </span>
      <span className="hidden sm:block text-[13px] text-mute w-24 text-right">{ago(d.updated_at)}</span>
      <span className="w-24 text-right"><Status status={d.status} stage={d.stage} /></span>
      <ChevronRight size={16} className="text-faint" />
    </Row>
  );
}

export default function Data() {
  const { datasets, loading, error } = useData();
  const nav = useNavigate();
  if (loading) return <Spinner />;

  const busy = datasets.filter((d) => d.status === "importing" || (d.status === "processing" && !d.row_count));
  const failedImports = datasets.filter((d) => d.kind === "import" && d.status === "error");
  const tables = datasets.filter((d) => d.kind === "table" && !busy.includes(d));
  const models = datasets.filter((d) => d.kind === "model" && !busy.includes(d));

  return (
    <>
      <PageHeader title="Data" description="Your files, cloud folders and databases. Everything here is analysed automatically."
        actions={<Button onClick={() => nav("/data/add")}>Add data</Button>} />
      {error && <ErrorNote message={error} />}
      <ImportsInProgress items={busy} />

      {failedImports.length > 0 && (
        <Section title="Couldn't import">
          <Panel className="divide-y divide-line">{failedImports.map((d) => <TableRow key={d.id} d={d} />)}</Panel>
        </Section>
      )}

      {!datasets.length && !error && (
        <Empty title="Nothing here yet"
          text="Upload an Excel or CSV file, paste a Google Drive or OneDrive link, or connect a PostgreSQL / MySQL database."
          action={<Button onClick={() => nav("/data/add")}>Add data</Button>} />
      )}

      {tables.length > 0 && (
        <Section title="Tables" action={<span className="text-[13px] text-mute">{tables.length}</span>}>
          <Panel className="divide-y divide-line overflow-hidden">{tables.map((d) => <TableRow key={d.id} d={d} />)}</Panel>
        </Section>
      )}

      {models.length > 0 && (
        <Section title="Combined automatically" action={<span className="text-[13px] text-mute hidden sm:inline">Tables that share a key, such as Order ID, joined into one view</span>}>
          <Panel className="divide-y divide-line overflow-hidden">{models.map((d) => <TableRow key={d.id} d={d} />)}</Panel>
        </Section>
      )}
    </>
  );
}
