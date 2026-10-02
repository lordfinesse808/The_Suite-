import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { getUserName } from "@/lib/repo";
import { fmtTime, fmtSlot, naira, maskPhone, STAGE_LABEL, fmtDate } from "@/lib/format";
import { googleCalendarLink } from "@/lib/agents/scheduler";
import { missingFields } from "@/lib/agents/scoring";
import { insideWindow } from "@/lib/messaging/send";
import { Avatar, ScoreBadge, PhotoTile } from "@/components/ui";
import { AutoRefresh } from "@/components/client";
import { IconBack, IconCheck, IconMapPin } from "@/components/icons";
import { TakeoverButton, Composer, StageSelect, DeleteLead } from "./controls";
import type { Message } from "@/lib/db/schema";

export const metadata = { title: "Lead" };

function AgentLabel({ m }: { m: Message }) {
  const who = m.author.startsWith("ai:") ? m.author.slice(3) : m.author.startsWith("user:") ? "you" : m.author;
  const p = m.payload as { reason?: string };
  return (
    <div className="mt-1.5 text-right font-mono text-[12px] uppercase tracking-wide text-ink-2">
      {who === "system" ? "AI" : who} · {fmtTime(m.created_at)}
      {m.type === "template" ? " · template" : ""}
      {p.reason === "match" ? " · listing attached" : ""}
      {m.status === "failed" ? " · failed" : ""}
    </div>
  );
}

function Bubble({ m }: { m: Message }) {
  const p = m.payload as Record<string, unknown>;
  if (m.direction === "event") {
    return (
      <div className="my-2 flex items-center gap-3 px-6 text-[14px] text-ink-2">
        <span className="h-px flex-1 bg-line" />
        <span className="text-center">{m.body}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    );
  }
  if (m.direction === "in") {
    return (
      <div className="max-w-[78%]">
        <div className="rounded-2xl bg-soft px-4 py-3 text-[16px] leading-relaxed">
          {m.type === "audio" ? <em className="text-muted">Voice note</em> : m.type === "location" ? <span className="inline-flex items-center gap-1.5"><IconMapPin size={16} /> Shared a location</span> : m.body || <em className="text-muted">({m.type})</em>}
          {m.type === "interactive" && <span className="ml-2 rounded bg-white px-1.5 font-mono text-[11px] text-muted">tapped</span>}
        </div>
        <div className="mt-1.5 font-mono text-[12px] text-ink-2">{fmtTime(m.created_at)}</div>
      </div>
    );
  }
  const mine = m.author.startsWith("user:");
  return (
    <div className="ml-auto max-w-[78%]">
      <div className={`overflow-hidden rounded-2xl text-[16px] leading-relaxed ${mine ? "bg-[#e7ece0]" : "bg-green-soft"}`}>
        {m.type === "image" && <PhotoTile refCode={String(p.listing_ref ?? "0")} className="h-28 w-full" label="PHOTO 1" />}
        {m.type === "location" ? (
          <div className="flex items-center gap-2 px-4 py-3"><IconMapPin size={18} /> <span>{m.body}</span></div>
        ) : (
          <div className="whitespace-pre-line px-4 py-3">{m.type === "template" && <span className="mb-1 block font-mono text-[11px] uppercase text-green">Template · {String(p.name)}</span>}{m.body}</div>
        )}
        {m.type === "buttons" && (
          <div className="flex flex-wrap gap-2 px-4 pb-3">
            {(p.buttons as { id: string; title: string }[]).map((b) => <span key={b.id} className="rounded-full border border-green/40 bg-white/60 px-3 py-1 text-sm text-green">{b.title}</span>)}
          </div>
        )}
        {m.type === "list" && (
          <div className="border-t border-green/15 px-4 py-2 text-sm text-ink-2">
            {(p.rows as { id: string; title: string }[]).map((r) => <div key={r.id} className="py-0.5">› {r.title}</div>)}
          </div>
        )}
      </div>
      <AgentLabel m={m} />
    </div>
  );
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const sess = await requireSession();
  const { id } = await params;
  const db = await getDb();
  const [lead] = await db.select().from(s.leads).where(and(eq(s.leads.org_id, sess.orgId), eq(s.leads.id, id)));
  if (!lead) notFound();
  const msgs = await db.select().from(s.messages).where(and(eq(s.messages.org_id, sess.orgId), eq(s.messages.lead_id, id))).orderBy(asc(s.messages.seq));
  const matches = await db
    .select({ m: s.matches, l: s.listings })
    .from(s.matches)
    .innerJoin(s.listings, eq(s.listings.id, s.matches.listing_id))
    .where(and(eq(s.matches.org_id, sess.orgId), eq(s.matches.lead_id, id)))
    .orderBy(desc(s.matches.created_at), asc(s.matches.rank));
  const viewings = await db
    .select({ v: s.viewings, l: s.listings })
    .from(s.viewings)
    .innerJoin(s.listings, eq(s.listings.id, s.viewings.listing_id))
    .where(and(eq(s.viewings.org_id, sess.orgId), eq(s.viewings.lead_id, id)))
    .orderBy(desc(s.viewings.start_at));
  const drafts = await db.select().from(s.drafts).where(and(eq(s.drafts.org_id, sess.orgId), eq(s.drafts.lead_id, id))).orderBy(desc(s.drafts.created_at));
  const agentName = await getUserName(lead.assigned_agent_id);
  const n = lead.needs;
  const seenMatch = new Set<string>();
  const shortlist = matches.filter((x) => (seenMatch.has(x.l.id) ? false : (seenMatch.add(x.l.id), true))).slice(0, 5);
  const activeViewing = viewings.find((v) => v.v.status === "confirmed");
  const pendingDraft = drafts.find((d) => d.status === "pending");
  const ev = (re: RegExp) => [...msgs].reverse().find((m) => m.direction === "event" && re.test(m.body));
  const qualifiedEv = ev(/^Qualified/);
  const matchEv = ev(/^Matchmaker/);
  const asked = lead.ctx.questions_asked ?? 0;
  const answered = 5 - missingFields(n).length;
  const firstName = lead.name?.split(" ")[0];
  const relay = [
    { name: "Qualifier", done: !!qualifiedEv || ["qualified", "shortlisted", "viewing_booked", "viewed", "won"].includes(lead.stage), note: `${answered} of 5 answered${asked ? ` · ${asked} asked` : ""}${qualifiedEv ? ` · ${fmtTime(qualifiedEv.created_at)}` : ""}` },
    { name: "Matchmaker", done: shortlist.length > 0, note: shortlist.length ? `${shortlist.length} homes sent${matchEv ? ` · ${fmtTime(matchEv.created_at)}` : ""}` : "waiting for needs" },
    { name: "Follow-up writer", done: drafts.some((d) => d.status === "sent"), note: pendingDraft ? "draft waiting for you" : drafts.length ? `${drafts.filter((d) => d.status === "sent").length} sent` : lead.last_inbound_at && lead.last_outbound_at && lead.last_inbound_at > lead.last_outbound_at ? "not needed · replied" : "not needed yet" },
    { name: "Scheduler", done: !!activeViewing || lead.stage === "viewed" || lead.stage === "won", note: activeViewing ? `${fmtSlot(activeViewing.v.start_at)} · confirmed` : lead.ctx.offered_slots?.length ? "slots offered" : "no viewing yet" },
  ];
  const scorePct = Math.min(100, lead.score);
  const tempLabel = lead.temperature[0].toUpperCase() + lead.temperature.slice(1);
  const window = insideWindow(lead.last_inbound_at);
  return (
    <>
      <AutoRefresh ms={3000} />
      <Link href="/inbox" className="mb-5 inline-flex items-center gap-1 text-[16px] text-green"><IconBack size={16} /> Inbox</Link>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={lead.name} phone={lead.phone} size={64} />
          <div>
            <h1 className="text-3xl font-bold md:text-4xl">{lead.name ?? maskPhone(lead.phone)}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <ScoreBadge score={lead.score} temperature={lead.temperature} />
              <span className="chip bg-soft text-ink-2">{lead.source.channel === "web_form" ? "Website form" : "WhatsApp"} · {maskPhone(lead.phone)}</span>
              {lead.opted_out_at ? <span className="chip bg-red-soft text-red">Opted out {fmtDate(lead.opted_out_at)}</span> : lead.consent_at ? <span className="chip bg-soft text-ink-2"><IconCheck size={14} /> Consent notice sent {fmtTime(lead.consent_at)}</span> : <span className="chip bg-amber-soft text-amber">No consent notice yet</span>}
              <span className="chip bg-soft text-ink-2">{lead.language === "pcm" ? "Pidgin" : "English"}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StageSelect leadId={lead.id} stage={lead.stage} />
          <a href={`tel:${lead.phone}`} className="btn btn-dark !py-3">Call {firstName ?? "lead"}</a>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {relay.map((r) => (
          <div key={r.name}>
            <div className={`mb-2 h-[5px] rounded-full ${r.done ? "bg-green" : "bg-line"}`} />
            <div className={`font-semibold ${r.done ? "" : "text-ink-2"}`}>{r.name}</div>
            <div className="font-mono text-[13px] text-ink-2">{r.note}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="card flex min-h-[560px] flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line bg-soft/60 px-5 py-4">
            <div className="flex items-center gap-2.5 text-[15px]">
              <span className={`h-2.5 w-2.5 rounded-full ${lead.ai_paused ? "bg-amber" : lead.opted_out_at ? "bg-red" : "bg-green"}`} />
              {lead.opted_out_at ? <span><b>Opted out.</b> All outbound messages are blocked.</span> : lead.ai_paused ? <span><b>You have this chat.</b> The AI is silent until you resume it.{!window && " The 24-hour window is closed; use a template from Approvals."}</span> : <span><b>AI is replying.</b> Every message is logged with its prompt version.</span>}
            </div>
            {!lead.opted_out_at && <TakeoverButton leadId={lead.id} paused={lead.ai_paused} />}
          </div>
          <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-5 py-6" style={{ maxHeight: 720 }}>
            <div className="label-mono text-center">Conversation</div>
            {msgs.map((m) => <Bubble key={m.id} m={m} />)}
          </div>
          <Composer leadId={lead.id} paused={lead.ai_paused} optedOut={!!lead.opted_out_at} />
        </section>

        <aside className="space-y-5">
          <div className="card p-6">
            <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Lead score</h2><span className="text-sm text-ink-2">by Qualifier</span></div>
            <div className="mt-2 flex items-baseline gap-2"><span className="text-6xl font-medium">{lead.score}</span><span className={`text-xl font-semibold ${lead.temperature === "hot" ? "text-amber" : "text-ink-2"}`}>{tempLabel}</span></div>
            <div className="mt-3 h-2 rounded-full bg-soft"><div className="h-2 rounded-full bg-amber" style={{ width: `${scorePct}%` }} /></div>
            <div className="mt-2 flex justify-between font-mono text-[11px] text-ink-2"><span>0 COLD</span><span>40 WARM</span><span>70 HOT</span><span>100</span></div>
            <ul className="mt-4 space-y-1.5 text-[15px]">
              {lead.score_breakdown.filter((b) => b.ok || b.points < 0).map((b) => (
                <li key={b.label} className="flex items-start gap-2"><span className={b.points < 0 ? "text-red" : "text-green"}>{b.points < 0 ? "!" : <IconCheck size={16} />}</span> <span className="flex-1">{b.label}</span><span className="font-mono text-xs text-muted">{b.points > 0 ? `+${b.points}` : b.points || ""}</span></li>
              ))}
              {lead.score_breakdown.filter((b) => !b.ok && b.points >= 0 && b.max > 0).map((b) => (
                <li key={b.label} className="flex items-start gap-2 text-ink-2"><span className="w-4 text-center">·</span> <span className="flex-1">{b.label}</span><span className="font-mono text-xs text-muted">{b.points ? `+${b.points}` : ""}</span></li>
              ))}
            </ul>
          </div>

          <div className="card p-6">
            <h2 className="mb-3 text-xl font-semibold">What they need</h2>
            <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[15px]">
              {[
                ["Intent", n.purpose ? { rent: "Rent", sale: "Buy", shortlet: "Short-let" }[n.purpose] : "—"],
                ["Home", [n.bedrooms_min !== undefined && n.property_type !== "land" ? `${n.bedrooms_min}-bed` : "", n.property_type].filter(Boolean).join(" ") || "—"],
                ["Areas", n.areas?.join(", ") || "—"],
                ["Budget", n.budget_max ? naira(n.budget_max, n.period) : "—"],
                ["Move by", n.move_in_text ?? (n.move_in_by ? fmtDate(n.move_in_by) : n.nights ? `${n.nights} nights` : "—")],
                ["Pays", n.financing ? { cash: "Cash, upfront", mortgage: "Mortgage", instalments: "Instalments" }[n.financing] : "—"],
                ["Must have", n.must_haves?.join(", ") || "—"],
                ["Name", lead.name ?? "—"],
                ["Email", lead.email ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-ink-2">{k}</dt><dd className={k === "Budget" ? "font-mono" : ""}>{v}</dd></div>
              ))}
            </dl>
          </div>

          <div className="card p-6">
            <h2 className="mb-3 text-xl font-semibold">Shortlist sent</h2>
            {shortlist.length === 0 ? <p className="text-ink-2">No homes sent yet.</p> : (
              <ul className="space-y-3">
                {shortlist.map(({ m, l }) => {
                  const viewing = viewings.find((v) => v.l.id === l.id && v.v.status !== "cancelled");
                  return (
                    <li key={m.id} className="flex items-center gap-3">
                      <PhotoTile refCode={l.ref_code} photo={l.photos[0]} label="" className="h-14 w-14 shrink-0 rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px]">{l.title}</div>
                        <div className="font-mono text-[12px] text-ink-2">{naira(l.price_amount, l.price_period)} · match {m.score}</div>
                      </div>
                      <span className={`text-sm ${viewing ? "font-semibold text-green" : "text-ink-2"}`}>{viewing ? "Viewing" : "Sent"}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {viewings.length > 0 && (
            <div className="card p-6">
              <h2 className="mb-3 text-xl font-semibold">Viewings</h2>
              <ul className="space-y-3 text-[15px]">
                {viewings.map(({ v, l }) => (
                  <li key={v.id}>
                    <div className="flex justify-between"><span>{fmtSlot(v.start_at)} · {l.area}</span><span className="capitalize text-ink-2">{v.status.replace("_", "-")}</span></div>
                    {v.status === "confirmed" && (
                      <a className="text-sm text-green underline" target="_blank" href={googleCalendarLink({ title: `Viewing: ${l.title} with ${lead.name ?? lead.phone}`, start: v.start_at, end: v.end_at, details: `Lead ${lead.phone}. Listing ${l.ref_code}.`, location: l.address })}>
                        Add to Google Calendar
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card space-y-2 p-6 text-[15px]">
            <h2 className="mb-1 text-xl font-semibold">Details and data</h2>
            <div className="flex justify-between"><span className="text-ink-2">Assigned to</span><span>{agentName ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-ink-2">Stage</span><span>{STAGE_LABEL[lead.stage]}</span></div>
            <div className="flex justify-between"><span className="text-ink-2">Source</span><span>{lead.source.listing_ref ?? lead.source.page ?? lead.source.channel ?? "WhatsApp"}</span></div>
            <div className="flex justify-between"><span className="text-ink-2">24-hour window</span><span>{window ? "Open" : "Closed (templates only)"}</span></div>
            {pendingDraft && <Link href="/approvals" className="block font-semibold text-amber underline">A follow-up draft is waiting for approval</Link>}
            <div className="flex items-center justify-between border-t border-line pt-3">
              <a href={`/api/leads/${lead.id}/export`} className="text-sm font-semibold text-green underline">Export data (JSON)</a>
              <DeleteLead leadId={lead.id} />
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
