import { Database, Home, Lightbulb, ListChecks, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/insights", label: "Insights", icon: Lightbulb },
  { to: "/actions", label: "What to do", icon: ListChecks },
  { to: "/data", label: "Data", icon: Database },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full lg:flex">
      {/* Sidebar: tablets in landscape, desktop */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 h-screen sticky top-0 bg-surface border-r border-line px-4 py-6">
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <img src="/icon.svg" alt="" className="w-9 h-9" />
          <span className="text-[18px] font-semibold tracking-tight">Data Narrator</span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 min-h-12 px-3 rounded-xl text-[16px] ${isActive ? "bg-ink text-white" : "text-ink-2 hover:bg-canvas"}`
              }
            >
              <Icon size={20} /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 pt-safe pb-28 lg:pb-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pt-5 lg:pt-10">{children}</div>
      </main>

      {/* Bottom tabs: phones (and the Android app) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-line pb-safe">
        <div className="grid grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 min-h-16 text-[12px] font-medium ${isActive ? "text-ink" : "text-zinc-400"}`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`px-4 py-1 rounded-full ${isActive ? "bg-zinc-200" : ""}`}>
                    <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
