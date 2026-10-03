import { ArrowDownRight, ArrowRight, ArrowUpRight, Sunrise } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Area, type AreaStatus, type Overview } from "../api";
import { Spark } from "../components/Charts";
import { useAuth } from "../auth";
import { DatasetPicker } from "../components/DatasetPicker";
import { ImportsInProgress } from "../components/Imports";
import { Story } from "../components/Story";
import { btnCls, Button, ErrorNote, PageHeader, Panel, Spinner } from "../components/ui";
import { lowerIsBetter, pct } from "../format";
import { useData } from "../state";
import { useInsights } from "../useInsights";
import { PRIORITY } from "./Actions";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** First run: three clear ways in. */
function GetStarted({ isAdmin }: { isAdmin: boolean }) {
  const nav = useNavigate();
  const { reload } = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const demo = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.loadDemo();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!isAdmin) {
    return <Panel className="p-8 max-w-2xl"><h2 className="text-[18px] font-semibold">Nothing to show yet</h2><p className="text-[15px] text-mute mt-2">Your admin hasn't added any data. Once they do, the story of your data appears here.</p></Panel>;
  }
  const steps = [
    { n: 1, title: "Add your data", text: "Upload Excel or CSV files, or connect a cloud folder or your database." },
    { n: 2, title: "Check how it was read", text: "See what each column was understood as. Nothing to set up." },
    { n: 3, title: "Read the story", text: "A written report of what changed, what's owed and what needs attention." },
  ];
  return (
    <div className="max-w-4xl">
      {error && <div className="mb-6"><ErrorNote message={error} /></div>}
      <ol className="grid md:grid-cols-3 gap-px bg-line border border-line rounded-[14px] overflow-hidden">
        {steps.map((s) => (
          <li key={s.n} className="bg-surface p-6">
            <div className="w-8 h-8 rounded-full border border-ink flex items-center justify-center text-[14px] font-semibold">{s.n}</div>
            <h3 className="text-[16px] font-semibold mt-4">{s.title}</h3>
            <p className="text-[14px] text-mute mt-1.5">{s.text}</p>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3 mt-8">
        <Button onClick={() => nav("/data/add")}>Add your data</Button>
        <Button variant="secondary" busy={busy} onClick={demo}>Load the sample company</Button>
      </div>
      <p className="text-[13px] text-mute mt-3">The sample company is Narmada Electricals (fictional): six months of invoices, customers, products and payments. Two more are under Data → Add data.</p>
    </div>
  );
}

export const STATUS: Record<AreaStatus, { dot: string; word: string }> = {
  act: { dot: "bg-bad", word: "Act" },
  watch: { dot: "bg-warn", word: "Watch" },
  fine: { dot: "bg-good", word: "Fine" },
};

const today = () => new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** One line that says what today is about. Built from the most urgent actions. */
function headline(o: Overview) {
  const urgent = o.actions.filter((a) => a.priority === "high");
  if (!urgent.length) return "Nothing urgent today. Here is where every part of the business stands.";
  const first = urgent[0].title.replace(/\.$/, "");
  const n = urgent.length;
  return `${n === 1 ? "One thing needs" : `${n} things need`} you today. Start here: ${first.charAt(0).toLowerCase()}${first.slice(1)}.`;
}

/** Every area of the business as one row: status, the number that matters, its direction, its shape. */
function StatusBoard({ areas, currentId, onPick }: { areas: Area[]; currentId: string; onPick: (id: string) => void }) {
  return (
    <section aria-labelledby="board" className="mb-12">
      <div className="flex items-baseline justify-between mb-3">
        <h2 id="board" className="label">Where things stand</h2>
        <span className="text-[12px] text-mute hidden sm:block">Pick a row to read its story below</span>
      </div>
      <div className="bg-surface border border-line rounded-[14px] overflow-hidden shadow-[0_1px_0_rgba(28,27,25,0.03),0_12px_32px_-24px_rgba(19,32,27,0.35)]">
        {areas.map((a, i) => {
          const on = a.id === currentId;
          const down = lowerIsBetter(a.name, a.kpi.label);
          const good = a.kpi.delta == null ? null : (a.kpi.delta >= 0) !== down;
          return (
            <button key={a.id} type="button" onClick={() => onPick(a.id)} aria-pressed={on}
              className={`w-full text-left grid grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[auto_minmax(9rem,13rem)_minmax(8rem,10rem)_8.5rem_minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1 px-5 py-4 transition-colors ${i ? "border-t border-line" : ""} ${on ? "bg-accent-bg/60" : "hover:bg-sunken/50"}`}>
              <span className="flex items-center" title={STATUS[a.status].word}>
                <span className={`w-2.5 h-2.5 rounded-full ${STATUS[a.status].dot}`} />
                <span className="sr-only">{STATUS[a.status].word}</span>
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold truncate">{a.name}</span>
                <span className="block text-[12px] text-mute truncate">{a.kpi.label}</span>
              </span>
              <span className="text-right md:text-left">
                <span className="block text-[20px] font-semibold tracking-tight num leading-tight">{a.kpi.display}</span>
                {a.kpi.delta != null && (
                  <span className={`text-[12px] inline-flex items-center num ${good ? "text-good" : "text-bad"}`}>
                    {a.kpi.delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{pct(a.kpi.delta)}
                    <span className="text-mute ml-1">{a.kpi.period ? `in ${a.kpi.period}` : ""}</span>
                  </span>
                )}
              </span>
              <span className="hidden md:block text-ink">{a.spark.length > 1 && <Spark values={a.spark} width={130} height={34} />}</span>
              <span className="hidden md:block text-[13px] text-ink-2 line-clamp-2 leading-snug">{a.lead}</span>
              <span className="hidden md:flex justify-end">
                {a.urgent > 0
                  ? <span className="text-[12px] font-medium text-bad bg-bad-bg rounded-full px-2.5 py-1 whitespace-nowrap">{a.urgent} to act</span>
                  : <span className="text-[12px] text-mute whitespace-nowrap">No action</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { current, datasets, loading, error, select } = useData();
  const { data, error: insErr } = useInsights(current?.id, current?.updated_at);
  const busy = datasets.filter((d) => d.status === "importing" || d.status === "processing");
  const first = user!.name.split(" ")[0];
  const [overview, setOverview] = useState<Overview | null>(null);
  const readyStamp = datasets.filter((d) => d.status === "ready").map((d) => d.updated_at).join(",");
  useEffect(() => {
    api.overview().then(setOverview).catch(() => setOverview(null));
  }, [readyStamp]);

  if (loading) return <Spinner />;
  if (error) return <ErrorNote message={error} />;

  if (!current) {
    return (
      <>
        <PageHeader title={`${greeting()}, ${first}`} description={busy.length ? "Your data is being prepared." : "Let's get your first data in."} />
        <ImportsInProgress items={busy} />
        {!busy.length && <GetStarted isAdmin={user!.role === "admin"} />}
      </>
    );
  }

  const board = !!overview && overview.areas.length > 0;
  const todo = board
    ? overview!.actions.map((a) => ({ ...a, href: `/insights/${a.dataset_id}/${encodeURIComponent(a.insight_id)}` }))
    : (data?.actions ?? []).map((a) => ({ ...a, dataset: "", href: `/insights/${current.id}/${encodeURIComponent(a.insight_id)}` }));

  return (
    <>
      {/* Masthead: the morning edition */}
      <header className="mb-10 pb-8 border-b border-ink/80">
        <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] uppercase tracking-[0.08em] text-mute">
          <span>{user!.company || "Your business"} · Morning edition</span>
          <span className="num">{today()}</span>
        </div>
        <h1 className="serif text-[40px] lg:text-[52px] leading-[1.02] font-medium mt-5">{greeting()}, {first}.</h1>
        {board && <p className="serif text-[21px] lg:text-[24px] leading-[1.35] text-ink-2 mt-3 max-w-3xl">{headline(overview!)}</p>}
        <div className="flex flex-wrap gap-2.5 mt-6">
          <Link to="/brief" className={`${btnCls("primary")} gap-2`}><Sunrise size={17} className="text-accent" /> Today's brief</Link>
          {todo.length > 0 && <a href="#act" className={btnCls("secondary")}>What to act on <ArrowRight size={16} /></a>}
        </div>
      </header>

      <ImportsInProgress items={busy} />
      {board && <StatusBoard areas={overview!.areas} currentId={current.id} onPick={(id) => { select(id); document.getElementById("story")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />}

      {todo.length > 0 && (
        <section id="act" aria-labelledby="act-h" className="mb-14 scroll-mt-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 id="act-h" className="label">Act on today</h2>
            {todo.length > 5 && <Link to="/actions" className="text-[13px] text-mute hover:text-ink">All {board ? overview!.total_actions : todo.length}</Link>}
          </div>
          <ol className="grid md:grid-cols-2 xl:grid-cols-3 gap-x-10 gap-y-7">
            {todo.slice(0, 6).map((a, i) => (
              <li key={a.href + a.id}>
                <Link to={a.href} className="group grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3">
                  <span className="serif text-[30px] leading-none text-faint group-hover:text-accent transition-colors num">{i + 1}</span>
                  <span className="min-w-0 border-t-2 pt-2.5 border-ink/85">
                    <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.06em] text-mute">
                      <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY[a.priority].dot}`} />{a.dataset || current.name}
                    </span>
                    <span className="block text-[16px] font-semibold leading-snug mt-1.5 group-hover:underline underline-offset-4 decoration-1">{a.title}</span>
                    <span className="block text-[14px] text-ink-2 mt-1 leading-snug line-clamp-3">{a.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* The story of the chosen area */}
      <section id="story" className="scroll-mt-6 pt-8 border-t border-line">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div className="min-w-0">
            <div className="label mb-1.5">The story</div>
            <h2 className="serif text-[30px] leading-tight font-medium">{overview?.areas.find((x) => x.id === current.id)?.name ?? current.name}</h2>
            {data?.about && <p className="text-[14px] text-mute mt-1 max-w-3xl">{data.about}</p>}
          </div>
          <DatasetPicker />
        </div>
        {insErr && <ErrorNote message={insErr} />}
        {!data && !insErr && <Spinner label="Reading the story" />}
        {data && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_19rem] gap-x-12 gap-y-10">
            <div className="min-w-0"><Story data={data} datasetId={current.id} /></div>
            <aside className="xl:sticky xl:top-8 self-start">
              <div className="label mb-3">At a glance</div>
              <Panel className="divide-y divide-line">
                {data.kpis.map((k) => (
                  <div key={k.label} className="px-5 py-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] text-mute">{k.label}{k.agg === "Average" ? " (avg)" : ""}</span>
                      {k.delta != null && (
                        <span className={`text-[12px] inline-flex items-center gap-0.5 num ${(k.delta >= 0) !== lowerIsBetter(current.name, k.label) ? "text-good" : "text-bad"}`}>
                          {k.delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{pct(k.delta)}
                        </span>
                      )}
                    </div>
                    <div className="text-[24px] font-semibold tracking-tight num mt-0.5">{k.display}</div>
                    {k.period && <div className="text-[12px] text-faint">latest: {k.period}</div>}
                  </div>
                ))}
              </Panel>
            </aside>
          </div>
        )}
      </section>
    </>
  );
}
