"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo, IconMapPin, IconMic, IconSend } from "@/components/icons";

type Account = { pnid: string; name: string; display: string };
type Msg = { id: string; direction: "in" | "out"; type: string; body: string; author: string; created_at: string; payload: Record<string, unknown> };
type LeadInfo = { id: string; stage: string; score: number; temperature: string; ai_paused: boolean; opted_out: boolean; language: string } | null;

const PRESETS: { label: string; name: string; phone: string; first: string }[] = [
  { label: "Lagos rent (English)", name: "Chiamaka", phone: "+2348031110001", first: "Good evening. I saw the 3-bed in Lekki on your Instagram. Is it still available?" },
  { label: "Pidgin, Yaba", name: "Emeka", phone: "+2348031110002", first: "How far, abeg I dey find mini flat for Yaba. My budget na 1.5m" },
  { label: "From a listing link", name: "Bola", phone: "+2348031110003", first: "Hi, I'm interested in LST-1042" },
  { label: "Abuja sale", name: "Musa", phone: "+2348031110004", first: "Good morning. I want to buy a 4 bedroom duplex in Gwarinpa, budget 110m, mortgage approved." },
  { label: "Short-let, VI", name: "Tare", phone: "+2348031110005", first: "Need a 2-bed short-let in VI for 3 nights this weekend, max 90k per night" },
  { label: "Yoruba (hand-off)", name: "Kemi", phone: "+2348031110006", first: "Ẹ kú àárọ̀. Mo fẹ́ ilé ní Lekki, ẹ jọ̀wọ́" },
  { label: "Scam attempt", name: "", phone: "+2348031110007", first: "I am abroad. Send me your account number first so I can pay the deposit before viewing" },
];

function fmt(t: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" }).format(new Date(t));
}

function Phone({ idx, account }: { idx: number; account: Account | undefined }) {
  const preset = PRESETS[idx] ?? PRESETS[0];
  const [phone, setPhone] = useState(preset.phone);
  const [name, setName] = useState(preset.name);
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [lead, setLead] = useState<LeadInfo>(null);
  const [busy, setBusy] = useState(false);
  const [openList, setOpenList] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!account) return;
    const r = await fetch(`/api/dev/conversation?phone=${encodeURIComponent(phone)}&pnid=${account.pnid}`, { cache: "no-store" });
    const j = (await r.json()) as { messages: Msg[]; lead: LeadInfo };
    setMsgs((prev) => (prev.length !== j.messages.length ? j.messages : prev));
    setLead(j.lead);
  }, [phone, account]);

  useEffect(() => {
    load();
    const id = setInterval(load, 1500);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [msgs.length]);

  async function send(message: Record<string, unknown>) {
    if (!account) return;
    setBusy(true);
    await fetch("/api/dev/simulate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone, name: name || undefined, phoneNumberId: account.pnid, message }) });
    setTimeout(load, 300);
    setTimeout(() => {
      load();
      setBusy(false);
    }, 1200);
  }

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[620px] w-full max-w-[400px] flex-col overflow-hidden rounded-[36px] border-[10px] border-ink bg-[#ecede8] shadow-xl">
      <div className="flex items-center gap-3 bg-panel px-4 py-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">{account?.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{account?.name}</div>
          <div className="truncate text-xs text-ink-2">{lead ? `${lead.stage} · score ${lead.score}${lead.ai_paused ? " · human has chat" : ""}${lead.opted_out ? " · opted out" : ""}` : "Business account"}</div>
        </div>
      </div>
      <div className="flex gap-2 border-b border-line bg-panel/80 px-3 py-2 text-xs">
        <input value={phone} onChange={(e) => { setPhone(e.target.value); setMsgs([]); }} className="w-[130px] rounded-md border border-line bg-white px-2 py-1 font-mono" aria-label="Lead phone" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Profile name" className="min-w-0 flex-1 rounded-md border border-line bg-white px-2 py-1" aria-label="Lead profile name" />
      </div>
      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {msgs.length === 0 && (
          <div className="mx-auto mt-6 max-w-[90%] rounded-xl bg-white/70 p-3 text-center text-xs text-ink-2">
            You are the lead. Type a message, or start with:
            <button className="mt-2 block w-full rounded-lg border border-green/40 bg-white px-2 py-1.5 text-left text-[13px] text-green" onClick={() => send({ type: "text", text: preset.first })}>“{preset.first}”</button>
          </div>
        )}
        {msgs.map((m) => {
          const p = m.payload as { buttons?: { id: string; title: string }[]; rows?: { id: string; title: string; description?: string }[]; button?: string; url?: string; name?: string; lat?: number; lng?: number };
          if (m.direction === "in") {
            return (
              <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#d7e7d9] px-3 py-2 text-[14px]">
                {m.type === "audio" ? "🎤 Voice note (0:07)" : m.type === "location" ? "📍 Location" : m.body}
                <div className="mt-0.5 text-right font-mono text-[10px] text-ink-2">{fmt(m.created_at)} ✓✓</div>
              </div>
            );
          }
          return (
            <div key={m.id} className="max-w-[88%] overflow-hidden rounded-2xl rounded-tl-sm bg-white text-[14px] shadow-sm">
              {m.type === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt="" className="h-36 w-full object-cover" />
              )}
              {m.type === "location" ? (
                <a className="block" href={`https://maps.google.com/?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">
                  <div className="hatch flex h-24 items-center justify-center text-green"><IconMapPin size={30} /></div>
                  <div className="px-3 py-2"><div className="font-semibold">{p.name}</div><div className="text-xs text-ink-2">{m.body.split(" · ")[1]}</div></div>
                </a>
              ) : (
                <div className="whitespace-pre-line px-3 py-2">
                  {m.type === "template" && <div className="mb-1 font-mono text-[10px] uppercase text-green">Template message</div>}
                  {m.body}
                  <div className="mt-0.5 text-right font-mono text-[10px] text-ink-2">{fmt(m.created_at)}</div>
                </div>
              )}
              {m.type === "buttons" && (
                <div className="grid border-t border-line">
                  {p.buttons?.map((b) => (
                    <button key={b.id} disabled={busy} onClick={() => send({ type: "button_reply", id: b.id, title: b.title })} className="border-b border-line py-2 text-center font-semibold text-green last:border-0 hover:bg-green-soft/40">
                      {b.title}
                    </button>
                  ))}
                </div>
              )}
              {m.type === "list" && (
                <div className="border-t border-line">
                  <button onClick={() => setOpenList(openList === m.id ? null : m.id)} className="w-full py-2 text-center font-semibold text-green">☰ {p.button ?? "Choose"}</button>
                  {openList === m.id && (
                    <div className="border-t border-line bg-panel/60">
                      {p.rows?.map((r) => (
                        <button key={r.id} onClick={() => { setOpenList(null); send({ type: "list_reply", id: r.id, title: r.title }); }} className="block w-full border-b border-line px-3 py-2 text-left last:border-0 hover:bg-green-soft/40">
                          <div className="text-[13px] font-semibold">{r.title}</div>
                          {r.description && <div className="text-[11px] text-ink-2">{r.description}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {busy && <div className="w-16 rounded-2xl bg-white px-3 py-2 text-center text-ink-2">···</div>}
        <div ref={bottom} />
      </div>
      <form
        className="flex items-center gap-2 bg-panel px-2 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          send({ type: "text", text: text.trim() });
          setText("");
        }}
      >
        <button type="button" title="Share location" onClick={() => send({ type: "location", lat: 6.4389, lng: 3.4952, name: "Ikate" })} className="rounded-full p-2 text-ink-2 hover:bg-soft"><IconMapPin size={20} /></button>
        <button type="button" title="Send a voice note" onClick={() => send({ type: "audio" })} className="rounded-full p-2 text-ink-2 hover:bg-soft"><IconMic size={20} /></button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-[15px] outline-none" />
        <button className="flex h-11 w-11 items-center justify-center rounded-full bg-green text-white" aria-label="Send"><IconSend size={18} /></button>
      </form>
    </div>
  );
}

export function Simulator({ accounts }: { accounts: Account[] }) {
  const [pnid, setPnid] = useState(accounts[0]?.pnid ?? "");
  const [phones, setPhones] = useState(1);
  const [clock, setClock] = useState<{ now: string; offsetHours: number } | null>(null);
  const [note, setNote] = useState("");
  const account = accounts.find((a) => a.pnid === pnid);

  useEffect(() => {
    fetch("/api/dev/clock").then((r) => r.json()).then(setClock);
  }, []);
  async function travel(body: Record<string, unknown>) {
    const r = await fetch("/api/dev/clock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    setClock(j);
    setNote(`Ran ${j.ran} job(s), created ${j.drafts} follow-up draft(s).`);
  }
  return (
    <div className="min-h-screen bg-bg px-4 py-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Logo size={22} />
        <span className="label-mono">WhatsApp simulator · mock mode</span>
        <select value={pnid} onChange={(e) => setPnid(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm">
          {accounts.map((a) => <option key={a.pnid} value={a.pnid}>{a.name} ({a.display || a.pnid})</option>)}
        </select>
        <div className="flex items-center gap-1 text-sm">
          Phones:
          {[1, 2, 3].map((n) => <button key={n} onClick={() => setPhones(n)} className={`rounded-md px-2 py-1 ${phones === n ? "bg-ink text-white" : "bg-white"}`}>{n}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <span className="text-ink-2">Clock {clock ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(clock.now)) : ""}{clock?.offsetHours ? ` (+${clock.offsetHours}h)` : ""}:</span>
          {[2, 24, 72].map((h) => <button key={h} onClick={() => travel({ hours: h })} className="rounded-md bg-white px-2 py-1 hover:bg-soft">+{h}h</button>)}
          <button onClick={() => travel({ reset: true })} className="rounded-md bg-white px-2 py-1 hover:bg-soft">reset</button>
        </div>
        <a href="/inbox" target="_blank" className="ml-auto text-sm font-semibold text-green underline">Open the agent inbox</a>
      </div>
      {note && <p className="mb-3 text-sm text-ink-2">{note}</p>}
      <div className="flex flex-wrap justify-center gap-6">
        {Array.from({ length: phones }, (_, i) => <Phone key={`${pnid}-${i}`} idx={i} account={account} />)}
      </div>
      <details className="mx-auto mt-6 max-w-3xl text-sm text-ink-2">
        <summary className="cursor-pointer">Scenarios to try</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {PRESETS.map((p) => <li key={p.phone}><b>{p.label}</b> ({p.phone}): “{p.first}”</li>)}
          <li>Reply <b>STOP</b> at any point to opt out; <b>START</b> to re-subscribe.</li>
          <li>After booking, use <b>+24h</b> to fire reminders. Go quiet and use <b>+24h</b> again to get a follow-up draft in Approvals.</li>
          <li>Take over a chat from the lead page: the AI goes silent until you resume it.</li>
        </ul>
      </details>
    </div>
  );
}
