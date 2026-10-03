import { useEffect, useState, type FormEvent } from "react";
import { api, needsServer, type Role, type User } from "../api";
import { useAuth } from "../auth";
import { ServerCard } from "../components/ServerCard";
import { ROLE_LABEL } from "../components/Shell";
import { Button, ErrorNote, Field, inputCls, Notice, PageHeader, Panel, Section, Sheet } from "../components/ui";
import { Capacitor } from "@capacitor/core";

const ROLES: { value: Role; text: string }[] = [
  { value: "operator", text: "Enters and uploads data" },
  { value: "manager", text: "Sees insights and daily reports" },
  { value: "admin", text: "Everything, including data sources and employees" },
];

function Employees() {
  const { user: me } = useAuth();
  const locked = !!me!.demo;  // sample companies: the logins are public, so nobody may change them
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ employee_id: "", name: "", password: "", role: "operator" as Role });
  const [error, setError] = useState<string | null>(null);
  const load = () => api.users().then((r) => setUsers(r.users)).catch((e: Error) => setError(e.message));
  useEffect(() => { load(); }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.addUser(v);
      setOpen(false);
      setV({ employee_id: "", name: "", password: "", role: "operator" });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Section title="Employees" action={!locked && <Button variant="secondary" className="min-h-9! text-[14px]!" onClick={() => setOpen(true)}>Add employee</Button>}>
      {locked && <div className="mb-3"><Notice>In a sample company the employees can't be changed. In your own workspace you add people here, give each a role, and disable them when they leave.</Notice></div>}
      {error && !open && <div className="mb-3"><ErrorNote message={error} /></div>}
      <Panel className="divide-y divide-line overflow-hidden">
        {users.map((u) => (
          <div key={u.employee_id} className="flex items-center gap-3 px-5 py-3">
            <span className="flex-1 min-w-0">
              <span className={`block text-[14px] font-medium truncate ${u.active ? "" : "text-faint line-through"}`}>{u.name}</span>
              <span className="block text-[13px] text-mute">{u.employee_id}</span>
            </span>
            <select className="min-h-9 px-2.5 rounded-[8px] border border-line-2 bg-surface text-[13px]" value={u.role} disabled={locked || u.employee_id === me!.employee_id}
              onChange={(e) => api.editUser(u.employee_id, { role: e.target.value as Role }).then(load).catch((er: Error) => setError(er.message))}
              aria-label={`Role for ${u.name}`}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{ROLE_LABEL[r.value]}</option>)}
            </select>
            {!locked && u.employee_id !== me!.employee_id && (
              <button type="button" className="text-[13px] text-mute hover:text-ink min-h-9 px-2" onClick={() => api.editUser(u.employee_id, { active: !u.active }).then(load).catch((e: Error) => setError(e.message))}>
                {u.active ? "Disable" : "Enable"}
              </button>
            )}
          </div>
        ))}
      </Panel>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add employee">
        <form onSubmit={add}>
          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Employee ID"><input className={inputCls} value={v.employee_id} onChange={(e) => setV({ ...v, employee_id: e.target.value })} required /></Field>
            <Field label="Name"><input className={inputCls} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></Field>
          </div>
          <Field label="Password" hint="At least 6 characters. Share it with them; they can log in right away.">
            <input className={inputCls} type="password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} required />
          </Field>
          <span className="block text-[14px] font-medium text-ink-2 mb-2">Role</span>
          <div className="flex flex-col gap-2 mb-5">
            {ROLES.map((r) => (
              <label key={r.value} className={`flex items-start gap-3 p-3 rounded-[10px] border cursor-pointer ${v.role === r.value ? "border-ink" : "border-line-2"}`}>
                <input type="radio" name="role" checked={v.role === r.value} onChange={() => setV({ ...v, role: r.value })} className="mt-1 accent-[#1c1b19]" />
                <span><span className="block text-[14px] font-medium">{ROLE_LABEL[r.value]}</span><span className="block text-[13px] text-mute">{r.text}</span></span>
              </label>
            ))}
          </div>
          {error && <div className="mb-4"><ErrorNote message={error} /></div>}
          <Button type="submit" className="w-full">Add employee</Button>
        </form>
      </Sheet>
    </Section>
  );
}

export default function Settings() {
  const { user, logout } = useAuth();
  return (
    <>
      <PageHeader title="Settings" />
      <Section title="Your account">
        <Panel className="px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-[15px] font-medium">{user!.name}</div>
            <div className="text-[13px] text-mute">{user!.employee_id} · {ROLE_LABEL[user!.role]}</div>
          </div>
          <Button variant="secondary" onClick={logout}>Log out</Button>
        </Panel>
      </Section>
      {user!.role === "admin" && <Employees />}
      {(Capacitor.isNativePlatform() || needsServer()) && (
        <Section title="Server"><Panel className="p-5 max-w-xl"><ServerCard /></Panel></Section>
      )}
    </>
  );
}
