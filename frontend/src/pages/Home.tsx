import { ArrowDownRight, ArrowUpRight, ChevronRight, Database, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { Insight } from "../api";
import { DatasetPicker } from "../components/DatasetPicker";
import { InsightCard } from "../components/InsightCard";
import { Button, Card, Empty, ErrorNote, SectionTitle, Spinner } from "../components/ui";
import { pct } from "../format";
import { useData } from "../state";
import { useInsights } from "../useInsights";
import { PRIORITY } from "./Actions";

/** Top insights, but at most one of each kind first, so Home isn't four trend lines. */
function varied(list: Insight[], n: number) {
  const seen = new Set<string>();
  const first = list.filter((i) => i.type !== "quality" && !seen.has(i.type) && seen.add(i.type));
  return [...first, ...list.filter((i) => !first.includes(i))].slice(0, n);
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Home() {
  const { current, datasets, loading, error } = useData();
  const { data, error: insErr } = useInsights(current?.id, current?.updated_at);
  const nav = useNavigate();
  const busy = datasets.filter((d) => d.status === "importing" || d.status === "processing");

  if (loading) return <Spinner />;
  if (error) return <div className="pt-6"><ErrorNote message={error} /></div>;
  if (!current) {
    return busy.length ? (
      <Spinner label={`Reading ${busy[0].name}…`} />
    ) : (
      <Empty
        icon={<Database size={28} />}
        title="Welcome to Data Narrator"
        text="Add an Excel file, a cloud link or a database. We'll work out what's in it and explain it in plain words."
        action={<Button onClick={() => nav("/data/add")}><Plus size={20} /> Add your data</Button>}
      />
    );
  }

  return (
    <>
      <p className="text-[15px] text-mute">{greeting()}</p>
      <h1 className="text-[26px] font-semibold tracking-tight leading-tight mb-3">Here's what your data says</h1>
      <DatasetPicker />

      {busy.length > 0 && (
        <Link to="/data" className="mt-4 flex items-center gap-3 rounded-xl bg-surface border border-line px-4 min-h-12 text-[15px]">
          <span className="w-2 h-2 rounded-full bg-ink animate-pulse" />
          <span className="flex-1">Working on {busy.length} source{busy.length > 1 ? "s" : ""}…</span>
          <ChevronRight size={18} className="text-mute" />
        </Link>
      )}

      {insErr && <div className="mt-5"><ErrorNote message={insErr} /></div>}
      {!data && !insErr && <Spinner label="Reading insights" />}
      {data && (
        <>
          {data.headline && (
            <Card className="p-5 mt-5 bg-ink! border-ink! text-white">
              <div className="text-[13px] uppercase tracking-wide opacity-60 font-medium">The story so far</div>
              <p className="text-[17px] leading-relaxed mt-2">{data.headline}</p>
            </Card>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            {data.kpis.map((k) => (
              <Card key={k.label} className="p-4">
                <div className="text-[14px] text-mute truncate">{k.agg === "Count" ? "Rows" : `${k.agg} ${k.label.toLowerCase()}`}</div>
                <div className="text-[28px] font-semibold tracking-tight tabular mt-1 truncate" title={String(k.value)}>{k.display}</div>
                {k.delta != null && (
                  <div className={`text-[13px] font-medium mt-1 flex items-center gap-0.5 ${k.delta >= 0 ? "text-good" : "text-bad"}`}>
                    {k.delta >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                    {pct(k.delta)} <span className="text-mute font-normal ml-1 truncate">{k.period}</span>
                  </div>
                )}
              </Card>
            ))}
          </div>

          <SectionTitle to="/insights">Top insights</SectionTitle>
          <div className="grid lg:grid-cols-2 gap-3">
            {varied(data.insights, 4).map((i) => (
              <InsightCard key={i.id} insight={i} datasetId={current.id} compact />
            ))}
          </div>

          {data.actions.length > 0 && (
            <>
              <SectionTitle to="/actions">What to do next</SectionTitle>
              <Card className="divide-y divide-line">
                {data.actions.slice(0, 3).map((a) => (
                  <Link key={a.id} to="/actions" className="flex items-start gap-3 p-4 min-h-16">
                    <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${PRIORITY[a.priority].dot}`} />
                    <span className="flex-1">
                      <span className="block text-[16px] font-medium leading-snug">{a.title}</span>
                      <span className="block text-[14px] text-mute mt-0.5">{PRIORITY[a.priority].label} priority</span>
                    </span>
                    <ChevronRight size={18} className="text-mute mt-1" />
                  </Link>
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
