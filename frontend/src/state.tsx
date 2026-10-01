import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, needsServer, type Dataset, type Link } from "./api";

interface State {
  datasets: Dataset[];
  links: Link[];
  loading: boolean;
  error: string | null;
  current: Dataset | null;
  select: (id: string) => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<State | null>(null);
const KEY = "dn.dataset";

function stored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Opens the table that tells the fullest business story (dates, money, what's owed). */
function pickDefault(ds: Dataset[]): Dataset | null {
  const ready = ds.filter((d) => d.status === "ready");
  return [...ready].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))[0] ?? null;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(stored);
  const timer = useRef<number | undefined>(undefined);

  const reload = useCallback(async () => {
    if (needsServer()) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.datasets();
      setDatasets(res.datasets);
      setLinks(res.links);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Poll while anything is importing or being analysed.
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (datasets.some((d) => d.status === "importing" || d.status === "processing")) {
      timer.current = window.setTimeout(reload, 1500);
    }
    return () => window.clearTimeout(timer.current);
  }, [datasets, reload]);

  const select = useCallback((id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const current = useMemo(() => {
    const hit = datasets.find((d) => d.id === selected && d.status === "ready");
    return hit ?? pickDefault(datasets);
  }, [datasets, selected]);

  return <Ctx.Provider value={{ datasets, links, loading, error, current, select, reload }}>{children}</Ctx.Provider>;
}

export function useData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData outside DataProvider");
  return v;
}
