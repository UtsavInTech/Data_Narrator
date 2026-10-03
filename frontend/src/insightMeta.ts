import type { Insight } from "./api";
import { fmt } from "./format";

/** The one number a reader should see first, with a few words of context. */
export function keyFigure(i: Insight): { value: string; caption: string; tone: "good" | "bad" | "neutral" } {
  const f = i.facts ?? {};
  const pc = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(Math.abs(x) < 0.1 ? 1 : 0)}%`;
  const share = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
  switch (i.type) {
    case "collect":
      return f.overdue_total
        ? { value: fmt(f.overdue_total, "amount"), caption: "overdue", tone: "bad" }
        : { value: fmt(f.open_total, "amount"), caption: "to collect", tone: "neutral" };
    case "mover":
      return { value: pc(f.change ?? 0), caption: `${f.group} vs usual`, tone: (f.change ?? 0) >= 0 ? "good" : "bad" };
    case "drift":
      return { value: pc(f.change ?? 0), caption: `${f.group}, ${f.month}`, tone: "bad" };
    case "trend":
      if (typeof f.change === "number") return { value: pc(f.change), caption: f.change >= 0 ? "growth over the period" : "drop over the period", tone: f.change >= 0.05 ? "good" : f.change <= -0.05 ? "bad" : "neutral" };
      return { value: fmt(i.chart?.data.at(-1)?.value, f.measure), caption: `latest, ${f.latest_period ?? ""}`, tone: "neutral" };
    case "breakdown":
      if (f.negatives?.length) return { value: String(f.negatives.length), caption: `with negative ${f.measure}`, tone: "bad" };
      if (typeof f.top_share === "number") return { value: share(f.top_share), caption: `comes from ${f.top}`, tone: "neutral" };
      return { value: fmt(f.top_value, f.measure), caption: `highest: ${f.top}`, tone: "neutral" };
    case "top":
      return { value: share(f.top20_share ?? 0), caption: "comes from the top 20%", tone: "neutral" };
    case "correlation":
      return { value: (f.r ?? 0).toFixed(2), caption: "correlation", tone: "neutral" };
    case "outlier":
      return { value: (f.count ?? 0).toLocaleString(), caption: "unusual rows", tone: "bad" };
    default:
      return typeof f.null_pct === "number"
        ? { value: `${Math.round(f.null_pct)}%`, caption: "empty", tone: "bad" }
        : { value: (f.count ?? 0).toLocaleString(), caption: "duplicates", tone: "bad" };
  }
}

export const SECTIONS: { key: string; title: string; text: string; types: Insight["type"][] }[] = [
  { key: "collect", title: "Money to collect", text: "What is unpaid and how late it is.", types: ["collect"] },
  { key: "change", title: "What changed", text: "How the main numbers moved, and which groups moved most.", types: ["drift", "trend", "mover"] },
  { key: "where", title: "Where it comes from", text: "Which groups make up the totals.", types: ["breakdown"] },
  { key: "who", title: "Who matters most", text: "The few customers, products or people behind most of the result.", types: ["top"] },
  { key: "check", title: "Worth a closer look", text: "Unusual values and numbers that move together.", types: ["outlier", "correlation"] },
  { key: "quality", title: "Data quality", text: "Gaps and duplicates that can make totals wrong.", types: ["quality"] },
];

/** Breakdowns repeat a lot (every number × every category). Keep the best one per category. */
export function curate(list: Insight[]): Insight[] {
  const seenDim = new Set<string>();
  return list.filter((i) => {
    if (i.type !== "breakdown") return true;
    const d = i.facts?.dimension ?? i.id;
    if (seenDim.has(d)) return false;
    seenDim.add(d);
    return true;
  });
}

/** For Home: strongest findings, one of each kind first. */
export function highlights(list: Insight[], n: number): Insight[] {
  const curated = curate(list).filter((i) => i.type !== "quality");
  const seen = new Set<string>();
  const first = curated.filter((i) => !seen.has(i.type) && seen.add(i.type));
  return [...first, ...curated.filter((i) => !first.includes(i))].slice(0, n);
}
