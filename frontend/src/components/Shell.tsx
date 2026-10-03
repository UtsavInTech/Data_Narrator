import { ClipboardList, Database, FileSpreadsheet, Home, Lightbulb, Loader2, LogOut, Settings, Sunrise } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { api, fileUrl, type DemoCompany, type MisTable, type Role } from "../api";
import { useAuth } from "../auth";
import { Sheet } from "./ui";

type Item = { to: string; label: string; icon: typeof Home; end?: boolean; phone?: boolean };

/** What each role sees. Kept short on purpose. `phone: false` keeps an item off the phone's bottom bar. */
export const NAV: Record<Role, Item[]> = {
  admin: [
    { to: "/", label: "Overview", icon: Home, end: true },
    { to: "/brief", label: "Morning brief", icon: Sunrise },
    { to: "/insights", label: "Insights", icon: Lightbulb, phone: false },
    { to: "/entry", label: "Record data", icon: ClipboardList },
    { to: "/reports", label: "Reports", icon: FileSpreadsheet },
    { to: "/data", label: "Data", icon: Database, phone: false },
  ],
  manager: [
    { to: "/", label: "Overview", icon: Home, end: true },
    { to: "/brief", label: "Morning brief", icon: Sunrise },
    { to: "/insights", label: "Insights", icon: Lightbulb },
    { to: "/reports", label: "Reports", icon: FileSpreadsheet },
  ],
  operator: [{ to: "/entry", label: "Record data", icon: ClipboardList }],
};

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", manager: "Manager", operator: "Data entry" };

const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

/** Pages always open at the top. */
function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Templates() {
  const [open, setOpen] = useState(false);
  const [tables, setTables] = useState<MisTable[]>([]);
  useEffect(() => {
    if (open) api.misTables().then((r) => setTables(r.tables)).catch(() => setTables([]));
  }, [open]);
  return (
    <>
      <footer className="mt-16 pt-5 border-t border-line flex flex-wrap items-center justify-between gap-3 text-[13px] text-mute">
        <span>Data Narrator</span>
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 hover:text-ink min-h-9">
          <FileSpreadsheet size={15} /> Excel templates
        </button>
      </footer>
      <Sheet open={open} onClose={() => setOpen(false)} title="Excel templates">
        <p className="text-[14px] text-mute mb-3">Blank sheets with the right columns and dropdowns. Fill one in and upload it from Entry; it is added to the same table.</p>
        <div className="-mx-2">
          {tables.map((t) => (
            <a key={t.id} href={fileUrl(`/api/mis/${t.id}/template.xlsx`)} className="flex items-center gap-3 px-2 py-3 rounded-[10px] hover:bg-sunken">
              <FileSpreadsheet size={18} className="text-mute shrink-0" />
              <span className="flex-1 truncate text-[15px]">{t.name}</span>
              <span className="text-[13px] text-mute">.xlsx</span>
            </a>
          ))}
          {!tables.length && <p className="px-2 text-[14px] text-mute">No tables yet.</p>}
        </div>
      </Sheet>
    </>
  );
}

/** In a sample company: who you are, and one click to see it as another role or company. */
function DemoBar() {
  const { user, enterDemo, logout } = useAuth();
  const nav = useNavigate();
  const [companies, setCompanies] = useState<DemoCompany[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    api.demoCompanies().then((r) => setCompanies(r.companies)).catch(() => setCompanies([]));
  }, []);
  const go = async (company: string, role: Role) => {
    setBusy(`${company}:${role}`);
    try {
      await enterDemo(company, role);
      nav("/");
    } finally {
      setBusy(null);
    }
  };
  const company = user!.demo_slug!;
  const roles: Role[] = ["admin", "manager", "operator"];
  return (
    <div className="bg-accent-bg text-ink text-[13px] border-b border-accent/40">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-8 lg:px-12 py-2 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="text-ink-2">
          <b className="font-semibold text-ink">Sample company.</b> You're {user!.name}, {ROLE_LABEL[user!.role].toLowerCase()}.
        </span>
        <span className="flex items-center gap-1" role="group" aria-label="See it as">
          <span className="text-mute mr-1">See it as</span>
          {roles.map((r) => (
            <button key={r} type="button" disabled={busy !== null || r === user!.role} onClick={() => go(company, r)}
              aria-pressed={r === user!.role}
              className={`min-h-7 px-2.5 rounded-[6px] inline-flex items-center gap-1 ${r === user!.role ? "bg-ink text-white font-medium" : "text-ink-2 hover:bg-white/70"}`}>
              {busy === `${company}:${r}` && <Loader2 size={12} className="animate-spin" />}{ROLE_LABEL[r]}
            </button>
          ))}
        </span>
        {companies.length > 1 && (
          <label className="flex items-center gap-2">
            <span className="text-mute">Company</span>
            <select value={company} disabled={busy !== null} onChange={(e) => go(e.target.value, user!.role)}
              className="bg-white/80 border border-accent/40 rounded-[6px] min-h-7 px-2 text-ink outline-none">
              {companies.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </label>
        )}
        <button type="button" onClick={() => { logout(); nav("/"); }} className="ml-auto text-ink-2 hover:text-ink underline underline-offset-2">
          Leave the sample
        </button>
      </div>
    </div>
  );
}

function Monogram({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size }}
      className="rounded-[9px] bg-accent text-frame font-semibold flex items-center justify-center shrink-0 text-[14px] tracking-tight">
      {initials(name)}
    </span>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const items = NAV[user!.role];
  const phoneItems = [...items.filter((i) => i.phone !== false), { to: "/settings", label: "Settings", icon: Settings }];
  const company = user!.company || "Data Narrator";
  return (
    <div className="min-h-full lg:flex">
      <ScrollTop />
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 h-screen sticky top-0 bg-frame text-frame-ink">
        <div className="flex items-center gap-3 px-5 pt-6 pb-7">
          <Monogram name={company} />
          <span className="min-w-0 leading-tight">
            <span className="block text-[15px] font-semibold tracking-tight truncate" title={company}>{company}</span>
            <span className="block text-[11px] text-frame-mute mt-0.5">{user!.company ? "on Data Narrator" : "Your workspace"}</span>
          </span>
        </div>
        <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
          {[...items, { to: "/settings", label: "Settings", icon: Settings }].map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `relative flex items-center gap-3 h-10 px-3 rounded-[8px] text-[14px] transition-colors ${isActive ? "bg-frame-2 text-white font-medium" : "text-frame-mute hover:text-white hover:bg-frame-2/60"}`}>
              {({ isActive }) => <>
                {isActive && <span className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r bg-accent" aria-hidden="true" />}
                <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} className={isActive ? "text-accent" : ""} /> {label}
              </>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto mx-3 mb-3 rounded-[10px] bg-frame-2/70 p-3 flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-frame text-frame-ink text-[12px] font-semibold flex items-center justify-center shrink-0 border border-white/10">{initials(user!.name)}</span>
          <span className="flex-1 min-w-0">
            <span className="block text-[13.5px] font-medium truncate text-white">{user!.name}</span>
            <span className="block text-[12px] text-frame-mute truncate">{ROLE_LABEL[user!.role]} · {user!.employee_id}</span>
          </span>
          <button type="button" onClick={logout} className="w-9 h-9 flex items-center justify-center rounded-[8px] text-frame-mute hover:text-white hover:bg-frame" aria-label="Log out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 lg:pb-10 pb-24">
        {user!.demo && <DemoBar />}
        <div className="lg:hidden sticky top-0 z-30 bg-frame text-frame-ink pt-safe">
          <div className="flex items-center justify-between px-4 h-14">
            <span className="flex items-center gap-2.5 min-w-0">
              <Monogram name={company} size={30} />
              <span className="text-[15px] font-semibold tracking-tight truncate">{company}</span>
            </span>
            <Link to="/settings" aria-label="Account and settings"
              className="w-9 h-9 rounded-full bg-frame-2 text-frame-ink text-[12px] font-semibold flex items-center justify-center shrink-0">
              {initials(user!.name)}
            </Link>
          </div>
        </div>
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 lg:px-12 pt-7 lg:pt-10">
          {children}
          <Templates />
        </div>
      </main>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-line pb-safe" aria-label="Main">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${phoneItems.length}, minmax(0, 1fr))` }}>
          {phoneItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `relative flex flex-col items-center justify-center gap-1 h-16 text-[11px] ${isActive ? "text-ink font-medium" : "text-mute"}`}>
              {({ isActive }) => <>
                {isActive && <span className="absolute top-0 inset-x-5 h-[3px] rounded-b bg-accent" aria-hidden="true" />}
                <Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} />{label.replace("Morning brief", "Brief").replace("Record data", "Record")}
              </>}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
