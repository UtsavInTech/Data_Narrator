import { useState } from "react";
import { DatasetPicker } from "../components/DatasetPicker";
import { InsightRow } from "../components/InsightRow";
import { Empty, ErrorNote, PageHeader, Panel, Section, Spinner } from "../components/ui";
import { curate, SECTIONS } from "../insightMeta";
import { useData } from "../state";
import { useInsights } from "../useInsights";

export default function Insights() {
  const { current, loading } = useData();
  const { data, error } = useInsights(current?.id, current?.updated_at);
  const [showAll, setShowAll] = useState(false);

  if (loading) return <Spinner />;
  if (!current) return <><PageHeader title="Insights" /><Empty title="No insights yet" text="Add data first. Insights appear here on their own." /></>;

  const list = data ? (showAll ? data.insights : curate(data.insights)) : [];
  const hidden = data ? data.insights.length - curate(data.insights).length : 0;

  return (
    <>
      <PageHeader title="Insights" description={data?.headline || "Everything worth knowing in this data, most important first."} actions={<DatasetPicker />} />
      {error && <ErrorNote message={error} />}
      {!data && !error && <Spinner />}
      {data && SECTIONS.map((s) => {
        const items = list.filter((i) => s.types.includes(i.type));
        if (!items.length) return null;
        return (
          <Section key={s.key} title={s.title} action={<span className="text-[13px] text-mute hidden sm:inline">{s.text}</span>}>
            <Panel className="divide-y divide-line overflow-hidden">
              {items.map((i) => <InsightRow key={i.id} insight={i} datasetId={current.id} full />)}
            </Panel>
          </Section>
        );
      })}
      {data && hidden > 0 && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="text-[14px] text-mute hover:text-ink underline underline-offset-4">
          {showAll ? "Show fewer" : `Show ${hidden} more breakdowns`}
        </button>
      )}
    </>
  );
}
