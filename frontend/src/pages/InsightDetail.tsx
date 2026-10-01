import { ArrowLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { ChartView } from "../components/Charts";
import { TYPE_META } from "../components/InsightCard";
import { Card, ErrorNote, Spinner } from "../components/ui";
import { fmtFull } from "../format";
import { useData } from "../state";
import { useInsights } from "../useInsights";

export default function InsightDetail() {
  const { dsId, insightId } = useParams();
  const { datasets } = useData();
  const ds = datasets.find((d) => d.id === dsId);
  const { data, error } = useInsights(dsId, ds?.updated_at);
  const nav = useNavigate();
  const insight = data?.insights.find((i) => i.id === decodeURIComponent(insightId ?? ""));
  const related = data?.actions.filter((a) => a.insight_id === insight?.id) ?? [];

  return (
    <>
      <button type="button" onClick={() => nav(-1)} className="flex items-center gap-1.5 min-h-11 -ml-1 text-[16px] text-ink-2 mb-2">
        <ArrowLeft size={20} /> Back
      </button>
      {error && <ErrorNote message={error} />}
      {!data && !error && <Spinner />}
      {data && !insight && <ErrorNote message="This insight no longer exists. The data may have been refreshed." />}
      {insight && (
        <>
          <div className="text-[13px] text-mute font-medium uppercase tracking-wide">{TYPE_META[insight.type].label} · {data?.dataset.name}</div>
          <h1 className="text-[26px] font-semibold tracking-tight leading-tight mt-1">{insight.title}</h1>
          <p className="text-[17px] leading-relaxed text-ink-2 mt-3">{insight.narrative}</p>

          {insight.chart && (
            <Card className="p-4 mt-5">
              <ChartView chart={insight.chart} />
            </Card>
          )}

          {related.length > 0 && (
            <Card className="p-4 mt-4">
              <div className="text-[13px] text-mute font-medium uppercase tracking-wide mb-2">What to do</div>
              {related.map((a) => (
                <div key={a.id} className="py-1.5">
                  <div className="text-[16px] font-semibold">{a.title}</div>
                  <div className="text-[15px] text-ink-2 mt-0.5">{a.detail}</div>
                </div>
              ))}
            </Card>
          )}

          {insight.chart && insight.chart.kind !== "scatter" && (
            <Card className="mt-4 overflow-hidden">
              <table className="w-full text-[15px]">
                <thead>
                  <tr className="bg-canvas text-left text-mute text-[13px]">
                    <th className="font-medium px-4 py-2.5">{insight.chart.x}</th>
                    <th className="font-medium px-4 py-2.5 text-right">{insight.chart.y}</th>
                  </tr>
                </thead>
                <tbody>
                  {insight.chart.data.map((p, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-4 py-2.5">{p.label}</td>
                      <td className={`px-4 py-2.5 text-right tabular ${(p.value ?? 0) < 0 ? "text-bad" : ""}`}>{fmtFull(p.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </>
  );
}
