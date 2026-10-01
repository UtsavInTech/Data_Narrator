import { Activity, AlertTriangle, BarChart3, GitCompareArrows, ShieldAlert, TrendingUp, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Insight } from "../api";
import { ChartView } from "./Charts";
import { Card } from "./ui";

export const TYPE_META: Record<Insight["type"], { label: string; icon: typeof Activity }> = {
  trend: { label: "Trend", icon: TrendingUp },
  breakdown: { label: "Breakdown", icon: BarChart3 },
  top: { label: "Top performers", icon: Trophy },
  correlation: { label: "Relationship", icon: GitCompareArrows },
  outlier: { label: "Unusual", icon: AlertTriangle },
  quality: { label: "Data quality", icon: ShieldAlert },
};

export function InsightCard({ insight, datasetId, compact = false }: { insight: Insight; datasetId: string; compact?: boolean }) {
  const nav = useNavigate();
  const meta = TYPE_META[insight.type];
  const Icon = meta.icon;
  return (
    <Card onClick={() => nav(`/insights/${datasetId}/${encodeURIComponent(insight.id)}`)} className="p-4">
      <div className="flex items-center gap-2 text-[13px] text-mute font-medium uppercase tracking-wide">
        <Icon size={15} /> {meta.label}
      </div>
      <h3 className="text-[17px] font-semibold mt-1.5 leading-snug">{insight.title}</h3>
      <p className="text-[15px] text-ink-2 mt-1 leading-relaxed">{compact ? insight.summary : insight.narrative}</p>
      {insight.chart && (
        <div className="mt-3 -mx-1 pointer-events-none">
          <ChartView chart={insight.chart} compact />
        </div>
      )}
    </Card>
  );
}
