import { ClipboardList, Database, FileSpreadsheet, Home, Lightbulb, LogOut, Settings } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { api, fileUrl, type MisTable, type Role } from "../api";
import { useAuth } from "../auth";
import { Sheet } from "./ui";

type Item = { to: string; label: string; icon: typeof Home; end?: boolean };

/** What each role sees. Kept short on purpose. */
export const NAV: Record<Role, Item[]> = {
  admin: [
    { to: "/", label: "Overview", icon: Home, end: true },
    { to: "/insights", label: "Insights", icon: Lightbulb },
    { to: "/entry", label: "Entry", icon: ClipboardList },
    { to: "/reports", label: "Reports", icon: FileSpreadsheet },
    { to: "/data", label: "Data", icon: Database },
  ],
  manager: [
    { to: "/", label: "Overview", icon: Home, end: true },
    { to: "/insights", label: "Insights", icon: Lightbulb },
    { to: "/reports", label: "Reports", icon: FileSpreadsheet },
  ],
  operator: [{ to: "/entry", label: "Entry", icon: ClipboardList }],
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

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const items = NAV[user!.role];
  return (
    <div className="min-h-full lg:flex">
      <ScrollTop />
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 h-screen sticky top-0 border-r border-line bg-surface">
        <div className="flex items-center gap-2.5 px-5 h-16">
          <img src="/icon.svg" alt="" className="w-7 h-7" />
          <span className="text-[16px] font-semibold tracking-tight">Data Narrator</span>
        </div>
        <nav className="flex flex-col gap-0.5 px-3 mt-2">
          {[...items, { to: "/settings", label: "Settings", icon: Settings }].map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex items-center gap-3 h-10 px-3 rounded-[8px] text-[14px] ${isActive ? "bg-sunken text-ink font-medium" : "text-ink-2 hover:bg-sunken/60"}`}>
              {({ isActive }) => <><Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} /> {label}</>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-line p-3 flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-sunken text-ink-2 text-[13px] font-semibold flex items-center justify-center shrink-0">{initials(user!.name)}</span>
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] font-medium truncate">{user!.name}</span>
            <span className="block text-[12px] text-mute">{ROLE_LABEL[user!.role]} · {user!.employee_id}</span>
          </span>
          <button type="button" onClick={logout} className="w-9 h-9 flex items-center justify-center rounded-[8px] text-mute hover:text-ink hover:bg-sunken" aria-label="Log out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <main className={`flex-1 min-w-0 lg:pb-10 ${items.length > 1 ? "pb-24" : "pb-8"}`}>
        <div className="lg:hidden sticky top-0 z-30 bg-paper/90 backdrop-blur border-b border-line pt-safe">
          <div className="flex items-center justify-between px-4 h-14">
            <span className="flex items-center gap-2">
              <img src="/icon.svg" alt="" className="w-6 h-6" />
              <span className="text-[15px] font-semibold tracking-tight">Data Narrator</span>
            </span>
            <Link to="/settings" aria-label="Account and settings"
              className="w-9 h-9 rounded-full bg-surface border border-line text-ink-2 text-[12px] font-semibold flex items-center justify-center">
              {initials(user!.name)}
            </Link>
          </div>
        </div>
        <div className="max-w-[1080px] mx-auto px-4 sm:px-8 lg:px-12 pt-7 lg:pt-12">
          {children}
          <Templates />
        </div>
      </main>

      {items.length > 1 && (
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-line pb-safe">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `flex flex-col items-center justify-center gap-1 h-16 text-[11px] ${isActive ? "text-ink font-medium" : "text-faint"}`}>
                {({ isActive }) => <><Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} />{label}</>}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
