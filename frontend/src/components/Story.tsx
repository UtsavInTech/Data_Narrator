import { Link } from "react-router-dom";
import type { InsightsResponse } from "../api";
import { ChartView } from "./Charts";

/** The narration: a lead, then short sections, each with the picture that backs it. */
export function Story({ data, datasetId }: { data: InsightsResponse; datasetId: string }) {
  if (!data.story) return null;  // analysed by an older version; the server is re-reading it
  const byId = new Map(data.insights.map((i) => [i.id, i]));
  const chartFor = (key: string, insightId?: string) => {
    if (insightId && byId.get(insightId)?.chart) return byId.get(insightId)!;
    const main = data.story.facts.main_measure as string | undefined;
    if (key === "where") return data.insights.find((i) => i.type === "breakdown" && i.chart && (!main || i.facts.measure === main));
    if (key === "changes") return data.insights.find((i) => i.type === "mover");
    if (key === "collect") return data.insights.find((i) => i.type === "collect");
    return undefined;
  };
  const asOf = data.story.facts.ref_date as string | undefined;
  return (
    <article>
      <div className="label mb-3">The story so far{asOf ? ` · as of ${new Date(asOf).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}</div>
      <p className="serif text-[25px] lg:text-[28px] leading-[1.35] text-ink max-w-3xl">{data.story.lead}</p>

      <div className="mt-10 divide-y divide-line border-t border-line">
        {data.story.sections.map((s) => {
          const ins = chartFor(s.key, s.insight_id);
          return (
            <section key={s.key} className="py-8 grid xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] gap-x-10 gap-y-5">
              <div>
                <h3 className="serif text-[21px] font-medium mb-3">{s.heading}</h3>
                <div className="space-y-3 text-[15.5px] leading-[1.65] text-ink-2 max-w-2xl">
                  {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                </div>
                {ins && (
                  <Link to={`/insights/${datasetId}/${encodeURIComponent(ins.id)}`} className="inline-block mt-4 text-[14px] text-mute hover:text-ink underline underline-offset-4">
                    See the numbers
                  </Link>
                )}
              </div>
              {ins?.chart && (
                <div className="self-start bg-surface border border-line rounded-[12px] p-4">
                  <div className="text-[12px] text-mute mb-3">{ins.title}</div>
                  <ChartView chart={ins.chart} height={180} max={6} />
                </div>
              )}
            </section>
          );
        })}
      </div>
    </article>
  );
}
