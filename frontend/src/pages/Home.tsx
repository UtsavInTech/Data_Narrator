import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { DatasetPicker } from "../components/DatasetPicker";
import { ImportsInProgress } from "../components/Imports";
import { Story } from "../components/Story";
import { Button, ErrorNote, PageHeader, Panel, Spinner } from "../components/ui";
import { pct } from "../format";
import { useData } from "../state";
import { useInsights } from "../useInsights";
import { PRIORITY } from "./Actions";
import { useState } from "react";

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
      <p className="text-[13px] text-mute mt-3">The sample company is Narmada Electricals (fictional): six months of invoices, customers, products and payments.</p>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { current, datasets, loading, error } = useData();
  const { data, error: insErr } = useInsights(current?.id, current?.updated_at);
  const busy = datasets.filter((d) => d.status === "importing" || d.status === "processing");
  const first = user!.name.split(" ")[0];

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

  return (
    <>
      <PageHeader title={`${greeting()}, ${first}`} description={data?.about ?? " "} actions={<DatasetPicker />} />
      <ImportsInProgress items={busy} />
      {insErr && <ErrorNote message={insErr} />}
      {!data && !insErr && <Spinner label="Reading the story" />}
      {data && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] gap-x-12 gap-y-10">
          <Story data={data} datasetId={current.id} />

          <aside className="space-y-8 xl:sticky xl:top-8 self-start">
            <div>
              <div className="label mb-3">At a glance</div>
              <Panel className="divide-y divide-line">
                {data.kpis.map((k) => (
                  <div key={k.label} className="px-5 py-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] text-mute">{k.label}{k.agg === "Average" ? " (avg)" : ""}</span>
                      {k.delta != null && (
                        <span className={`text-[12px] inline-flex items-center gap-0.5 num ${k.delta >= 0 ? "text-good" : "text-bad"}`}>
                          {k.delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{pct(k.delta)}
                        </span>
                      )}
                    </div>
                    <div className="text-[24px] font-semibold tracking-tight num mt-0.5">{k.display}</div>
                    {k.period && <div className="text-[12px] text-faint">latest: {k.period}</div>}
                  </div>
                ))}
              </Panel>
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-3">
                <span className="label">Needs attention</span>
                {data.actions.length > 4 && <Link to="/actions" className="text-[13px] text-mute hover:text-ink">All {data.actions.length}</Link>}
              </div>
              {data.actions.length === 0 ? <Panel className="p-5 text-[14px] text-mute">Nothing urgent.</Panel> : (
                <Panel className="divide-y divide-line overflow-hidden">
                  {data.actions.slice(0, 4).map((a) => (
                    <Link key={a.id} to={`/insights/${current.id}/${encodeURIComponent(a.insight_id)}`} className="flex gap-3 px-5 py-4 hover:bg-sunken/60">
                      <span className={`mt-[7px] w-2 h-2 rounded-full shrink-0 ${PRIORITY[a.priority].dot}`} />
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium leading-snug">{a.title}</span>
                        <span className="block text-[13px] text-mute mt-1 line-clamp-2">{a.detail}</span>
                      </span>
                    </Link>
                  ))}
                </Panel>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
