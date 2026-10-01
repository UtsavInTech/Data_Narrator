import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Insight } from "../api";
import { keyFigure } from "../insightMeta";
import { Bars, Spark } from "./Charts";

const TONE = { good: "text-good", bad: "text-bad", neutral: "text-ink" };

/** One finding: the key number, a plain sentence, and a small picture. */
export function InsightRow({ insight, datasetId, full = false }: { insight: Insight; datasetId: string; full?: boolean }) {
  const k = keyFigure(insight);
  const chart = insight.chart;
  return (
    <Link to={`/insights/${datasetId}/${encodeURIComponent(insight.id)}`}
      className="group grid grid-cols-[5.5rem_1fr] sm:grid-cols-[7rem_1fr_minmax(0,15rem)] gap-x-5 gap-y-3 px-4 sm:px-5 py-5 hover:bg-sunken/50">
      <div>
        <div className={`text-[24px] sm:text-[28px] leading-none font-semibold tracking-tight num ${TONE[k.tone]}`}>{k.value}</div>
        <div className="text-[12px] text-mute mt-1.5 leading-snug line-clamp-2">{k.caption}</div>
      </div>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-ink leading-snug">
          {insight.title}
          <ChevronRight size={15} className="inline ml-0.5 -mt-0.5 text-faint group-hover:text-ink" />
        </h3>
        <p className="text-[14px] text-ink-2 mt-1 leading-relaxed">{full ? insight.narrative : insight.summary}</p>
      </div>
      {chart && (
        <div className="col-span-2 sm:col-span-1 self-center">
          {chart.kind === "line" && <Spark values={chart.data.map((d) => d.value ?? 0)} width={240} height={44} />}
          {chart.kind === "bar" && <Bars data={chart.data} max={4} showValues={false} />}
        </div>
      )}
    </Link>
  );
}
