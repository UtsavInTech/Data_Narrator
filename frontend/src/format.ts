// Numbers the way Indian businesses read them: ₹4.5 L, ₹1.43 Cr.
// Kept in step with MONEY_NAME / NOT_MONEY in backend/datanarrator/engine/fmt.py.
const MONEY = /revenue|sales|amount|amt|value|total|price|cost|paid|received|collected|gst|tax|profit|income|expense|salary|balance|due|outstanding|turnover|fee|budget|target|mrp|rate|freight|fare|charges?|payable|receivable/i;
const NOT_MONEY = /qty|quantity|units|count|items|bills|%|percent|pct|ratio|score|\bage\b|days|hours/i;

export const isMoney = (name?: string) => !!name && MONEY.test(name) && !NOT_MONEY.test(name);

function short(v: number): string {
  const a = Math.abs(v);
  const trim = (x: number, d = 2) => x.toFixed(d).replace(/\.?0+$/, "");
  if (a >= 1e7) return `${trim(v / 1e7)} Cr`;
  if (a >= 1e5) return `${trim(v / 1e5)} L`;
  if (a >= 1000) return Math.round(v).toLocaleString("en-IN");
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/** Compact number; ₹ when the column is money. */
export const fmt = (v: number | null | undefined, column?: string) =>
  v == null ? "–" : `${isMoney(column) ? (v < 0 ? "−₹" : "₹") : ""}${short(isMoney(column) ? Math.abs(v) : v)}`;

/** Full number with Indian grouping (12,34,567). Money over ₹1,000 is shown in whole rupees, as in a ledger. */
export const fmtFull = (v: number | null | undefined, column?: string) => {
  if (v == null) return "–";
  const money = isMoney(column);
  return `${money ? "₹" : ""}${v.toLocaleString("en-IN", { maximumFractionDigits: money && Math.abs(v) >= 1000 ? 0 : 2 })}`;
};

/** Numbers where a fall is good news (returns, rejections, delays, costs). Kept in step with BAD and COST in engine/actions.py. */
const LOWER_IS_BETTER = /reject|wastage|waste|scrap|return|loss|damage|defect|delay|complaint|breakdown|leak|shortage|absent|downtime|cancel|refund|claim|accident|penalt|spoil|expir|cost|expense|fuel|diesel|petrol|toll|repair|maintenance/i;
export const lowerIsBetter = (...names: (string | undefined)[]) => names.some((n) => !!n && LOWER_IS_BETTER.test(n));

export const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0)}%`;

export function ago(ts: number) {
  const s = Date.now() / 1000 - ts;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** "Invoices" -> "invoice": the name of one record, for "New invoice". */
export function singular(table: string) {
  const t = table.trim();
  const last = t.split(/\s+/).pop()?.toLowerCase() ?? "";
  if (/(sales|details|status|data)$/.test(last) || !last.endsWith("s") || last.endsWith("ss")) return `${t} entry`;
  if (last.endsWith("ies")) return t.slice(0, -3) + "y";
  return t.slice(0, -1);
}
