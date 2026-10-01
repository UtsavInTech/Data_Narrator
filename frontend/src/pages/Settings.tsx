import { Card, PageTitle } from "../components/ui";
import { ServerCard } from "../components/ServerCard";

export default function Settings() {
  return (
    <>
      <PageTitle title="Settings" />
      <ServerCard />
      <Card className="p-5 max-w-xl mt-4">
        <h2 className="text-[17px] font-semibold">About</h2>
        <p className="text-[15px] text-ink-2 mt-1">Data Narrator turns any spreadsheet or database into plain-language insights. Open source and self-hosted: your data stays on your servers.</p>
      </Card>
    </>
  );
}
