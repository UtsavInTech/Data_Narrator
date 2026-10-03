import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { needsServer } from "../api";
import { useAuth } from "../auth";
import { DemoCompanies } from "../components/DemoCompanies";
import { ServerCard } from "../components/ServerCard";
import { Button, ErrorNote, Field, inputCls } from "../components/ui";

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

  const server = needsServer();
  return (
    <div className="min-h-full flex flex-col pt-safe">
      <div className="flex-1 flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[22rem]">
          <Link to="/" className="flex items-center gap-2.5 mb-10 w-fit">
            <img src="/icon.svg" alt="" className="w-8 h-8" />
            <span className="text-[17px] font-semibold tracking-tight">Data Narrator</span>
          </Link>
          <h1 className="text-[24px] font-semibold tracking-[-0.015em]">{server ? "Connect to your server" : setupNeeded ? "Set up your workspace" : "Log in"}</h1>
          <p className="text-[15px] text-mute mt-1.5 mb-8">
            {server ? "Enter the address your admin gave you." : setupNeeded ? "Create the admin account. You'll add employees next." : "Use your Employee ID and password."}
          </p>
          {server ? <ServerCard onConnected={recheck} /> : (
            <>
              <form onSubmit={submit}>
                {(error || authError) && <div className="mb-5"><ErrorNote message={error ?? authError ?? ""} /></div>}
                <Field label="Employee ID"><input className={inputCls} value={v.employee_id} onChange={set("employee_id")} autoCapitalize="characters" autoCorrect="off" autoComplete="username" required autoFocus /></Field>
                {setupNeeded && <Field label="Your name"><input className={inputCls} value={v.name} onChange={set("name")} autoComplete="name" required /></Field>}
                <Field label="Password" hint={setupNeeded ? "At least 6 characters" : undefined}>
                  <input className={inputCls} type="password" value={v.password} onChange={set("password")} autoComplete={setupNeeded ? "new-password" : "current-password"} required />
                </Field>
                <Button className="w-full mt-2" busy={busy} type="submit">{setupNeeded ? "Create account" : "Log in"}</Button>
              </form>
              {!setupNeeded && (
                <div className="mt-8 pt-6 border-t border-line">
                  <p className="text-[14px] font-medium mb-1">Just looking?</p>
                  <p className="text-[13px] text-mute mb-4">Open a sample company in one click, or type one of these logins above.</p>
                  <DemoCompanies compact />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <p className="text-center text-[12px] text-faint pb-6">Your data stays on your company's server.</p>
    </div>
  );
}
