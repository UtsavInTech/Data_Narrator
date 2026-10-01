import { CheckCircle2, Server } from "lucide-react";
import { useState } from "react";
import { api, getServer, setServer } from "../api";
import { Button, Card, ErrorNote, Field, inputCls } from "./ui";

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
    <Card className="p-5 max-w-xl">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-11 h-11 rounded-xl bg-canvas flex items-center justify-center"><Server size={20} /></span>
        <div>
          <h2 className="text-[17px] font-semibold">Server</h2>
          <p className="text-[14px] text-mute">Your company's Data Narrator server, on-premise or in the cloud.</p>
        </div>
      </div>
      <Field label="Server address" hint="Ask your admin. Example: 192.168.1.20:8000 or https://data.yourcompany.com">
        <input
          className={inputCls}
          value={url}
          onChange={(e) => { setUrl(e.target.value); setStatus("idle"); }}
          placeholder="192.168.1.20:8000"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
        />
      </Field>
      {error && <div className="mb-4"><ErrorNote message={error} /></div>}
      <Button onClick={save} busy={status === "busy"} className="w-full">
        {status === "ok" ? <><CheckCircle2 size={18} /> Connected</> : "Connect"}
      </Button>
    </Card>
  );
}
