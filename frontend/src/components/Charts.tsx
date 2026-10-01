import { CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Chart } from "../api";
import { fmt, fmtFull } from "../format";

const INK = "#1c1b19";
const GRID = "#e6e3dc";
const tick = { fill: "#7a776f", fontSize: 12 };

/** Tiny trend line for lists. Plain SVG: exact size, no layout measuring. */
export function Spark({ values, width = 120, height = 36 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 4) + 2, height - 3 - ((v - lo) / span) * (height - 6)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="block">
      <path d={d} fill="none" stroke={INK} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.75} fill={INK} />
    </svg>
  );
}

/** Horizontal bars with labels and values as text: readable on any screen. */
export function Bars({ data, max = 6, showValues = true, column, suffix = "" }: {
  data: { label?: string; value?: number }[]; max?: number; showValues?: boolean; column?: string; suffix?: string;
}) {
  const rows = data.slice(0, max);
  const top = Math.max(...rows.map((d) => Math.abs(d.value ?? 0)), 1);
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((d, i) => {
        const v = d.value ?? 0;
        return (
          <li key={i} className={`grid ${showValues ? "grid-cols-[minmax(0,9rem)_1fr_auto]" : "grid-cols-[minmax(0,6.5rem)_1fr]"} items-center gap-3 text-[13px]`}>
            <span className="truncate text-ink-2" title={d.label}>{d.label}</span>
            <span className="h-2 rounded-full bg-sunken overflow-hidden">
              <span className={`block h-full rounded-full ${v < 0 ? "bg-bad" : i === 0 ? "bg-ink" : "bg-line-2"}`}
                style={{ width: `${Math.max(2, (Math.abs(v) / top) * 100)}%` }} />
            </span>
            {showValues && <span className={`num text-right min-w-14 ${v < 0 ? "text-bad" : "text-ink-2"}`}>{suffix ? `${v > 0 ? "+" : ""}${v}${suffix}` : fmt(v, column)}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function Tip({ active, payload, label, column }: { active?: boolean; payload?: { value: number }[]; label?: string; column?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-ink text-white rounded-md px-2.5 py-1.5 text-[12px] shadow-lg">
      <div className="opacity-70">{label}</div>
      <div className="font-medium num">{fmtFull(payload[0].value, column)}</div>
    </div>
  );
}

/** Full-size chart for an insight's own page. */
export function ChartView({ chart, height = 300, max = 15 }: { chart: Chart; height?: number; max?: number }) {
  if (chart.kind === "bar") return <Bars data={chart.data} max={max} column={chart.y} suffix={chart.y.startsWith("%") ? "%" : ""} />;
  if (chart.kind === "scatter") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis dataKey="x" type="number" name={chart.x} tick={tick} tickFormatter={(v: number) => fmt(v)} domain={["auto", "auto"]} stroke={GRID} />
          <YAxis dataKey="y" type="number" name={chart.y} tick={tick} tickFormatter={(v: number) => fmt(v)} width={52} domain={["auto", "auto"]} stroke={GRID} />
          <Scatter data={chart.data} fill={INK} fillOpacity={0.45} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chart.data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={28} />
        <YAxis tick={tick} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmt(v, chart.y)} width={64} />
        <Tooltip content={<Tip column={chart.y} />} cursor={{ stroke: "#d6d2c8" }} />
        <Line type="monotone" dataKey="value" stroke={INK} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
