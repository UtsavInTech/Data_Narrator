import { ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { DemoCompanies } from "../components/DemoCompanies";
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
    title: "It works out what\u2019s what",
    text: "It finds the real headings, skips titles and subtotal rows, turns \u201c\u20b91,200\u201d and \u201c03-04-2026\u201d into numbers and dates, and links tables that share an ID such as Customer ID.",
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

/** A day at each sample company: who does what, and what the app does for them. */
const DAYS = [
  {
    company: "Bhavani Valley Dairy",
    kind: "Dairy · Erode",
    people: [
      { who: "Collection centre in-charge", when: "6:30 am", text: "Enters the morning milk from each village centre: litres, fat % and SNF %. The rate and the amount payable to farmers work themselves out." },
      { who: "MIS executive", when: "9:00 am", text: "Used to spend the morning merging centre sheets, plant output and dispatch into one MIS. Now the daily report is already waiting, with the centres that haven't sent figures listed at the bottom." },
      { who: "Plant & sales manager", when: "10:00 am", text: "Reads that fat % at Kodumudi has slipped from its usual 4.10 to 3.74 while other centres held steady, that rejected milk is up, and that one Chennai distributor's returns keep climbing." },
      { who: "Managing Director", when: "Monday", text: "Reads the story: September sales up 40% on festive demand, Bengaluru the fastest-growing market, ₹1.19 crore overdue mostly from supermarket chains." },
    ],
  },
  {
    company: "Narmada Electricals",
    kind: "Electricals distributor · Pune",
    people: [
      { who: "Billing executive", when: "9:30 am", text: "Records the morning\u2019s invoices. The form already has the next invoice number, fills in the customer\u2019s details and calculates GST. Each batch is confirmed with an Employee ID and password." },
      { who: "Branch manager", when: "10:00 am", text: "Opens yesterday\u2019s report: \u20b94.8 lakh billed, 9% more than the day before. Nashik hasn\u2019t sent anything yet, and two invoices have no GST." },
      { who: "Owner", when: "Monday", text: "Reads the story: September up on August, Rahul Deshmukh\u2019s sales well below his usual, \u20b938 lakh overdue, most of it from three customers." },
    ],
  },
  {
    company: "Sahyadri Roadlines",
    kind: "Transport · Pune",
    people: [
      { who: "Trip & fuel clerk", when: "8:00 am", text: "Logs the day's dispatches against LR numbers and every diesel fill with the odometer reading. A repeated LR number is caught before it's saved." },
      { who: "Operations manager", when: "11:00 am", text: "Sees that delivery delays are rising, that 18 trips still have no proof of delivery (so they can't be billed), and that diesel spend is up 13%." },
      { who: "Founder", when: "Monday", text: "Reads the story: freight billed this month, ₹41 lakh overdue, and which manufacturers bring most of the business." },
    ],
  },
];

/** Typical daily MIS work, by hand vs with Data Narrator. Time is per day, for a small MIS desk. */
const MIS_WORK = [
  { task: "Collect sheets from branches, centres or depots", before: "45 min", after: "0", how: "Each site enters into its own form" },
  { task: "Clean, de-duplicate and merge into the master sheet", before: "60 min", after: "0", how: "Done on entry; repeats and typos caught" },
  { task: "Build the daily MIS report", before: "60 min", after: "0", how: "Ready at the time you choose, or one click" },
  { task: "Chase who hasn't sent figures", before: "20 min", after: "2 min", how: "The report lists them" },
  { task: "Spot what's wrong (falling quality, late payers, leakage)", before: "If there's time", after: "Every day", how: "Flagged in plain words" },
];

const INDUSTRIES = [
  {
    title: "Distributors & Wholesalers",
    text: "Track invoices, receivables, branch-wise sales, and salesperson performance. Know who owes you and for how long.",
  },
  {
    title: "Warehouses & Logistics",
    text: "Monitor stock movements, inbound/outbound volumes, dispatch status, and daily operational reports across locations.",
  },
  {
    title: "Manufacturers & Processors",
    text: "Daily production data, raw material consumption, quality checks, and shift-wise output \u2014 all from your existing Excel sheets.",
  },
  {
    title: "Mining & Extraction",
    text: "Production logs, equipment dispatch, overburden tracking, fuel consumption, and royalty calculations from field data.",
  },
  {
    title: "Retailers & FMCG",
    text: "Sales by SKU, store-wise comparisons, stock-out alerts, and supplier payment ageing \u2014 without custom software.",
  },
  {
    title: "Service & Contracting",
    text: "Project billing, work-order tracking, employee attendance, and payment follow-ups from the data you already have.",
  },
];

function Preview() {
  const buckets = [
    { label: "Up to 30 days late", v: 13.76 },
    { label: "31\u201360 days", v: 4.04 },
    { label: "61\u201390 days", v: 9.74 },
    { label: "Over 90 days", v: 11.26 },
  ];
  return (
    <div className="bg-surface border border-line rounded-[16px] shadow-[0_24px_60px_-30px_rgba(28,27,25,0.35)] overflow-hidden">
      <div className="flex items-center justify-between px-6 h-12 border-b border-line text-[13px] text-mute">
        <span className="font-medium text-ink-2">Invoices &middot; Narmada Electricals</span>
        <span>Example</span>
      </div>
      <div className="p-6 lg:p-8">
        <div className="label mb-3">The story so far</div>
        <p className="text-[19px] leading-[1.55] text-ink">
          September closed at <b className="font-semibold">{"\u20B9"}1.43 crore</b>, up 12% on August.{" "}
          <b className="font-semibold">{"\u20B9"}1.44 crore</b> is still to be collected, and {"\u20B9"}38.8 lakh of it is past the due date.
        </p>
        <div className="grid grid-cols-3 gap-px bg-line border border-line rounded-[10px] overflow-hidden mt-6">
          {[["Invoices", "2,143"], ["Billed", "\u20B99.09 Cr"], ["Overdue", "\u20B938.8 L"]].map(([l, v]) => (
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
              <li key={b.label} className="grid grid-cols-[minmax(7rem,9rem)_1fr_4.5rem] items-center gap-3 text-[13px]">
                <span className="text-ink-2">{b.label}</span>
                <span className="h-2 rounded-full bg-sunken overflow-hidden">
                  <span className={`block h-full rounded-full ${i === 3 ? "bg-bad" : "bg-ink"}`} style={{ width: `${(b.v / 13.76) * 100}%` }} />
                </span>
                <span className="num text-right text-ink-2">{"\u20B9"}{b.v} L</span>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-mute mt-4">Biggest overdue: Om Sai Lighting House ({"\u20B9"}13.75 lakh), Jai Bhavani Electric Stores, Mangal Agencies.</p>
        </div>
      </div>
    </div>
  );
}

function DaySection() {
  const [i, setI] = useState(0);
  const day = DAYS[i];
  return (
    <section id="team" className="border-t border-line bg-surface scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-20">
        <div className="label mb-3">A day with Data Narrator</div>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="text-[32px] font-semibold tracking-[-0.02em] max-w-2xl">Everyone does their part. Nobody builds the report.</h2>
          <div role="tablist" aria-label="Company" className="inline-flex p-1 rounded-[10px] bg-sunken border border-line overflow-x-auto max-w-full">
            {DAYS.map((d, k) => (
              <button key={d.company} type="button" role="tab" aria-selected={k === i} onClick={() => setI(k)}
                className={`min-h-9 px-3.5 rounded-[7px] text-[14px] whitespace-nowrap ${k === i ? "bg-surface text-ink font-medium shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-mute hover:text-ink"}`}>
                {d.company}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[14px] text-mute mt-3">{day.kind}</p>
        <div className={`grid gap-10 mt-10 ${day.people.length === 4 ? "md:grid-cols-2 lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          {day.people.map((d) => (
            <div key={d.who} className="border-t-2 border-ink pt-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[17px] font-semibold">{d.who}</h3>
                <span className="text-[13px] text-mute num whitespace-nowrap">{d.when}</span>
              </div>
              <p className="text-[15px] text-ink-2 leading-relaxed mt-3">{d.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
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
            <a href="#try" className="hover:text-ink">Try it</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#features" className="hover:text-ink">What you get</a>
            <a href="#team" className="hover:text-ink">A day with it</a>
            <a href="#industries" className="hover:text-ink">Industries</a>
            <a href="#private" className="hover:text-ink">Privacy</a>
          </nav>
          <Link to="/login" className={btnCls("primary")}>{cta}</Link>
        </div>
      </header>

      {/* Hero */}
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
            <a href="#try" className={`${btnCls("primary")} min-h-12 px-6 text-[16px]`}>Try a sample company <ArrowRight size={18} /></a>
            <Link to="/login" className={`${btnCls("secondary")} min-h-12 px-6 text-[16px]`}>{cta}</Link>
          </div>
          <ul className="mt-9 grid sm:grid-cols-3 gap-3 text-[14px] text-ink-2">
            {["No column mapping", "Runs on your own server", "Excel in, Excel out"].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check size={16} className="text-good" /> {t}</li>
            ))}
          </ul>
        </div>
        <Preview />
      </section>

      {/* Try it */}
      <section id="try" className="border-t border-line bg-sunken/50 scroll-mt-16">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-20">
          <div className="grid lg:grid-cols-[1fr_1.6fr] gap-12">
            <div>
              <div className="label mb-3">Try it now</div>
              <h2 className="text-[32px] font-semibold tracking-[-0.02em]">Open a sample company as the owner, a manager or a data entry clerk.</h2>
              <p className="text-[16px] text-ink-2 leading-relaxed mt-4">
                Three made-up companies, each with six months of data in the Excel files a real one keeps. Every role sees
                something different: the owner sees everything, a manager sees the story and the daily report, and a data entry
                clerk sees only the forms.
              </p>
              <p className="text-[16px] text-ink-2 leading-relaxed mt-4">
                No sign-up. The logins are below so you can also type them on the login page or the Android app.
              </p>
            </div>
            <DemoCompanies />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-line bg-surface scroll-mt-16">
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

      {/* Features */}
      <section id="features" className="border-t border-line scroll-mt-16">
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

      {/* A day with it */}
      <DaySection />

      {/* The MIS desk */}
      <section id="mis" className="border-t border-line scroll-mt-16">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-20">
          <div className="label mb-3">The MIS desk</div>
          <h2 className="text-[32px] font-semibold tracking-[-0.02em] max-w-3xl">Your MIS person stops compiling reports and starts acting on them.</h2>
          <p className="text-[16px] text-ink-2 mt-4 max-w-2xl">
            Connect the sheets or the database once. The collecting, cleaning, merging and report-making that fill a typical
            MIS morning happen on their own, so the same person spends the time on follow-ups and on other work.
          </p>
          <div className="mt-10 bg-surface border border-line rounded-[14px] overflow-x-auto">
            <table className="w-full text-[15px] min-w-[640px]">
              <thead>
                <tr className="text-left text-[13px] text-mute border-b border-line">
                  <th className="font-medium px-6 py-3">Daily task</th>
                  <th className="font-medium px-4 py-3 text-right">By hand</th>
                  <th className="font-medium px-4 py-3 text-right">With Data Narrator</th>
                  <th className="font-medium px-6 py-3">How</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {MIS_WORK.map((w) => (
                  <tr key={w.task}>
                    <td className="px-6 py-4 font-medium">{w.task}</td>
                    <td className="px-4 py-4 text-right num text-ink-2 whitespace-nowrap">{w.before}</td>
                    <td className="px-4 py-4 text-right num font-semibold whitespace-nowrap">{w.after}</td>
                    <td className="px-6 py-4 text-ink-2">{w.how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[13px] text-mute mt-3">Typical times for a small MIS desk producing one daily report. Yours will differ.</p>
        </div>
      </section>

      {/* Industries */}
      <section id="industries" className="border-t border-line bg-surface scroll-mt-16">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-20">
          <div className="label mb-3">Built for your industry</div>
          <h2 className="text-[32px] font-semibold tracking-[-0.02em] max-w-2xl">Works with the data your business already keeps.</h2>
          <p className="text-[16px] text-ink-2 mt-4 max-w-2xl">
            Data Narrator doesn&rsquo;t need a special format. If your team records it in Excel, a database, or a shared folder, it can read it, understand it, and report on it.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-line border border-line rounded-[14px] overflow-hidden mt-12">
            {INDUSTRIES.map((ind) => (
              <div key={ind.title} className="bg-surface p-7">
                <h3 className="text-[17px] font-semibold">{ind.title}</h3>
                <p className="text-[15px] text-ink-2 leading-relaxed mt-2">{ind.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section id="private" className="border-t border-line scroll-mt-16">
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

      {/* Final CTA */}
      <section className="border-t border-line bg-surface">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-20 text-center">
          <h2 className="text-[28px] font-semibold tracking-[-0.02em]">See it working in one click.</h2>
          <p className="text-[16px] text-ink-2 mt-3 max-w-xl mx-auto">
            Open the dairy, the electricals distributor or the transport company. No sign-up needed.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-8">
            <a href="#try" className={`${btnCls("primary")} min-h-12 px-6 text-[16px]`}>Try a sample company <ArrowRight size={18} /></a>
            <Link to="/login" className={`${btnCls("secondary")} min-h-12 px-6 text-[16px]`}>{cta}</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8 flex flex-wrap justify-between gap-4 text-[13px] text-mute">
          <span>Data Narrator &middot; open source, self-hosted &middot; v0.3.0</span>
          <span className="flex items-center gap-6">
            <span>Figures on this page are from a sample company.</span>
            <span>&copy; {new Date().getFullYear()}</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
