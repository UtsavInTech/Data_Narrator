import { useState, type FormEvent } from "react";
import { needsServer } from "../api";
import { useAuth } from "../auth";
import { ServerCard } from "../components/ServerCard";
import { Button, Card, ErrorNote, Field, inputCls } from "../components/ui";

export default function Login() {
  const { setupNeeded, login, setup, error: authError, recheck } = useAuth();
  const [v, setV] = useState({ employee_id: "", name: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (setupNeeded) await setup(v);
      else await login(v.employee_id, v.password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center px-4 py-10 pt-safe">
      <div className="w-full max-w-sm">
        <img src="/icon.svg" alt="" className="w-14 h-14 mb-5" />
        <h1 className="text-[26px] font-semibold tracking-tight leading-tight">
          {needsServer() ? "Connect to your server" : setupNeeded ? "Set up Data Narrator" : "Log in"}
        </h1>
        <p className="text-[15px] text-mute mt-1 mb-6">
          {needsServer()
            ? "Enter the address your admin gave you."
            : setupNeeded
              ? "Create the first admin account. You can add employees after this."
              : "Use your Employee ID and password."}
        </p>
        {needsServer() ? (
          <ServerCard onConnected={recheck} />
        ) : (
          <Card className="p-5">
            <form onSubmit={submit}>
              {(error || authError) && <div className="mb-4"><ErrorNote message={error ?? authError ?? ""} /></div>}
              <Field label="Employee ID">
                <input className={inputCls} value={v.employee_id} onChange={set("employee_id")} autoCapitalize="characters" autoCorrect="off" autoComplete="username" required />
              </Field>
              {setupNeeded && (
                <Field label="Your name">
                  <input className={inputCls} value={v.name} onChange={set("name")} autoComplete="name" />
                </Field>
              )}
              <Field label="Password" hint={setupNeeded ? "At least 6 characters" : undefined}>
                <input className={inputCls} type="password" value={v.password} onChange={set("password")} autoComplete={setupNeeded ? "new-password" : "current-password"} required />
              </Field>
              <Button className="w-full mt-1" busy={busy} type="submit">{setupNeeded ? "Create admin & continue" : "Log in"}</Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
