import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, needsServer, setToken, type Role, type User } from "./api";

interface Auth {
  user: User | null;
  checking: boolean;
  setupNeeded: boolean;
  error: string | null;
  login: (employeeId: string, password: string) => Promise<void>;
  setup: (b: { employee_id: string; name: string; password: string }) => Promise<void>;
  /** Sign in to a sample company as one of its roles (front page, login page, or switching inside the app). */
  enterDemo: (company: string, role: Role) => Promise<void>;
  logout: () => void;
  recheck: () => void;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recheck = useCallback(async () => {
    if (needsServer()) {
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      const st = await api.authStatus();
      setSetupNeeded(st.setup_needed);
      let me: User | null = null;
      if (getToken() && !st.setup_needed) {
        // An old or expired session just means "log in again", not an error.
        me = await api.me().then((r) => r.user).catch(() => null);
      }
      setUser(me);
      setError(null);
    } catch (e) {
      setUser(null);
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    recheck();
    const out = () => setUser(null);
    window.addEventListener("dn:logout", out);
    return () => window.removeEventListener("dn:logout", out);
  }, [recheck]);

  const login = async (employeeId: string, password: string) => {
    const r = await api.login(employeeId, password);
    setToken(r.token);
    setUser(r.user);
  };

  const setup = async (b: { employee_id: string; name: string; password: string }) => {
    const r = await api.setup(b);
    setToken(r.token);
    setSetupNeeded(false);
    setUser(r.user);
  };

  const enterDemo = async (company: string, role: Role) => {
    if (getToken()) api.logout().catch(() => undefined);
    const r = await api.tryDemo(company, role);
    setToken(r.token);
    setUser(r.user);
  };

  const logout = () => {
    api.logout().catch(() => undefined);
    setToken(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, checking, setupNeeded, error, login, setup, enterDemo, logout, recheck }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
