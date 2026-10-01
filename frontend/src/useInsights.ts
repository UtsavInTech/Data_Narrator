import { useEffect, useState } from "react";
import { api, type InsightsResponse } from "./api";

const cache = new Map<string, InsightsResponse>();

/** Insights for a dataset, cached per (id, last update) so tab switches are instant. */
export function useInsights(id: string | undefined, updatedAt?: number) {
  const key = id ? `${id}:${updatedAt ?? ""}` : "";
  const [data, setData] = useState<InsightsResponse | null>(key ? cache.get(key) ?? null : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const hit = cache.get(key);
    setData(hit ?? null);
    setError(null);
    if (hit) return;
    let live = true;
    api
      .insights(id)
      .then((r) => {
        cache.set(key, r);
        if (live) setData(r);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id, key]);

  return { data, error };
}
