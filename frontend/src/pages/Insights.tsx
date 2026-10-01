import { Lightbulb } from "lucide-react";
import { useState } from "react";
import type { Insight } from "../api";
import { DatasetPicker } from "../components/DatasetPicker";
import { InsightCard, TYPE_META } from "../components/InsightCard";
import { Chip, Empty, ErrorNote, PageTitle, Spinner } from "../components/ui";
import { useData } from "../state";
import { useInsights } from "../useInsights";

export default function Insights() {
  const { current, loading } = useData();
  const { data, error } = useInsights(current?.id, current?.updated_at);
  const [filter, setFilter] = useState<Insight["type"] | "all">("all");

  if (loading) return <Spinner />;
  if (!current) return <Empty icon={<Lightbulb size={28} />} title="No insights yet" text="Add data first. Insights appear here automatically." />;

  const types = data ? (Object.keys(TYPE_META) as Insight["type"][]).filter((t) => data.insights.some((i) => i.type === t)) : [];
  const shown = data?.insights.filter((i) => filter === "all" || i.type === filter) ?? [];

  return (
    <>
      <PageTitle title="Insights" subtitle={data ? `${data.insights.length} findings, most important first` : undefined} />
      <DatasetPicker />
      {data && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 mt-4 pb-1">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
          {types.map((t) => (
            <Chip key={t} active={filter === t} onClick={() => setFilter(t)}>{TYPE_META[t].label}</Chip>
          ))}
        </div>
      )}
      {error && <div className="mt-4"><ErrorNote message={error} /></div>}
      {!data && !error && <Spinner />}
      <div className="grid lg:grid-cols-2 gap-3 mt-4">
        {shown.map((i) => (
          <InsightCard key={i.id} insight={i} datasetId={current.id} />
        ))}
      </div>
    </>
  );
}
