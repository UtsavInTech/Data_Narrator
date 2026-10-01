import { Check, ChevronDown, Layers, Table2 } from "lucide-react";
import { useState } from "react";
import { useData } from "../state";
import { Sheet } from "./ui";

export function DatasetPicker() {
  const { datasets, current, select } = useData();
  const [open, setOpen] = useState(false);
  const ready = datasets.filter((d) => d.status === "ready");
  if (!current) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 min-h-10 max-w-full pl-3 pr-2.5 rounded-full bg-surface border border-line text-[15px] font-medium"
      >
        {current.kind === "model" ? <Layers size={16} /> : <Table2 size={16} />}
        <span className="truncate">{current.name}</span>
        <ChevronDown size={16} className="text-mute shrink-0" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Choose data">
        <div className="flex flex-col">
          {ready.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                select(d.id);
                setOpen(false);
              }}
              className="flex items-center gap-3 min-h-14 py-2 border-b border-line last:border-0 text-left"
            >
              <span className="w-10 h-10 rounded-xl bg-canvas flex items-center justify-center shrink-0">
                {d.kind === "model" ? <Layers size={18} /> : <Table2 size={18} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[16px] font-medium truncate">{d.name}</span>
                <span className="block text-[13px] text-mute">
                  {d.kind === "model" ? "Tables joined automatically" : d.source_label} · {d.row_count?.toLocaleString()} rows
                </span>
              </span>
              {d.id === current.id && <Check size={20} />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
