import type { Action } from "../api";
import { DatasetPicker } from "../components/DatasetPicker";
import { Empty, ErrorNote, PageHeader, Panel, Row, Section, Spinner } from "../components/ui";
import { useData } from "../state";
import { useInsights } from "../useInsights";

export const PRIORITY: Record<Action["priority"], { label: string; dot: string }> = {
  high: { label: "Act first", dot: "bg-bad" },
  medium: { label: "Soon", dot: "bg-warn" },
  low: { label: "When you can", dot: "bg-line-2" },
};

export default function Actions() {
  const { current, loading } = useData();
  const { data, error } = useInsights(current?.id, current?.updated_at);
  if (loading) return <Spinner />;
  if (!current) return <><PageHeader title="Needs attention" /><Empty title="Nothing yet" text="Add data and suggestions appear here." /></>;
  return (
    <>
      <PageHeader title="Needs attention" description="Suggestions from your data, most urgent first." actions={<DatasetPicker />} back={{ to: "/", label: "Overview" }} />
      {error && <ErrorNote message={error} />}
      {!data && !error && <Spinner />}
      {data && !data.actions.length && <Empty title="All clear" text="Nothing in this data needs attention right now." />}
      {data && (["high", "medium", "low"] as const).map((p) => {
        const items = data.actions.filter((a) => a.priority === p);
        if (!items.length) return null;
        return (
          <Section key={p} title={<span className="inline-flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${PRIORITY[p].dot}`} />{PRIORITY[p].label}</span>}>
            <Panel className="divide-y divide-line overflow-hidden">
              {items.map((a) => (
                <Row key={a.id} to={`/insights/${current.id}/${encodeURIComponent(a.insight_id)}`} className="items-start">
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium">{a.title}</span>
                    <span className="block text-[14px] text-ink-2 mt-0.5">{a.detail}</span>
                  </span>
                </Row>
              ))}
            </Panel>
          </Section>
        );
      })}
    </>
  );
}
