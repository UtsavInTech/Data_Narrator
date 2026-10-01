import { CheckCircle2, Server } from "lucide-react";
import { useState } from "react";
import { api, getServer, setServer } from "../api";
import { Button, Card, ErrorNote, Field, inputCls, PageTitle } from "../components/ui";
import { useData } from "../state";

export default function Settings() {
  const [url, setUrl] = useState(getServer());
  const [status, setStatus] = useState<"idle" | "ok" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);
  const { reload } = useData();

  const save = async () => {
    setStatus("busy");
    setError(null);
    try {
      const clean = url.trim().replace(/\/+$/, "");
      await api.health(clean);
      setServer(clean);
      setStatus("ok");
      await reload();
    } catch (e) {
      setError((e as Error).message);
      setStatus("idle");
    }
  };

  return (
    <>
      <PageTitle title="Settings" />
      <Card className="p-5 max-w-xl">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-11 h-11 rounded-xl bg-canvas flex items-center justify-center"><Server size={20} /></span>
          <div>
            <h2 className="text-[17px] font-semibold">Server</h2>
            <p className="text-[14px] text-mute">Your company's Data Narrator server, on-premise or in the cloud.</p>
          </div>
        </div>
        <Field label="Server address" hint="Leave empty when this page is served by the server itself.">
          <input className={inputCls} value={url} onChange={(e) => { setUrl(e.target.value); setStatus("idle"); }} placeholder="http://192.168.1.20:8000" inputMode="url" autoCapitalize="off" />
        </Field>
        {error && <div className="mb-4"><ErrorNote message={error} /></div>}
        <Button onClick={save} busy={status === "busy"} className="w-full">
          {status === "ok" ? <><CheckCircle2 size={18} /> Connected</> : "Test & save"}
        </Button>
      </Card>
      <Card className="p-5 max-w-xl mt-4">
        <h2 className="text-[17px] font-semibold">About</h2>
        <p className="text-[15px] text-ink-2 mt-1">Data Narrator turns any spreadsheet or database into plain-language insights. Open source and self-hosted: your data stays on your servers.</p>
      </Card>
    </>
  );
}
