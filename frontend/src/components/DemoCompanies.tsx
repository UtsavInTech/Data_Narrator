import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type DemoCompany, type Role } from "../api";
import { useAuth } from "../auth";

export const ROLE_SEES: Record<Role, string> = {
  admin: "Everything: the story, reports, data sources and employees.",
  manager: "The story, insights and daily reports. No data entry.",
  operator: "Only the entry forms for the day's records.",
};

const ROLE_NAME: Record<Role, string> = { admin: "Admin", manager: "Manager", operator: "Data entry" };

/** The sample companies and their public logins, each one click away. */
export function DemoCompanies({ compact = false }: { compact?: boolean }) {
  const { enterDemo } = useAuth();
  const nav = useNavigate();
  const [companies, setCompanies] = useState<DemoCompany[] | null>(null);
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.demoCompanies().then((r) => { setCompanies(r.companies); setPassword(r.password); }).catch(() => setCompanies([]));
  }, []);

  const open = async (company: string, role: Role) => {
    setBusy(`${company}:${role}`);
    setError(null);
    try {
      await enterDemo(company, role);
      nav("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  if (companies === null) return <div className="h-40 flex items-center justify-center text-mute"><Loader2 className="animate-spin" size={18} /></div>;
  if (!companies.length) return null;
  const c = companies[Math.min(active, companies.length - 1)];

  return (
    <div>
      <div role="tablist" aria-label="Sample companies" className={`grid gap-2 ${compact ? "grid-cols-3" : "sm:grid-cols-3"}`}>
        {companies.map((co, i) => (
          <button key={co.slug} type="button" role="tab" aria-selected={i === active} onClick={() => setActive(i)}
            className={`text-left rounded-[12px] border px-4 py-3 transition-colors ${i === active ? "bg-surface border-ink shadow-[0_1px_0_rgba(0,0,0,0.04)]" : "border-line-2 hover:bg-surface"}`}>
            <span className={`block font-semibold leading-tight ${compact ? "text-[13px]" : "text-[15px]"}`}>{co.name}</span>
            <span className={`block text-mute mt-0.5 ${compact ? "text-[12px]" : "text-[13px]"}`}>{co.industry}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 bg-surface border border-line rounded-[14px] overflow-hidden" role="tabpanel">
        {!compact && (
          <div className="px-5 sm:px-6 py-5 border-b border-line">
            <div className="text-[13px] text-mute">{c.place}</div>
            <p className="text-[15px] text-ink-2 mt-1 max-w-2xl">{c.about}</p>
          </div>
        )}
        <ul className="divide-y divide-line">
          {c.accounts.map((a) => (
            <li key={a.employee_id} className={`flex flex-wrap items-center gap-x-5 gap-y-3 ${compact ? "px-4 py-3" : "px-5 sm:px-6 py-4"}`}>
              <div className="flex-1 min-w-[12rem]">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={`font-semibold ${compact ? "text-[14px]" : "text-[15px]"}`}>{ROLE_NAME[a.role]}</span>
                  <span className="text-[13px] text-mute">{a.name}, {a.job}</span>
                </div>
                {!compact && <div className="text-[13px] text-mute mt-0.5">Sees: {ROLE_SEES[a.role]}</div>}
                <div className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-ink-2">
                  <span className="text-mute">ID</span>
                  <code className="px-1.5 py-0.5 rounded-[6px] bg-sunken border border-line font-mono">{a.employee_id}</code>
                  <span className="text-mute ml-1">password</span>
                  <code className="px-1.5 py-0.5 rounded-[6px] bg-sunken border border-line font-mono">{password}</code>
                </div>
              </div>
              <button type="button" onClick={() => open(c.slug, a.role)} disabled={busy !== null}
                className="inline-flex items-center justify-center gap-2 min-h-10 px-4 rounded-[10px] text-[14px] font-medium bg-ink text-white hover:bg-ink-2 disabled:opacity-45">
                {busy === `${c.slug}:${a.role}` ? <Loader2 size={16} className="animate-spin" /> : null}
                Open as {ROLE_NAME[a.role]} <ArrowRight size={15} />
              </button>
            </li>
          ))}
        </ul>
      </div>
      {error && <p className="text-[13px] text-bad mt-2">{error}</p>}
      <p className="text-[12px] text-mute mt-3">
        Made-up companies with six months of data that ends today. Anything you enter is cleared the next day.
      </p>
    </div>
  );
}
