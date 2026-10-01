import { Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import Actions from "./pages/Actions";
import AddData from "./pages/AddData";
import Data from "./pages/Data";
import DatasetDetail from "./pages/DatasetDetail";
import Home from "./pages/Home";
import InsightDetail from "./pages/InsightDetail";
import Insights from "./pages/Insights";
import Settings from "./pages/Settings";
import { DataProvider } from "./state";

export default function App() {
  return (
    <DataProvider>
      <Shell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/insights/:dsId/:insightId" element={<InsightDetail />} />
          <Route path="/actions" element={<Actions />} />
          <Route path="/data" element={<Data />} />
          <Route path="/data/add" element={<AddData />} />
          <Route path="/data/:id" element={<DatasetDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Shell>
    </DataProvider>
  );
}
