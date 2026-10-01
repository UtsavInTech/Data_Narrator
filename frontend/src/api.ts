import { Capacitor } from "@capacitor/core";

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
  stage?: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
  writeback?: boolean;
  importance?: number;
}

export type Role = "admin" | "manager" | "operator";
export interface User { employee_id: string; name: string; role: Role; active: boolean }

export interface LookupOption { value: string; label: string; detail: Record<string, unknown> }
export interface Formula { target: string; op: "add" | "mul" | "days"; args: string[]; k?: number }

export interface Field {
  name: string;
  kind: "select" | "number" | "date" | "datetime" | "boolean" | "text" | "textarea" | "lookup";
  lookup?: { table: string | null; options: LookupOption[] };
  formula?: Formula;
  next?: string | null;
  role: string;
  required: boolean;
  options: string[] | null;
  suggestions: string[] | null;
  min: number | null;
  integer: boolean;
  unique: boolean;
  default: string | null;
}

export interface Entry { id: string; data: Record<string, unknown>; errors: Record<string, string>; warnings: Record<string, string>; created_by?: string }
export interface Batch { id: string; kind: "import" | "entry"; rows: number; source: string; created_by: string | null; created_at: number }
export interface MisTable extends Dataset { drafts: number; last_added: number | null }
export interface ReportFile { ds_id: string; dataset: string; date: string; file: string; created_at: number }
export interface ReportMetric { label: string; kind: string; today: number | null; previous: number | null; change: number | null; week_ago: number | null; month_to_date: number | null }
export interface DailyReport {
  title: string; dataset: string; day: string; previous_day: string | null; week_ago: string; basis: string;
  generated_by: string; generated_at: string; metrics: ReportMetric[]; highlights: string[];
  groups: { dimension: string; headers: string[]; rows: (string | number)[][]; total: (string | number)[]; money: boolean[] }[];
  rows: { columns: string[]; total: number; data: unknown[][] };
  checks: { column: string; problem: string; rows: number }[];
}

export interface Schedule { at_time: string; which_day: "today" | "yesterday"; enabled: number | boolean; last_run: string | null }

export interface Link { many: string; one: string; many_col: string; one_col: string; coverage: number }

export interface Column {
  name: string;
  type: string;
  role: "measure" | "dimension" | "time" | "entity" | "id" | "text" | "empty" | "constant" | "attribute" | "other";
  values?: string[];
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
  type: "breakdown" | "trend" | "top" | "correlation" | "outlier" | "quality" | "collect" | "mover";
  title: string;
  summary: string;
  narrative: string;
  score: number;
  details?: string[];
  chart: Chart | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  facts: Record<string, any>;
}

export interface Kpi { label: string; value: number | null; display: string; agg: string; delta: number | null; period: string | null }
export interface Action { id: string; priority: "high" | "medium" | "low"; title: string; detail: string; insight_id: string; category: string }

export interface StorySection { key: string; heading: string; paragraphs: string[]; insight_id?: string }
export interface Story { lead: string; sections: StorySection[]; facts: Record<string, unknown> & { ref_date?: string } }

export interface InsightsResponse {
  dataset: Dataset;
  story: Story;
  about: string;
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
  batches: Batch[];
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

/** The installed app has no server of its own: the user must point it at one first. */
export const needsServer = () => Capacitor.isNativePlatform() && !getServer();

const TOKEN = "dn.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN);
  } catch {
    return null;
  }
}

export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN, t);
    else localStorage.removeItem(TOKEN);
  } catch {
    /* storage unavailable */
  }
}

/** A link for files (templates, reports) that a plain <a> can open. */
export function fileUrl(path: string) {
  const sep = path.includes("?") ? "&" : "?";
  return `${getServer()}${path}${sep}token=${encodeURIComponent(getToken() ?? "")}`;
}

async function call<T>(path: string, init?: RequestInit, base = getServer()): Promise<T> {
  let res: Response;
  const headers = new Headers(init?.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  try {
    res = await fetch(`${base}${path}`, { ...init, headers });
  } catch {
    throw new Error("Can't reach the server. Check the server address in Settings.");
  }
  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event("dn:logout"));
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      msg = typeof body.detail === "string" ? body.detail : body.detail?.message ?? JSON.stringify(body.detail);
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  if (!res.headers.get("content-type")?.includes("application/json")) {
    throw new Error("That address isn't a Data Narrator server. Check the server address in Settings.");
  }
  return res.json();
}

const json = (body: unknown, method = "POST"): RequestInit => ({
  method,
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

  authStatus: () => call<{ setup_needed: boolean }>("/api/auth/status"),
  setup: (b: { employee_id: string; name: string; password: string }) => call<{ token: string; user: User }>("/api/auth/setup", json(b)),
  login: (employee_id: string, password: string) => call<{ token: string; user: User }>("/api/auth/login", json({ employee_id, password })),
  me: () => call<{ user: User }>("/api/auth/me"),
  logout: () => call("/api/auth/logout", { method: "POST" }),
  users: () => call<{ users: User[]; roles: Role[] }>("/api/users"),
  addUser: (b: { employee_id: string; name: string; password: string; role: Role }) => call<{ user: User }>("/api/users", json(b)),
  editUser: (id: string, b: Partial<{ role: Role; active: boolean; password: string }>) => call(`/api/users/${encodeURIComponent(id)}`, json(b, "PATCH")),

  misTables: () => call<{ tables: MisTable[] }>("/api/mis/tables"),
  form: (id: string) => call<{ dataset: Dataset; fields: Field[] }>(`/api/mis/${id}/form`),
  entries: (id: string) => call<{ entries: Entry[] }>(`/api/mis/${id}/entries`),
  addEntry: (id: string, data: Record<string, unknown>) => call<Entry>(`/api/mis/${id}/entries`, json({ data })),
  editEntry: (id: string, eid: string, data: Record<string, unknown>) => call<Entry>(`/api/mis/${id}/entries/${eid}`, json({ data }, "PUT")),
  deleteEntry: (id: string, eid: string) => call(`/api/mis/${id}/entries/${eid}`, { method: "DELETE" }),
  commit: (id: string, b: { employee_id: string; password: string; push: boolean }) =>
    call<{ rows: number; pushed: boolean; committed_by: User }>(`/api/mis/${id}/commit`, json(b)),
  reports: () => call<{ reports: ReportFile[] }>("/api/mis/reports"),
  dailyReport: (id: string, date?: string) => call<DailyReport>(`/api/mis/${id}/daily-report${date ? `?date=${date}` : ""}`),
  loadDemo: () => call<{ imports: Dataset[] }>("/api/demo", { method: "POST" }),
  schedule: (id: string) => call<Schedule>(`/api/mis/${id}/schedule`),
  setSchedule: (id: string, b: { at_time: string; which_day: string; enabled: boolean }) => call<Schedule>(`/api/mis/${id}/schedule`, json(b, "PUT")),
};
