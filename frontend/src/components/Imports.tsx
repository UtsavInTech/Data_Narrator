import type { Dataset } from "../api";
import { Panel, Stepper } from "./ui";

/** Files and sources still being prepared, with what is happening right now. */
export function ImportsInProgress({ items }: { items: Dataset[] }) {
  if (!items.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 mb-10">
      {items.map((d) => (
        <Panel key={d.id} className="p-5">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h3 className="text-[15px] font-semibold truncate">{d.name}</h3>
            <span className="text-[12px] text-mute shrink-0">{d.kind === "model" ? "Combining tables" : "Preparing"}</span>
          </div>
          <Stepper status={d.status} stage={d.stage} />
        </Panel>
      ))}
    </div>
  );
}
