// Typed client for the Data Narrator API. The server address is configurable so the
// Android app can point at a company's own (on-premise or cloud) server.

export type Status = "importing" | "processing" | "ready" | "error";

export interface Dataset {
  id: string;
  name: string;
  kind: "table" | "model" | "import";
  source_type: string;
  source_label: string;
  row_count: number | null;
  column_count: number | null;
  status: Status;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export interface Link { many: string; one: string; many_col: string; one_col: string; coverage: number }

export interface Column {
  name: string;
  type: string;
  role: "measure" | "dimension" | "time" | "entity" | "id" | "text" | "empty" | "constant" | "other";
  agg: "sum" | "avg" | null;
  subtype: string | null;
  null_pct: number;
  unique: number;
  min: string | null;
  max: string | null;
}

export interface Profile { row_count: number; sampled: boolean; duplicate_rows: number; columns: Column[] }

export interface ImportReport {
  format?: string;
  sheet?: string;
  range?: string;
  header_row?: number | null;
  notes?: string[];
  conversions?: Record<string, string>;
  blank_rows_removed?: number;
  source?: string;
  rows?: number;
  parts?: ImportReport[];
}

export interface ChartPoint { label?: string; value?: number; x?: number; y?: number }
export interface Chart { kind: "bar" | "line" | "scatter"; x: string; y: string; data: ChartPoint[] }

export interface Insight {
  id: string;
  type: "breakdown" | "trend" | "top" | "correlation" | "outlier" | "quality";
  title: string;
  summary: string;
  narrative: string;
  score: number;
  chart: Chart | null;
}

export interface Kpi { label: string; value: number | null; display: string; agg: string; delta: number | null; period: string | null }
export interface Action { id: string; priority: "high" | "medium" | "low"; title: string; detail: string; insight_id: string; category: string }

export interface InsightsResponse {
  dataset: Dataset;
  kpis: Kpi[];
  insights: Insight[];
  actions: Action[];
  headline: string;
  grain: string | null;
  time_column: string | null;
  generated_at: string;
}

export interface DatasetDetail {
  dataset: Dataset;
  profile: Profile | null;
  import_report: ImportReport | null;
  model: { fact: string; links: Link[] } | null;
}

const KEY = "dn.server";

export function getServer(): string {
  try {
    return localStorage.getItem(KEY) ?? import.meta.env.VITE_API_URL ?? "";
  } catch {
    return import.meta.env.VITE_API_URL ?? "";
  }
}

export function setServer(url: string) {
  try {
    localStorage.setItem(KEY, url.replace(/\/+$/, ""));
  } catch {
    /* storage unavailable */
  }
}

async function call<T>(path: string, init?: RequestInit, base = getServer()): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, init);
  } catch {
    throw new Error("Can't reach the server. Check the server address in Settings.");
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      msg = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  return res.json();
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  health: (base?: string) => call<{ ok: boolean; version: string }>("/api/health", undefined, base),
  datasets: () => call<{ datasets: Dataset[]; links: Link[] }>("/api/datasets"),
  dataset: (id: string) => call<DatasetDetail>(`/api/datasets/${id}`),
  insights: (id: string) => call<InsightsResponse>(`/api/datasets/${id}/insights`),
  preview: (id: string, limit = 50) =>
    call<{ columns: string[]; rows: Record<string, unknown>[] }>(`/api/datasets/${id}/preview?limit=${limit}`),
  refresh: (id: string) => call(`/api/datasets/${id}/refresh`, { method: "POST" }),
  remove: (id: string) => call(`/api/datasets/${id}`, { method: "DELETE" }),
  upload: (files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    return call<{ imports: Dataset[] }>("/api/sources/upload", { method: "POST", body: fd });
  },
  connectUrl: (body: Record<string, string>) => call<{ imports: Dataset[] }>("/api/sources/url", json(body)),
  connectDb: (body: Record<string, unknown>) => call<{ imports: Dataset[] }>("/api/sources/database", json(body)),
};
