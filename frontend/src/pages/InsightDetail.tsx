import { useParams } from "react-router-dom";
import { ChartView } from "../components/Charts";
import { ErrorNote, PageHeader, Panel, Section, Spinner } from "../components/ui";
import { fmtFull } from "../format";
import { keyFigure, SECTIONS } from "../insightMeta";
import { useData } from "../state";
import { useInsights } from "../useInsights";
import { PRIORITY } from "./Actions";

export default function InsightDetail() {
  const { dsId, insightId } = useParams();
  const { datasets } = useData();
  const ds = datasets.find((d) => d.id === dsId);
  const { data, error } = useInsights(dsId, ds?.updated_at);
  const insight = data?.insights.find((i) => i.id === decodeURIComponent(insightId ?? ""));
  const related = data?.actions.filter((a) => a.insight_id === insight?.id) ?? [];
  const back = { to: "/insights", label: "Insights" };

  if (error) return <><PageHeader title="Insight" back={back} /><ErrorNote message={error} /></>;
  if (!data) return <Spinner />;
  if (!insight) return <><PageHeader title="Insight" back={back} /><ErrorNote message="This insight is no longer there. The data may have been refreshed." /></>;

  const k = keyFigure(insight);
  const section = SECTIONS.find((s) => s.types.includes(insight.type));
  return (
    <>
      <PageHeader back={back} title={insight.title} description={`${section?.title ?? ""} · ${data.dataset.name}`} />
      <div className="grid grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)] gap-8 mb-10">
        <div>
          <div className={`text-[44px] leading-none font-semibold tracking-tight num ${k.tone === "good" ? "text-good" : k.tone === "bad" ? "text-bad" : "text-ink"}`}>{k.value}</div>
          <div className="text-[14px] text-mute mt-2">{k.caption}</div>
        </div>
        <p className="text-[17px] leading-relaxed text-ink-2 max-w-2xl">{insight.narrative}</p>
      </div>

      {related.length > 0 && (
        <Section title="What to do">
          <Panel className="divide-y divide-line">
            {related.map((a) => (
              <div key={a.id} className="p-5 flex gap-3">
                <span className={`mt-[7px] w-2 h-2 rounded-full shrink-0 ${PRIORITY[a.priority].dot}`} />
                <div>
                  <div className="text-[15px] font-semibold">{a.title}</div>
                  <div className="text-[14px] text-ink-2 mt-0.5">{a.detail}</div>
                </div>
              </div>
            ))}
          </Panel>
        </Section>
      )}

      {insight.chart && (
        <Section title="The numbers">
          <Panel className="p-5">
            <ChartView chart={insight.chart} />
          </Panel>
          {insight.chart.kind === "line" && (
            <Panel className="mt-3 overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead><tr className="text-left text-mute text-[12px]"><th className="font-medium px-5 py-2.5">{insight.chart.x}</th><th className="font-medium px-5 py-2.5 text-right">{insight.chart.y}</th></tr></thead>
                <tbody>
                  {[...insight.chart.data].reverse().map((p, i) => (
                    <tr key={i} className="border-t border-line"><td className="px-5 py-2.5">{p.label}</td><td className="px-5 py-2.5 text-right num">{fmtFull(p.value)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </Section>
      )}
    </>
  );
}
