import { ArrowRight, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { btnCls } from "../components/ui";

/** The public front page: what Data Narrator is and how it works. */

const STEPS = [
  {
    n: "1",
    title: "Bring your data",
    text: "Upload Excel or CSV files, paste a Google Drive or OneDrive link, or connect a PostgreSQL or MySQL database. Messy sheets are fine.",
  },
  {
    n: "2",
    title: "It works out what's what",
    text: "It finds the real headings, skips titles and subtotal rows, turns “₹1,200” and “03-04-2026” into numbers and dates, and links tables that share an ID such as Customer ID.",
  },
  {
    n: "3",
    title: "Read the story",
    text: "A short written report: how sales are moving, where the money comes from, who matters most, what is overdue, and what looks wrong. Every line shows the numbers behind it.",
  },
  {
    n: "4",
    title: "Run the day",
    text: "Staff record invoices, receipts or stock in forms built from your own columns. Managers open the daily report on screen or as an Excel file.",
  },
];

const FEATURES = [
  { title: "The story of your data", text: "Plain-language paragraphs, not a wall of charts. Written fresh every time the data changes." },
  { title: "Money to collect", text: "What is unpaid, what is overdue and by how long, and which customers to call first." },
  { title: "Forms that check themselves", text: "Next invoice number filled in, customer details looked up, GST and totals calculated, mistakes caught before saving." },
  { title: "The daily MIS report", text: "Today against yesterday and last week, a table per branch or salesperson, and the branches that sent nothing." },
  { title: "Reads real-world Excel", text: "Merged cells, two-row headings, several tables on a sheet, months as columns, the same layout on twelve sheets." },
  { title: "Simple roles", text: "Data entry staff see the forms. Managers see insights and reports. Admins manage data and people." },
];

const DAY = [
  {
    who: "Data entry operator",
    when: "9:30 am",
    text: "Records the morning's invoices. The form already has the next invoice number, fills in the customer's details and calculates GST. Each batch is confirmed with an Employee ID and password.",
  },
  {
    who: "Branch manager",
    when: "10:00 am",
    text: "Opens yesterday's report: ₹4.8 lakh billed, 9% more than the day before. Nashik hasn't sent anything yet, and two invoices have no GST.",
  },
  {
    who: "Owner",
    when: "Monday",
    text: "Reads the story: September up 12% on August, Rahul Deshmukh's sales 30% below the usual, ₹38.8 lakh overdue, most of it from three customers.",
  },
];

function Preview() {
  const buckets = [
    { label: "Up to 30 days late", v: 13.76 },
    { label: "31–60 days", v: 4.04 },
    { label: "61–90 days", v: 9.74 },
    { label: "Over 90 days", v: 11.26 },
  ];
  return (
    <div className="bg-surface border border-line rounded-[16px] shadow-[0_24px_60px_-30px_rgba(28,27,25,0.35)] overflow-hidden">
      <div className="flex items-center justify-between px-6 h-12 border-b border-line text-[13px] text-mute">
        <span className="font-medium text-ink-2">Invoices · Narmada Electricals</span>
        <span>Example</span>
      </div>
      <div className="p-6 lg:p-8">
        <div className="label mb-3">The story so far</div>
        <p className="text-[19px] leading-[1.55] text-ink">
          September closed at <b className="font-semibold">₹1.43 crore</b>, up 12% on August.{" "}
          <b className="font-semibold">₹1.44 crore</b> is still to be collected, and ₹38.8 lakh of it is past the due date.
        </p>
        <div className="grid grid-cols-3 gap-px bg-line border border-line rounded-[10px] overflow-hidden mt-6">
          {[["Invoices", "2,143"], ["Billed", "₹9.09 Cr"], ["Overdue", "₹38.8 L"]].map(([l, v]) => (
            <div key={l} className="bg-surface px-4 py-3">
              <div className="text-[12px] text-mute">{l}</div>
              <div className="text-[20px] font-semibold num mt-0.5">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <div className="text-[14px] font-semibold mb-3">Money to collect</div>
          <ul className="space-y-2">
            {buckets.map((b, i) => (
              <li key={b.label} className="grid grid-cols-[9rem_1fr_4.5rem] items-center gap-3 text-[13px]">
                <span className="text-ink-2">{b.label}</span>
                <span className="h-2 rounded-full bg-sunken overflow-hidden">
                  <span className={`block h-full rounded-full ${i === 3 ? "bg-bad" : "bg-ink"}`} style={{ width: `${(b.v / 13.76) * 100}%` }} />
                </span>
                <span className="num text-right text-ink-2">₹{b.v} L</span>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-mute mt-4">Biggest overdue: Om Sai Lighting House (₹13.75 lakh), Jai Bhavani Electric Stores, Mangal Agencies.</p>
        </div>
      </div>
    </div>
  );
}

export default function Landing({ setupNeeded }: { setupNeeded: boolean }) {
  const cta = setupNeeded ? "Set up your workspace" : "Log in";
  return (
    <div className="min-h-full bg-paper">
      <header className="sticky top-0 z-30 bg-paper/85 backdrop-blur border-b border-line">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="" className="w-7 h-7" />
            <span className="text-[16px] font-semibold tracking-tight">Data Narrator</span>
          </span>
          <nav className="hidden md:flex items-center gap-8 text-[14px] text-ink-2">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#features" className="hover:text-ink">What you get</a>
            <a href="#team" className="hover:text-ink">Your team</a>
            <a href="#private" className="hover:text-ink">Privacy</a>
          </nav>
          <Link to="/login" className={btnCls("primary")}>{cta}</Link>
        </div>
      </header>

      <section className="max-w-[1200px] mx-auto px-6 lg:px-10 pt-16 lg:pt-24 pb-20 grid lg:grid-cols-[1fr_1.05fr] gap-14 items-center">
        <div>
          <div className="label mb-5">For companies that run on Excel</div>
          <h1 className="text-[44px] lg:text-[56px] leading-[1.05] font-semibold tracking-[-0.025em]">
            Your business data, explained in plain words.
          </h1>
          <p className="text-[18px] leading-relaxed text-ink-2 mt-6 max-w-xl">
            Data Narrator reads your Excel sheets and databases, works out what every column means, and writes a short report of
            what changed, what is owed and what needs attention. Your team records daily entries in the same place, and the daily
            MIS report makes itself.
          </p>
          <div className="flex flex-wrap gap-3 mt-9">
            <Link to="/login" className={`${btnCls("primary")} min-h-12 px-6 text-[16px]`}>{cta} <ArrowRight size={18} /></Link>
            <a href="#how" className={`${btnCls("secondary")} min-h-12 px-6 text-[16px]`}>See how it works</a>
          </div>
          <ul className="mt-9 grid sm:grid-cols-3 gap-3 text-[14px] text-ink-2">
            {["No column mapping", "Runs on your own server", "Excel in, Excel out"].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check size={16} className="text-good" /> {t}</li>
            ))}
          </ul>
        </div>
        <Preview />
      </section>

      <section id="how" className="border-t border-line bg-surface">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-20">
          <div className="label mb-3">How it works</div>
          <h2 className="text-[32px] font-semibold tracking-[-0.02em] max-w-2xl">From a messy spreadsheet to a clear daily picture, in four steps.</h2>
          <ol className="grid md:grid-cols-2 lg:grid-cols-4 gap-10 mt-12">
            {STEPS.map((s) => (
              <li key={s.n}>
                <div className="w-9 h-9 rounded-full border border-ink flex items-center justify-center text-[15px] font-semibold num">{s.n}</div>
                <h3 className="text-[18px] font-semibold mt-5">{s.title}</h3>
                <p className="text-[15px] text-ink-2 leading-relaxed mt-2">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="border-t border-line">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-20">
          <div className="label mb-3">What you get</div>
          <h2 className="text-[32px] font-semibold tracking-[-0.02em] max-w-2xl">The work an MIS team does every day, in one place.</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-line border border-line rounded-[14px] overflow-hidden mt-12">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-paper p-7">
                <h3 className="text-[17px] font-semibold">{f.title}</h3>
                <p className="text-[15px] text-ink-2 leading-relaxed mt-2">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="team" className="border-t border-line bg-surface">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-20">
          <div className="label mb-3">Your team</div>
          <h2 className="text-[32px] font-semibold tracking-[-0.02em] max-w-2xl">A day with Data Narrator.</h2>
          <div className="grid lg:grid-cols-3 gap-10 mt-12">
            {DAY.map((d) => (
              <div key={d.who} className="border-t-2 border-ink pt-5">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[17px] font-semibold">{d.who}</h3>
                  <span className="text-[13px] text-mute num">{d.when}</span>
                </div>
                <p className="text-[15px] text-ink-2 leading-relaxed mt-3">{d.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="private" className="border-t border-line">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-20 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="label mb-3">Privacy</div>
            <h2 className="text-[32px] font-semibold tracking-[-0.02em]">Your data stays with you.</h2>
            <p className="text-[16px] text-ink-2 leading-relaxed mt-4 max-w-lg">
              Data Narrator runs on your own computer, office server or cloud account. Nothing is sent to anyone else, and it works on
              your office network without the internet. It is open source, so your IT team can see exactly what it does.
            </p>
          </div>
          <div className="bg-ink text-white rounded-[14px] p-7 font-mono text-[14px] leading-loose">
            <div className="text-white/50"># on your server</div>
            <div>docker compose up</div>
            <div className="text-white/50 mt-3"># then open</div>
            <div>http://your-server:8000</div>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-20 flex flex-wrap items-center justify-between gap-8">
          <div>
            <h2 className="text-[28px] font-semibold tracking-[-0.02em]">Try it with the sample company.</h2>
            <p className="text-[16px] text-ink-2 mt-2 max-w-xl">Six months of invoices, customers, products and payments from a fictional electricals distributor. Load it from the Data page after you log in.</p>
          </div>
          <Link to="/login" className={`${btnCls("primary")} min-h-12 px-6 text-[16px]`}>{cta} <ArrowRight size={18} /></Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8 flex flex-wrap justify-between gap-4 text-[13px] text-mute">
          <span>Data Narrator · open source, self-hosted</span>
          <span>Figures on this page are an example.</span>
        </div>
      </footer>
    </div>
  );
}
