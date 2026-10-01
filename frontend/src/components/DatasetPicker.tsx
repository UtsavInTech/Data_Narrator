import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useData } from "../state";
import { Sheet } from "./ui";

/** Which table the page is about. Quiet, sits in the page header. */
export function DatasetPicker() {
  const { datasets, current, select } = useData();
  const [open, setOpen] = useState(false);
  const ready = datasets.filter((d) => d.status === "ready");
  if (!current) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 min-h-11 max-w-[min(22rem,100%)] pl-3.5 pr-3 rounded-[10px] bg-surface border border-line-2 text-[14px] hover:bg-sunken">
        <span className="text-mute">Data:</span>
        <span className="font-medium truncate">{current.name}</span>
        <ChevronDown size={16} className="text-mute shrink-0" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Choose data">
        <div className="-mx-2">
          {ready.map((d) => (
            <button key={d.id} type="button" onClick={() => { select(d.id); setOpen(false); }}
              className="w-full flex items-center gap-3 px-2 py-3 rounded-[10px] hover:bg-sunken text-left">
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-medium truncate">{d.name}</span>
                <span className="block text-[13px] text-mute">
                  {d.kind === "model" ? "Tables combined automatically" : d.source_label} · {d.row_count?.toLocaleString()} rows
                </span>
              </span>
              {d.id === current.id && <Check size={18} />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
