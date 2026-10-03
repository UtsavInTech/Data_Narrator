import { Check, Copy, Mail, MessageCircle, Send, Sunrise } from "lucide-react";
import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, type Brief as BriefData, type BriefSettings } from "../api";
import { useAuth } from "../auth";
import { btnCls, Button, ErrorNote, Field, inputCls, Notice, PageHeader, Panel, Section, Spinner } from "../components/ui";
import { STATUS } from "./Home";

const appLink = () => `${window.location.origin}/`;

/** WhatsApp's own formatting: *bold* and line breaks. */
function WhatsAppText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <Fragment key={i}>
          {line.split(/(\*[^*]+\*)/g).map((part, j) => part.startsWith("*") && part.endsWith("*") && part.length > 2
            ? <b key={j} className="font-semibold">{part.slice(1, -1)}</b> : <Fragment key={j}>{part}</Fragment>)}
          {"\n"}
        </Fragment>
      ))}
    </>
  );
}

/** The brief as it arrives: a chat bubble on a phone. */
function Phone({ brief }: { brief: BriefData }) {
  const time = "7:00 am";
  return (
    <div className="mx-auto w-full max-w-[380px] rounded-[38px] bg-frame p-3 shadow-[0_30px_60px_-30px_rgba(19,32,27,0.6)]">
      <div className="rounded-[28px] overflow-hidden bg-[#efe7dc]">
        <div className="bg-[#1f3b33] text-white px-4 pt-4 pb-3 flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-accent text-frame flex items-center justify-center"><Sunrise size={18} /></span>
          <span className="min-w-0">
            <span className="block text-[15px] font-medium truncate">Data Narrator</span>
            <span className="block text-[12px] text-white/70">{brief.company}</span>
          </span>
        </div>
        <div className="px-3 py-4 max-h-[560px] overflow-y-auto">
          <div className="text-center mb-3"><span className="text-[11px] bg-white/80 text-ink-2 rounded-md px-2 py-0.5">Today</span></div>
          <div className="relative bg-white rounded-[10px] rounded-tl-none px-3 pt-2 pb-5 text-[13.5px] leading-[1.45] text-[#111] whitespace-pre-wrap shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[92%]">
            <WhatsAppText text={brief.text} />
            <span className="absolute right-2 bottom-1 text-[10.5px] text-[#667781]">{time}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Channel({ on, icon, name, children }: { on: boolean; icon: ReactNode; name: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-3">
      <span className="mt-0.5 text-mute">{icon}</span>
      <div className="min-w-0 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-medium">{name}</span>
          <span className={`text-[11px] rounded-full px-2 py-0.5 ${on ? "bg-good-bg text-good" : "bg-sunken text-mute"}`}>{on ? "Ready" : "Not set up"}</span>
        </div>
        <div className="text-mute mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function Schedule({ locked }: { locked: boolean }) {
  const { user } = useAuth();
  const admin = user!.role === "admin";
  const [s, setS] = useState<BriefSettings | null>(null);
  const [v, setV] = useState({ at_time: "07:00", emails: "", phones: "", enabled: false });
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    api.briefSettings().then((r) => { setS(r); setV({ at_time: r.at_time, emails: r.emails, phones: r.phones, enabled: r.enabled }); }).catch(() => undefined);
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("save");
    setNote(null);
    try {
      setS(await api.saveBriefSettings(v));
      setNote({ tone: "success", text: v.enabled ? `Saved. It goes out every day at ${v.at_time}.` : "Saved. Turn it on to send it every day." });
    } catch (err) {
      setNote({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const sendNow = async () => {
    setBusy("send");
    setNote(null);
    try {
      const r = await api.sendBrief(appLink());
      const bad = r.results.filter((x) => !x.ok);
      setNote(bad.length
        ? { tone: "error", text: bad.map((x) => (x.to ? `${x.to}: ` : "") + x.error).join(" · ") }
        : { tone: "success", text: `Sent to ${r.results.map((x) => x.to).join(", ")}.` });
    } catch (err) {
      setNote({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  if (!s) return null;
  const disabled = locked || !admin;
  return (
    <Section title="Every morning, automatically">
      <Panel className="p-5">
        {locked && <div className="mb-4"><Notice>In a sample company the brief isn't sent anywhere. In your own workspace you choose the time and who gets it.</Notice></div>}
        {!locked && !admin && <div className="mb-4"><Notice>Your admin chooses who gets the brief and when.</Notice></div>}
        <form onSubmit={save}>
          <div className="grid grid-cols-[9.5rem_1fr] gap-x-4 items-end">
            <Field label="Time"><input type="time" className={inputCls} value={v.at_time} disabled={disabled} onChange={(e) => setV({ ...v, at_time: e.target.value })} required /></Field>
            <label className="flex items-center gap-3 mb-5 min-h-11 text-[14px]">
              <input type="checkbox" className="w-5 h-5 accent-[#13201b]" checked={v.enabled} disabled={disabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} />
              Send it every day
            </label>
          </div>
          <Field label="Email to" hint="Separate several with commas."><input className={inputCls} value={v.emails} disabled={disabled} onChange={(e) => setV({ ...v, emails: e.target.value })} placeholder="owner@company.in, plant.head@company.in" /></Field>
          <Field label="WhatsApp to" hint="With country code."><input className={inputCls} value={v.phones} disabled={disabled} onChange={(e) => setV({ ...v, phones: e.target.value })} placeholder="+91 98765 43210" inputMode="tel" /></Field>
          {note && <div className="mb-4">{note.tone === "error" ? <ErrorNote message={note.text} /> : <Notice tone="success">{note.text}</Notice>}</div>}
          <div className="flex flex-wrap gap-2.5">
            <Button type="submit" busy={busy === "save"} disabled={disabled}>Save</Button>
            <Button type="button" variant="secondary" busy={busy === "send"} disabled={disabled} onClick={sendNow}><Send size={16} /> Send now</Button>
          </div>
        </form>
        <div className="mt-5 pt-2 border-t border-line divide-y divide-line">
          <Channel on={s.channels.email} icon={<Mail size={18} />} name="Email">
            {s.channels.email ? "This server can send email." : "Your IT team sets DN_SMTP_HOST, DN_SMTP_USER and DN_SMTP_PASSWORD on the server (Gmail, Zoho or your own mail server)."}
          </Channel>
          <Channel on={s.channels.whatsapp} icon={<MessageCircle size={18} />} name="WhatsApp, automatic">
            {s.channels.whatsapp ? "This server can send WhatsApp messages." : "Needs a WhatsApp Business account (Meta Cloud API): DN_WHATSAPP_TOKEN and DN_WHATSAPP_PHONE_ID. Until then, use Share on WhatsApp."}
          </Channel>
        </div>
      </Panel>
    </Section>
  );
}

export default function Brief() {
  const { user } = useAuth();
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.brief(appLink()).then(setBrief).catch((e: Error) => setError(e.message));
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(brief!.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <PageHeader title="Morning brief" description="Yesterday's business in one message: what each area did, what to act on today, and who went quiet. Read it here, or have it waiting on your phone before the day starts." />
      {error && <ErrorNote message={error} />}
      {!brief && !error && <Spinner label="Writing the brief" />}
      {brief && (
        <div className="grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] gap-x-14 gap-y-12 items-start">
          <div className="lg:sticky lg:top-8">
            <Phone brief={brief} />
            <div className="flex flex-wrap justify-center gap-2.5 mt-6">
              <a className={btnCls("primary")} href={`https://wa.me/?text=${encodeURIComponent(brief.text)}`} target="_blank" rel="noreferrer">
                <MessageCircle size={17} /> Share on WhatsApp
              </a>
              <button type="button" className={btnCls("secondary")} onClick={copy}>
                {copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy text</>}
              </button>
            </div>
            <p className="text-[12px] text-mute text-center mt-2">Opens WhatsApp with the brief filled in. Pick a person or group and send.</p>
          </div>

          <div className="min-w-0">
            <Section title="Yesterday, area by area">
              <Panel className="divide-y divide-line overflow-hidden">
                {brief.areas.length === 0 && <div className="px-5 py-4 text-[14px] text-mute">Nothing was recorded yesterday.</div>}
                {brief.areas.map((a) => (
                  <div key={a.area} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-3.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${STATUS[a.status].dot}`} title={STATUS[a.status].word} />
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold truncate">{a.area}</span>
                      <span className="block text-[12px] text-mute truncate">{a.quiet ? "Nothing recorded" : a.figures.map((f) => f.label).join(" · ")}</span>
                    </span>
                    {!a.quiet && (
                      <span className="text-right">
                        <span className="block text-[18px] font-semibold num">{a.figures[0].value}</span>
                        {a.figures[0].month && <span className="block text-[12px] text-mute num">month so far {a.figures[0].month}</span>}
                      </span>
                    )}
                  </div>
                ))}
              </Panel>
            </Section>
            <Schedule locked={!!user!.demo} />
            <Section title="As an email">
              <Panel className="overflow-hidden">
                <div className="px-5 py-3 border-b border-line text-[13px] text-mute truncate">Subject: <span className="text-ink">{brief.subject}</span></div>
                <iframe title="Email preview" sandbox="" srcDoc={brief.html} className="w-full h-[520px] bg-white" />
              </Panel>
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
