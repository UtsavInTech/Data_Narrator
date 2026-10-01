import { LogOut, UserPlus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, type Role, type User } from "../api";
import { useAuth } from "../auth";
import { ServerCard } from "../components/ServerCard";
import { Button, Card, ErrorNote, Field, inputCls, PageTitle, Sheet } from "../components/ui";

const ROLES: { value: Role; label: string; text: string }[] = [
  { value: "operator", label: "Data entry", text: "Enters and uploads data" },
  { value: "manager", label: "Manager", text: "Sees insights and daily reports" },
  { value: "admin", label: "Admin", text: "Everything, including data sources and users" },
];

function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ employee_id: "", name: "", password: "", role: "operator" as Role });
  const [error, setError] = useState<string | null>(null);
  const load = () => api.users().then((r) => setUsers(r.users)).catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

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
    <Card className="p-5 max-w-xl mt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[17px] font-semibold">Employees</h2>
        <Button variant="secondary" className="px-4! min-h-10!" onClick={() => setOpen(true)}><UserPlus size={18} /> Add</Button>
      </div>
      {error && !open && <div className="mb-3"><ErrorNote message={error} /></div>}
      <div className="divide-y divide-line">
        {users.map((u) => (
          <div key={u.employee_id} className="flex items-center gap-3 py-3">
            <span className="flex-1 min-w-0">
              <span className={`block text-[15px] font-medium truncate ${u.active ? "" : "text-mute line-through"}`}>{u.name}</span>
              <span className="block text-[13px] text-mute">{u.employee_id}</span>
            </span>
            <select className="min-h-10 px-2 rounded-lg border border-line bg-surface text-[14px]" value={u.role}
              disabled={u.employee_id === me!.employee_id}
              onChange={(e) => api.editUser(u.employee_id, { role: e.target.value as Role }).then(load).catch((er: Error) => setError(er.message))}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {u.employee_id !== me!.employee_id && (
              <button type="button" className="text-[14px] text-ink-2 min-h-10 px-2"
                onClick={() => api.editUser(u.employee_id, { active: !u.active }).then(load)}>{u.active ? "Disable" : "Enable"}</button>
            )}
          </div>
        ))}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add employee">
        <form onSubmit={add}>
          <Field label="Employee ID"><input className={inputCls} value={v.employee_id} onChange={(e) => setV({ ...v, employee_id: e.target.value })} required /></Field>
          <Field label="Name"><input className={inputCls} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></Field>
          <Field label="Password" hint="At least 6 characters. They can use it right away."><input className={inputCls} type="password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} required /></Field>
          <div className="flex flex-col gap-2 mb-4">
            {ROLES.map((r) => (
              <label key={r.value} className={`flex items-start gap-3 p-3 rounded-xl border ${v.role === r.value ? "border-ink" : "border-line"}`}>
                <input type="radio" name="role" checked={v.role === r.value} onChange={() => setV({ ...v, role: r.value })} className="mt-1 accent-zinc-900" />
                <span><span className="block text-[15px] font-medium">{r.label}</span><span className="block text-[13px] text-mute">{r.text}</span></span>
              </label>
            ))}
          </div>
          {error && <div className="mb-4"><ErrorNote message={error} /></div>}
          <Button type="submit" className="w-full">Add employee</Button>
        </form>
      </Sheet>
    </Card>
  );
}

export default function Settings() {
  const { user, logout } = useAuth();
  return (
    <>
      <PageTitle title="Settings" />
      <Card className="p-5 max-w-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[17px] font-semibold">{user!.name}</div>
            <div className="text-[14px] text-mute">{user!.employee_id} · {ROLES.find((r) => r.value === user!.role)?.label}</div>
          </div>
          <Button variant="secondary" onClick={logout} className="px-4!"><LogOut size={18} /> Log out</Button>
        </div>
      </Card>
      {user!.role === "admin" && <Users />}
      <div className="mt-4"><ServerCard /></div>
    </>
  );
}
