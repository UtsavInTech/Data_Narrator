import { useState } from "react";
import { api, getServer, setServer } from "../api";
import { Button, ErrorNote, Field, inputCls } from "./ui";

/** Where the app's server lives: the company's own machine or a cloud server. */
export function ServerCard({ onConnected }: { onConnected?: () => void }) {
  const [url, setUrl] = useState(getServer());
  const [status, setStatus] = useState<"idle" | "ok" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setStatus("busy");
    setError(null);
    try {
      let clean = url.trim().replace(/\/+$/, "");
      if (clean && !/^https?:\/\//i.test(clean)) clean = `http://${clean}`;
      await api.health(clean);
      setServer(clean);
      setUrl(clean);
      setStatus("ok");
      onConnected?.();
    } catch (e) {
      setError((e as Error).message);
      setStatus("idle");
    }
  };

  return (
    <div>
      <Field label="Server address" hint="Ask your admin. For example 192.168.1.20:8000 or https://data.yourcompany.com">
        <input className={inputCls} value={url} onChange={(e) => { setUrl(e.target.value); setStatus("idle"); }}
          placeholder="192.168.1.20:8000" inputMode="url" autoCapitalize="off" autoCorrect="off" />
      </Field>
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}
      <Button onClick={save} busy={status === "busy"} variant={status === "ok" ? "secondary" : "primary"} className="w-full">
        {status === "ok" ? "Connected" : "Connect"}
      </Button>
    </div>
  );
}
