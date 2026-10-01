import { ChevronRight, Loader2, X } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";

export function Card({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const cls = `bg-surface rounded-2xl border border-line ${onClick ? "active:bg-zinc-50 cursor-pointer text-left w-full" : ""} ${className}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  ) : (
    <div className={cls}>{children}</div>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="text-[15px] text-mute mt-1">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, to, more = "See all" }: { children: ReactNode; to?: string; more?: string }) {
  return (
    <div className="flex items-center justify-between mt-8 mb-3">
      <h2 className="text-[18px] font-semibold">{children}</h2>
      {to && (
        <Link to={to} className="text-[15px] text-mute flex items-center gap-0.5 min-h-11 px-1">
          {more} <ChevronRight size={16} />
        </Link>
      )}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger"; busy?: boolean };

export function Button({ variant = "primary", busy, children, className = "", disabled, ...rest }: BtnProps) {
  const styles = {
    primary: "bg-ink text-white active:bg-ink-2",
    secondary: "bg-surface text-ink border border-line active:bg-zinc-100",
    danger: "bg-surface text-bad border border-red-200 active:bg-red-50",
  }[variant];
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`min-h-12 px-5 rounded-xl text-[16px] font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50 ${styles} ${className}`}
    >
      {busy && <Loader2 size={18} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 min-h-10 px-4 rounded-full text-[15px] border ${active ? "bg-ink text-white border-ink" : "bg-surface border-line text-ink-2"}`}
    >
      {children}
    </button>
  );
}

const STATUS: Record<string, [string, string]> = {
  importing: ["Importing", "bg-zinc-100 text-ink-2"],
  processing: ["Analysing", "bg-zinc-100 text-ink-2"],
  ready: ["Ready", "bg-emerald-50 text-good"],
  error: ["Failed", "bg-red-50 text-bad"],
};

export function StatusBadge({ status }: { status: string }) {
  const [label, cls] = STATUS[status] ?? [status, "bg-zinc-100"];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium px-2.5 py-1 rounded-full ${cls}`}>
      {(status === "importing" || status === "processing") && <Loader2 size={12} className="animate-spin" />}
      {label}
    </span>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-mute gap-3">
      <Loader2 className="animate-spin" size={28} />
      <span className="text-[15px]">{label}</span>
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl bg-surface border border-line flex items-center justify-center text-ink-2 mb-4">{icon}</div>
      <h3 className="text-[19px] font-semibold">{title}</h3>
      <p className="text-[15px] text-mute mt-1.5 max-w-sm">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <div className="rounded-xl bg-red-50 text-bad text-[15px] px-4 py-3 border border-red-100">{message}</div>;
}

/** Bottom sheet on phones, centred dialog on wide screens. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-surface w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl max-h-[85vh] flex flex-col pb-safe">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h3 className="text-[18px] font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="w-11 h-11 -mr-2 flex items-center justify-center text-mute" aria-label="Close">
            <X size={22} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block mb-4">
      <span className="block text-[14px] font-medium text-ink-2 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[13px] text-mute mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full min-h-12 px-4 rounded-xl border border-line bg-surface text-[16px] outline-none focus:border-ink placeholder:text-zinc-400";
