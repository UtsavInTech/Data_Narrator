import { ChevronRight, ListChecks } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Action } from "../api";
import { DatasetPicker } from "../components/DatasetPicker";
import { Card, Empty, ErrorNote, PageTitle, Spinner } from "../components/ui";
import { useData } from "../state";
import { useInsights } from "../useInsights";

export const PRIORITY: Record<Action["priority"], { label: string; dot: string }> = {
  high: { label: "High", dot: "bg-bad" },
  medium: { label: "Medium", dot: "bg-warn" },
  low: { label: "Low", dot: "bg-zinc-400" },
};

export default function Actions() {
  const { current, loading } = useData();
  const { data, error } = useInsights(current?.id, current?.updated_at);
  const nav = useNavigate();

  if (loading) return <Spinner />;
  if (!current) return <Empty icon={<ListChecks size={28} />} title="Nothing to do yet" text="Add data and we'll suggest what to act on first." />;

  return (
    <>
      <PageTitle title="What to do" subtitle="Suggestions based on your data, most urgent first" />
      <DatasetPicker />
      {error && <div className="mt-4"><ErrorNote message={error} /></div>}
      {!data && !error && <Spinner />}
      {data && data.actions.length === 0 && (
        <Empty icon={<ListChecks size={28} />} title="All clear" text="Nothing in this data needs urgent attention." />
      )}
      {data &&
        (["high", "medium", "low"] as const).map((p) => {
          const items = data.actions.filter((a) => a.priority === p);
          if (!items.length) return null;
          return (
            <section key={p} className="mt-6">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink-2 mb-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${PRIORITY[p].dot}`} /> {PRIORITY[p].label} priority · {items.length}
              </h2>
              <div className="flex flex-col gap-3">
                {items.map((a) => (
                  <Card key={a.id} className="p-4" onClick={() => nav(`/insights/${current.id}/${encodeURIComponent(a.insight_id)}`)}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <h3 className="text-[17px] font-semibold leading-snug">{a.title}</h3>
                        <p className="text-[15px] text-ink-2 mt-1 leading-relaxed">{a.detail}</p>
                      </div>
                      <ChevronRight size={20} className="text-mute mt-0.5 shrink-0" />
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
    </>
  );
}
