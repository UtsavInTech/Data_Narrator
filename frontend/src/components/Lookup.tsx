import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LookupOption } from "../api";
import { inputCls } from "./ui";

/** Search-as-you-type picker for a key that points to another table (Customer ID -> customers). */
export function Lookup({ value, options, onChange, invalid, placeholder }: {
  value: string; options: LookupOption[]; onChange: (v: string) => void; invalid?: boolean; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options).slice(0, 50);
  }, [query, options]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (o: LookupOption) => { onChange(o.value); setOpen(false); setQuery(""); };

  return (
    <div ref={box} className="relative">
      <input
        className={`${inputCls} pr-9 ${invalid ? "border-bad!" : ""}`}
        value={open ? query : selected?.label ?? value}
        placeholder={placeholder ?? "Search by name or ID"}
        onFocus={() => { setOpen(true); setQuery(""); setActive(0); }}
        onMouseDown={() => { if (!open) { setOpen(true); setQuery(""); setActive(0); } }}
        onChange={(e) => {
          // Typing over a chosen value starts a fresh search instead of appending to its label.
          const typed = !open && selected && e.target.value.startsWith(selected.label) ? e.target.value.slice(selected.label.length) : e.target.value;
          setQuery(typed); setActive(0); setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter") {
            e.preventDefault(); // never submits the form
            e.stopPropagation();
            if (open && matches[active]) pick(matches[active]);
          }
          if (e.key === "Escape" || e.key === "Tab") setOpen(false);
        }}
        role="combobox" aria-expanded={open} autoComplete="off"
      />
      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-mute pointer-events-none" />
      {open && (
        <ul role="listbox" className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto bg-surface border border-line-2 rounded-[10px] shadow-lg py-1">
          {matches.map((o, i) => (
            <li key={o.value} role="option" aria-selected={o.value === value}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setActive(i)}
              className={`px-3.5 py-2 text-[14px] cursor-pointer ${i === active ? "bg-sunken" : ""}`}>
              {o.label}
            </li>
          ))}
          {!matches.length && <li className="px-3.5 py-2 text-[14px] text-mute">No match</li>}
        </ul>
      )}
    </div>
  );
}
