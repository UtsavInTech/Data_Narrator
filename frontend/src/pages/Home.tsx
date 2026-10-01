import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DatasetPicker } from "../components/DatasetPicker";
import { ImportsInProgress } from "../components/Imports";
import { InsightRow } from "../components/InsightRow";
import { Button, Empty, ErrorNote, PageHeader, Panel, Row, Section, SeeAll, Spinner } from "../components/ui";
import { useAuth } from "../auth";
import { pct } from "../format";
import { highlights } from "../insightMeta";
import { useData } from "../state";
import { useInsights } from "../useInsights";
import { PRIORITY } from "./Actions";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Home() {
  const { user } = useAuth();
  const { current, datasets, loading, error } = useData();
  const { data, error: insErr } = useInsights(current?.id, current?.updated_at);
  const nav = useNavigate();
  const busy = datasets.filter((d) => d.status === "importing" || d.status === "processing");
  const first = user!.name.split(" ")[0];

  if (loading) return <Spinner />;
  if (error) return <ErrorNote message={error} />;

  if (!current) {
    return (
      <>
        <PageHeader title={`${greeting()}, ${first}`} description="Let's get your first data in." />
        <ImportsInProgress items={busy} />
        {!busy.length && (
          <Empty
            title="No data yet"
            text={<>Add an Excel file or connect your company database. Data Narrator reads it, works out what each column means, and shows what matters, in plain words.</>}
            action={user!.role === "admin" ? <Button onClick={() => nav("/data/add")}>Add data</Button> : undefined}
          />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader title={`${greeting()}, ${first}`} description="Here's what your data says." actions={<DatasetPicker />} />
      <ImportsInProgress items={busy} />

      {insErr && <ErrorNote message={insErr} />}
      {!data && !insErr && <Spinner label="Reading insights" />}
      {data && (
        <>
          <Panel className="grid grid-cols-2 lg:grid-cols-4 mb-10 overflow-hidden">
            {data.kpis.map((k, i) => (
              <div key={k.label} className={`p-5 ${i % 2 ? "border-l border-line" : ""} ${i >= 2 ? "border-t lg:border-t-0 border-line" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
                <div className="text-[13px] text-mute truncate">{k.agg === "Count" ? "Records" : k.label}{k.agg === "Average" ? " (avg)" : ""}</div>
                <div className="text-[26px] sm:text-[30px] leading-tight font-semibold tracking-tight num mt-1 truncate" title={String(k.value)}>{k.display}</div>
                {k.delta != null ? (
                  <div className={`text-[13px] mt-1 flex items-center gap-1 ${k.delta >= 0 ? "text-good" : "text-bad"}`}>
                    {k.delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    <span className="num">{pct(k.delta)}</span>
                    <span className="text-mute truncate">in {k.period}</span>
                  </div>
                ) : <div className="text-[13px] mt-1 text-faint">All time</div>}
              </div>
            ))}
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-x-8">
            <Section title="Key findings" action={<SeeAll to="/insights">All insights</SeeAll>}>
              <Panel className="divide-y divide-line overflow-hidden">
                {highlights(data.insights, 4).map((i) => <InsightRow key={i.id} insight={i} datasetId={current.id} />)}
              </Panel>
            </Section>

            <Section title="Needs attention" action={data.actions.length > 3 ? <SeeAll to="/actions" /> : undefined}>
              {data.actions.length === 0 ? (
                <Panel className="p-5 text-[14px] text-mute">Nothing urgent in this data.</Panel>
              ) : (
                <Panel className="divide-y divide-line overflow-hidden">
                  {data.actions.slice(0, 3).map((a) => (
                    <Row key={a.id} to={`/insights/${current.id}/${encodeURIComponent(a.insight_id)}`} className="items-start">
                      <span className={`mt-[7px] w-2 h-2 rounded-full shrink-0 ${PRIORITY[a.priority].dot}`} />
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium leading-snug">{a.title}</span>
                        <span className="block text-[13px] text-mute mt-0.5">{PRIORITY[a.priority].label}</span>
                      </span>
                    </Row>
                  ))}
                </Panel>
              )}
            </Section>
          </div>
        </>
      )}
    </>
  );
}
