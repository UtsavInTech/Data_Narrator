import { ClipboardList, Database, FileDown, FileSpreadsheet, Home, Lightbulb, Settings, UserCircle2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { api, fileUrl, type MisTable, type Role } from "../api";
import { useAuth } from "../auth";

type Item = { to: string; label: string; icon: typeof Home; end?: boolean };

/** What each role sees. Kept short on purpose. */
export const NAV: Record<Role, Item[]> = {
  admin: [
    { to: "/", label: "Home", icon: Home, end: true },
    { to: "/insights", label: "Insights", icon: Lightbulb },
    { to: "/entry", label: "Entry", icon: ClipboardList },
    { to: "/reports", label: "Reports", icon: FileSpreadsheet },
    { to: "/data", label: "Data", icon: Database },
  ],
  manager: [
    { to: "/", label: "Home", icon: Home, end: true },
    { to: "/insights", label: "Insights", icon: Lightbulb },
    { to: "/reports", label: "Reports", icon: FileSpreadsheet },
  ],
  operator: [{ to: "/entry", label: "Entry", icon: ClipboardList }],
};

const ROLE_LABEL: Record<Role, string> = { admin: "Admin", manager: "Manager", operator: "Data entry" };

function Footer() {
  const [tables, setTables] = useState<MisTable[]>([]);
  useEffect(() => {
    api.misTables().then((r) => setTables(r.tables)).catch(() => setTables([]));
  }, []);
  if (!tables.length) return null;
  return (
    <footer className="mt-14 pt-6 border-t border-line">
      <h2 className="text-[14px] font-semibold text-ink-2 flex items-center gap-2"><FileDown size={16} /> Templates</h2>
      <p className="text-[13px] text-mute mt-0.5 mb-3">Blank Excel sheets with the right columns and dropdowns. Fill one in and upload it from Entry.</p>
      <div className="flex flex-wrap gap-2">
        {tables.map((t) => (
          <a key={t.id} href={fileUrl(`/api/mis/${t.id}/template.xlsx`)} className="inline-flex items-center gap-2 min-h-10 px-3 rounded-lg bg-surface border border-line text-[14px]">
            <FileSpreadsheet size={16} className="text-ink-2" /> {t.name}
          </a>
        ))}
      </div>
    </footer>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const items = NAV[user!.role];
  return (
    <div className="min-h-full lg:flex">
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 h-screen sticky top-0 bg-surface border-r border-line px-4 py-6">
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <img src="/icon.svg" alt="" className="w-9 h-9" />
          <span className="text-[18px] font-semibold tracking-tight">Data Narrator</span>
        </div>
        <nav className="flex flex-col gap-1">
          {[...items, { to: "/settings", label: "Settings", icon: Settings }].map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex items-center gap-3 min-h-12 px-3 rounded-xl text-[16px] ${isActive ? "bg-ink text-white" : "text-ink-2 hover:bg-canvas"}`}>
              <Icon size={20} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-3 py-3 rounded-xl bg-canvas">
          <div className="text-[15px] font-medium truncate">{user!.name}</div>
          <div className="text-[13px] text-mute">{user!.employee_id} · {ROLE_LABEL[user!.role]}</div>
        </div>
      </aside>

      <main className={`flex-1 min-w-0 pt-safe lg:pb-10 ${items.length > 1 ? "pb-28" : "pb-10"}`}>
        {/* Phone top bar: name + account */}
        <div className="lg:hidden flex items-center justify-between px-4 h-14 bg-surface border-b border-line">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="" className="w-7 h-7" />
            <span className="text-[16px] font-semibold">Data Narrator</span>
          </div>
          <Link to="/settings" className="flex items-center gap-2 min-h-11 pl-2 text-[14px] text-ink-2" aria-label="Account and settings">
            <span className="max-w-28 truncate">{user!.name}</span> <UserCircle2 size={26} />
          </Link>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pt-5 lg:pt-10">
          {children}
          <Footer />
        </div>
      </main>

      {items.length > 1 && (
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-line pb-safe">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `flex flex-col items-center justify-center gap-1 min-h-16 text-[12px] font-medium ${isActive ? "text-ink" : "text-zinc-400"}`}>
                {({ isActive }) => (
                  <>
                    <span className={`px-4 py-1 rounded-full ${isActive ? "bg-zinc-200" : ""}`}><Icon size={22} strokeWidth={isActive ? 2.4 : 2} /></span>
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
