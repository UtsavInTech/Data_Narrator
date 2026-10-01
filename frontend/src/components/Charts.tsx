import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Chart } from "../api";
import { fmt, fmtFull } from "../format";

const INK = "#27272a";
const SOFT = "#a1a1aa";
const BAD = "#b91c1c";
const GRID = "#e4e4e7";
const tick = { fill: "#71717a", fontSize: 13 };

function TipBox({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: Record<string, unknown> }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="bg-ink text-white rounded-lg px-3 py-2 text-[13px] shadow-lg">
      <div className="opacity-70">{label ?? String(p.payload.label ?? "")}</div>
      <div className="font-semibold tabular">{fmtFull(p.value)}</div>
    </div>
  );
}

export function ChartView({ chart, compact = false }: { chart: Chart; compact?: boolean }) {
  const data = chart.data;
  if (chart.kind === "line") {
    return (
      <ResponsiveContainer width="100%" height={compact ? 120 : 300}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: compact ? 8 : 0, bottom: 0 }}>
          {!compact && <CartesianGrid stroke={GRID} vertical={false} />}
          <XAxis dataKey="label" hide={compact} tick={tick} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
          <YAxis hide={compact} tick={tick} tickLine={false} axisLine={false} tickFormatter={fmt} width={52} />
          <Tooltip content={<TipBox />} cursor={{ stroke: SOFT }} />
          <Line type="monotone" dataKey="value" stroke={INK} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  if (chart.kind === "scatter") {
    return (
      <ResponsiveContainer width="100%" height={compact ? 120 : 300}>
        <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {!compact && <CartesianGrid stroke={GRID} />}
          <XAxis dataKey="x" type="number" name={chart.x} hide={compact} tick={tick} tickFormatter={fmt} domain={["auto", "auto"]} />
          <YAxis dataKey="y" type="number" name={chart.y} hide={compact} tick={tick} tickFormatter={fmt} width={52} domain={["auto", "auto"]} />
          <Scatter data={data} fill={INK} fillOpacity={0.55} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }
  // Horizontal bars: category labels stay readable on narrow phone screens.
  const rows = compact ? data.slice(0, 5) : data;
  const height = Math.max(compact ? 0 : 160, rows.length * (compact ? 26 : 36) + 16);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap={compact ? 4 : 8}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={compact ? 96 : 130}
          tick={{ ...tick, fontSize: compact ? 12 : 13 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => (v.length > 16 ? v.slice(0, 15) + "…" : v)}
        />
        <Tooltip content={<TipBox />} cursor={{ fill: "#f4f4f5" }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={!compact}>
          {rows.map((p, i) => (
            <Cell key={i} fill={(p.value ?? 0) < 0 ? BAD : i === 0 ? INK : SOFT} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
