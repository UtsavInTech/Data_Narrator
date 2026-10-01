import { Navigate, Route, Routes } from "react-router-dom";
import { needsServer } from "./api";
import { AuthProvider, useAuth } from "./auth";
import { NAV, Shell } from "./components/Shell";
import { Spinner } from "./components/ui";
import Actions from "./pages/Actions";
import AddData from "./pages/AddData";
import Data from "./pages/Data";
import DatasetDetail from "./pages/DatasetDetail";
import Entry from "./pages/Entry";
import EntryTable from "./pages/EntryTable";
import Home from "./pages/Home";
import InsightDetail from "./pages/InsightDetail";
import Insights from "./pages/Insights";
import Login from "./pages/Login";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import { DataProvider } from "./state";

function Gate() {
  const { user, checking } = useAuth();
  if (checking) return <Spinner />;
  if (needsServer() || !user) return <Login />;
  const r = user.role;
  const home = NAV[r][0].to;
  const can = { insights: r !== "operator", entry: r !== "manager", reports: r !== "operator", data: r === "admin" };
  return (
    <DataProvider>
      <Shell>
        <Routes>
          <Route path="/" element={can.insights ? <Home /> : <Navigate to={home} replace />} />
          {can.insights && <Route path="/insights" element={<Insights />} />}
          {can.insights && <Route path="/insights/:dsId/:insightId" element={<InsightDetail />} />}
          {can.insights && <Route path="/actions" element={<Actions />} />}
          {can.entry && <Route path="/entry" element={<Entry />} />}
          {can.entry && <Route path="/entry/:id" element={<EntryTable />} />}
          {can.reports && <Route path="/reports" element={<Reports />} />}
          {can.data && <Route path="/data" element={<Data />} />}
          {can.data && <Route path="/data/add" element={<AddData />} />}
          {can.data && <Route path="/data/:id" element={<DatasetDetail />} />}
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </Shell>
    </DataProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
