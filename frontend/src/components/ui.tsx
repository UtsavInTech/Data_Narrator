import { Check, ChevronRight, Loader2, X } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";

/* ---------------------------------------------------------------- layout */

export function PageHeader({ title, description, actions, back }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { to: string; label: string };
}) {
  return (
    <header className="mb-8">
      {back && (
        <Link to={back.to} className="inline-flex items-center gap-1 text-[14px] text-mute hover:text-ink mb-3 min-h-8">
          <ChevronRight size={15} className="rotate-180" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="serif text-[32px] leading-[1.1] font-medium text-ink">{title}</h1>
          {description && <p className="text-[15px] text-mute mt-1.5 max-w-2xl">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({ title, action, children, className = "" }: {
  title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`mb-10 min-w-0 ${className}`}>
      {(title || action) && (
        <div className="flex items-baseline justify-between gap-4 mb-3">
          {title && <h2 className="serif text-[20px] font-medium text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-surface border border-line rounded-[12px] shadow-[0_1px_0_rgba(28,27,25,0.03),0_10px_28px_-24px_rgba(19,32,27,0.3)] ${className}`}>{children}</div>;
}

/** A row inside a list panel. Becomes a link when `to` is given. */
export function Row({ to, onClick, children, className = "" }: { to?: string; onClick?: () => void; children: ReactNode; className?: string }) {
  const cls = `flex items-center gap-4 px-4 sm:px-5 min-h-[64px] py-3 ${to || onClick ? "hover:bg-sunken/60 active:bg-sunken cursor-pointer" : ""} ${className}`;
  if (to) return <Link to={to} className={cls}>{children}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={`${cls} w-full text-left`}>{children}</button>;
  return <div className={cls}>{children}</div>;
}

export function SeeAll({ to, children = "See all" }: { to: string; children?: ReactNode }) {
  return (
    <Link to={to} className="text-[14px] text-mute hover:text-ink inline-flex items-center gap-0.5">
      {children} <ChevronRight size={15} />
    </Link>
  );
}

/* ---------------------------------------------------------------- controls */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; busy?: boolean };

export const btnCls = (variant: BtnProps["variant"] = "primary") =>
  `inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-[10px] text-[15px] font-medium transition-colors disabled:opacity-45 disabled:pointer-events-none ${
    {
      primary: "bg-ink text-white hover:bg-ink-2",
      secondary: "bg-surface text-ink border border-line-2 hover:bg-sunken",
      ghost: "text-ink-2 hover:bg-sunken",
      danger: "bg-surface text-bad border border-line-2 hover:bg-bad-bg",
    }[variant]
  }`;

export function Button({ variant = "primary", busy, children, className = "", disabled, ...rest }: BtnProps) {
  return (
    <button {...rest} disabled={disabled || busy} className={`${btnCls(variant)} ${className}`}>
      {busy && <Loader2 size={17} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex p-1 rounded-[10px] bg-sunken border border-line overflow-x-auto no-scrollbar max-w-full">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`min-h-9 px-3.5 rounded-[7px] text-[14px] whitespace-nowrap ${value === o.value ? "bg-surface text-ink font-medium shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-mute hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <label className="block mb-5">
      <span className="block text-[14px] font-medium text-ink-2 mb-1.5">{label}</span>
      {children}
      {error ? <span className="block text-[13px] text-bad mt-1.5">{error}</span>
        : hint && <span className="block text-[13px] text-mute mt-1.5">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full min-h-11 px-3.5 rounded-[10px] border border-line-2 bg-surface text-[15px] text-ink outline-none transition-colors focus:border-ink placeholder:text-faint";

/* ---------------------------------------------------------------- feedback */

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-20 text-mute text-[14px]">
      <Loader2 className="animate-spin" size={18} /> {label ?? "Loading"}
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text: ReactNode; action?: ReactNode }) {
  return (
    <div className="py-14 px-6 text-center border border-dashed border-line-2 rounded-[12px]">
      <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
      <div className="text-[15px] text-mute mt-1.5 max-w-md mx-auto">{text}</div>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success" | "warn"; children: ReactNode }) {
  const cls = {
    info: "bg-surface border-line text-ink-2",
    error: "bg-bad-bg border-bad/15 text-bad",
    success: "bg-good-bg border-good/15 text-good",
    warn: "bg-warn-bg border-warn/15 text-warn",
  }[tone];
  return <div role={tone === "error" ? "alert" : undefined} className={`rounded-[10px] border px-4 py-3 text-[14px] ${cls}`}>{children}</div>;
}

export const ErrorNote = ({ message }: { message: string }) => <Notice tone="error">{message}</Notice>;

/** Status shown as a dot + words, never colour alone. */
export function Status({ status, stage }: { status: string; stage?: string | null }) {
  if (status === "ready") return <span className="inline-flex items-center gap-1.5 text-[13px] text-good"><span className="w-1.5 h-1.5 rounded-full bg-good" />Ready</span>;
  if (status === "error") return <span className="inline-flex items-center gap-1.5 text-[13px] text-bad"><span className="w-1.5 h-1.5 rounded-full bg-bad" />Failed</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
      <span className="w-1.5 h-1.5 rounded-full bg-ink pulse" />{STAGES.find((s) => s.key === stageKey(status, stage))?.short ?? "Working"}
    </span>
  );
}

/* ---------------------------------------------------------------- import progress */

export const STAGES = [
  { key: "uploaded", short: "Uploaded", label: "File received" },
  { key: "reading", short: "Reading", label: "Reading sheets and tables" },
  { key: "cleaning", short: "Cleaning", label: "Fixing numbers, dates and blank rows" },
  { key: "profiling", short: "Understanding", label: "Understanding every column" },
  { key: "insights", short: "Analysing", label: "Finding insights" },
];

export function stageKey(status: string, stage?: string | null) {
  if (stage) return stage;
  return status === "importing" ? "reading" : "profiling";
}

export function Stepper({ status, stage }: { status: string; stage?: string | null }) {
  const current = STAGES.findIndex((s) => s.key === stageKey(status, stage));
  return (
    <ol className="flex flex-col gap-2.5">
      {STAGES.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.key} className={`flex items-center gap-3 text-[14px] ${done ? "text-ink-2" : active ? "text-ink font-medium" : "text-faint"}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${done ? "bg-ink border-ink text-white" : active ? "border-ink" : "border-line-2"}`}>
              {done ? <Check size={12} strokeWidth={3} /> : active ? <span className="w-2 h-2 rounded-full bg-ink pulse" /> : null}
            </span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------- overlays */

/** Bottom sheet on phones, centred dialog on wider screens. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div className="relative bg-surface w-full sm:max-w-md rounded-t-[18px] sm:rounded-[14px] max-h-[88vh] flex flex-col pb-safe shadow-xl">
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <h3 className="text-[17px] font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="w-10 h-10 -mr-2 flex items-center justify-center text-mute hover:text-ink rounded-full" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pt-2 pb-5">{children}</div>
      </div>
    </div>
  );
}
