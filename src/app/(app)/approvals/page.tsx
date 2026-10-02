import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { getOrg } from "@/lib/repo";
import { checkReply, hasEmoji } from "@/lib/agents/guardrails";
import { insideWindow } from "@/lib/messaging/send";
import { nairaShort, relTime } from "@/lib/format";
import { now } from "@/lib/clock";
import { PageHeader, Empty } from "@/components/ui";
import { AutoRefresh } from "@/components/client";
import { DraftEditor } from "./editor";

export const metadata = { title: "Approvals" };

function trigger(t: string, lead: s.Lead) {
  if (t === "silent_24h") return { why: `no reply in ${Math.round((now().getTime() - (lead.last_inbound_at?.getTime() ?? 0)) / 3600_000)} hours`, label: "No reply after the shortlist · touch 1 of 2" };
  if (t === "silent_72h") return { why: "no reply in 3 days", label: "Still quiet · touch 2 of 2" };
  return { why: t, label: t };
}

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const sess = await requireSession();
  const { d } = await searchParams;
  const db = await getDb();
  const org = await getOrg(sess.orgId);
  const pending = await db
    .select({ d: s.drafts, l: s.leads })
    .from(s.drafts)
    .innerJoin(s.leads, eq(s.leads.id, s.drafts.lead_id))
    .where(and(eq(s.drafts.org_id, sess.orgId), eq(s.drafts.status, "pending")))
    .orderBy(asc(s.drafts.created_at));
  const recent = await db
    .select({ d: s.drafts, l: s.leads })
    .from(s.drafts)
    .innerJoin(s.leads, eq(s.leads.id, s.drafts.lead_id))
    .where(and(eq(s.drafts.org_id, sess.orgId), inArray(s.drafts.status, ["sent", "rejected", "expired"])))
    .orderBy(desc(s.drafts.created_at))
    .limit(6);
  const hot = await db.select().from(s.leads).where(and(eq(s.leads.org_id, sess.orgId), eq(s.leads.temperature, "hot"))).orderBy(desc(s.leads.updated_at)).limit(1);
  const sel = pending.find((p) => p.d.id === d) ?? pending[0];
  let checks: { label: string; ok: boolean }[] = [];
  if (sel) {
    const ids = [sel.l.listing_id, ...(sel.l.ctx.shortlist ?? [])].filter(Boolean) as string[];
    const ls = ids.length ? await db.select().from(s.listings).where(inArray(s.listings.id, ids)) : [];
    const allowed = [...ls.map((l) => l.price_amount), ...ls.map((l) => l.service_charge ?? 0), sel.l.needs.budget_max ?? 0];
    const res = checkReply(sel.d.body, { allowedAmounts: allowed, previousAi: [], requireConsent: false });
    checks = [
      { label: "Price and terms match listing data", ok: !res.problems.some((p) => p.startsWith("invented_price")) },
      { label: "Opt-out line included", ok: /\bSTOP\b/.test(sel.d.body) },
      { label: "No emojis or exclamation marks", ok: !hasEmoji(sel.d.body) && !sel.d.body.includes("!") },
    ];
  }
  const n = sel?.l.needs;
  return (
    <>
      <AutoRefresh ms={6000} />
      <PageHeader title="Approvals" subtitle="The Follow-up writer drafts. Nothing goes out in your name until you approve it." />
      {hot[0] && (
        <Link href={`/leads/${hot[0].id}`} className="mb-6 flex items-center gap-4 rounded-3xl bg-ink p-4 text-white md:hidden">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber font-mono text-2xl">{hot[0].score}</span>
          <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-amber-soft">Hot lead</div><div className="truncate text-lg font-semibold">{hot[0].name ?? hot[0].phone}</div></div>
          <span>›</span>
        </Link>
      )}
      {pending.length === 0 ? (
        <>
          <Empty>No drafts waiting. When a lead goes quiet for 24 hours, the Follow-up writer drafts a message here for you to approve.</Empty>
          {recent.length > 0 && (
            <ul className="mt-6 space-y-1 text-sm text-ink-2">
              {recent.map(({ d: dr, l }) => <li key={dr.id} className="flex justify-between px-4"><span>{l.name ?? l.phone}</span><span className="capitalize">{dr.status} · {relTime(dr.sent_at ?? dr.created_at, now())}</span></li>)}
            </ul>
          )}
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div>
            <div className="label-mono mb-3">{pending.length} draft{pending.length === 1 ? "" : "s"} waiting</div>
            <ul className="space-y-2">
              {pending.map(({ d: dr, l }) => (
                <li key={dr.id}>
                  <Link href={`/approvals?d=${dr.id}`} className={`block rounded-2xl px-4 py-3.5 ${sel?.d.id === dr.id ? "border border-line bg-white shadow-sm" : "hover:bg-white/60"}`}>
                    <div className="flex justify-between"><span className="font-semibold">{l.name ?? l.phone}</span><span className="font-mono text-sm text-ink-2">WhatsApp</span></div>
                    <div className="text-[15px] text-ink-2">{trigger(dr.trigger, l).label}</div>
                  </Link>
                </li>
              ))}
            </ul>
            {recent.length > 0 && (
              <>
                <div className="label-mono mb-2 mt-8">Recent</div>
                <ul className="space-y-1 text-sm text-ink-2">
                  {recent.map(({ d: dr, l }) => <li key={dr.id} className="flex justify-between px-4"><span>{l.name ?? l.phone}</span><span className="capitalize">{dr.status} · {relTime(dr.sent_at ?? dr.created_at, now())}</span></li>)}
                </ul>
              </>
            )}
          </div>
          {sel && n && (
            <div className="card p-6 md:p-8">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <Link href={`/leads/${sel.l.id}`} className="text-2xl font-bold hover:underline">{sel.l.name ?? sel.l.phone}</Link>
                  <div className="mt-1 text-[16px] text-ink-2">
                    {[n.purpose === "sale" ? "Buy" : n.purpose === "shortlet" ? "Short-let" : "Rent", n.bedrooms_min !== undefined ? `${n.bedrooms_min}-bed ${n.property_type ?? ""}` : n.property_type, n.areas?.join(", "), n.budget_max ? nairaShort(n.budget_max) : null, n.financing].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className="chip self-start bg-amber-soft text-amber">Why now: {trigger(sel.d.trigger, sel.l).why}</span>
              </div>
              <div className="my-6 grid grid-cols-2 gap-3 md:grid-cols-3">
                {[
                  ["1 · Shortlist", "sent", true],
                  ["2 · This draft", sel.d.trigger === "silent_24h" ? "now" : "sent", sel.d.trigger !== "silent_24h"],
                  ["3 · Last check-in", sel.d.trigger === "silent_72h" ? "now" : "if no reply in 3 days", false],
                ].map(([t, sub, done], i) => (
                  <div key={i}>
                    <div className={`mb-2 h-[4px] rounded-full ${done ? "bg-green" : sub === "now" ? "bg-amber" : "bg-line"}`} />
                    <div className="font-semibold">{t}</div>
                    <div className="font-mono text-[12px] uppercase text-ink-2">{sub}</div>
                  </div>
                ))}
              </div>
              <DraftEditor key={sel.d.id} draftId={sel.d.id} body={sel.d.body} orgName={org?.name ?? ""} checks={checks} window={insideWindow(sel.l.last_inbound_at)} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
