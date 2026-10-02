// Agent 3: Follow-up writer. Finds leads that went quiet (24h, then 72h, at most
// 2 touches), drafts a follow-up, and waits for the agent to approve it.
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import * as s from "../db/schema";
import { now, HOUR } from "../clock";
import { alert, audit, getLead, getListing, getOrg, logEvent, updateLead } from "../repo";
import { writeFor } from "./orchestrator";
import { needsSummary } from "./matchmaker";
import { naira } from "../format";
import { insideWindow, sendMessage, type SendOutcome } from "../messaging/send";
import { renderTemplate } from "../channels/whatsapp/templates";
import type { Move } from "../llm";

const TOUCHES = [24 * HOUR, 72 * HOUR];
const DRAFT_TTL = 48 * HOUR;

export async function scanSilentLeads(orgId?: string): Promise<number> {
  const db = await getDb();
  const t = now();
  const conds = [
    inArray(s.leads.stage, ["qualifying", "qualified", "shortlisted"]),
    isNull(s.leads.opted_out_at),
    eq(s.leads.spam, false),
    eq(s.leads.ai_paused, false),
    lt(s.leads.last_inbound_at, new Date(t.getTime() - TOUCHES[0])),
    sql`${s.leads.last_outbound_at} > ${s.leads.last_inbound_at}`,
    sql`coalesce((${s.leads.ctx}->>'followup_touches')::int, 0) < ${TOUCHES.length}`,
  ];
  if (orgId) conds.push(eq(s.leads.org_id, orgId));
  const candidates = await db.select().from(s.leads).where(and(...conds)).limit(50);
  let created = 0;
  for (const lead of candidates) {
    const touches = lead.ctx.followup_touches ?? 0;
    const silentFor = t.getTime() - (lead.last_inbound_at?.getTime() ?? 0);
    if (silentFor < TOUCHES[touches]) continue;
    const [pending] = await db.select({ id: s.drafts.id }).from(s.drafts).where(and(eq(s.drafts.lead_id, lead.id), eq(s.drafts.status, "pending"))).limit(1);
    if (pending) continue;
    await createFollowupDraft(lead.org_id, lead.id, touches === 0 ? "silent_24h" : "silent_72h");
    created++;
  }
  return created;
}

export async function createFollowupDraft(orgId: string, leadId: string, trigger: string) {
  const lead = await getLead(orgId, leadId);
  if (!lead) return null;
  const focusId = lead.ctx.pending_listing_id ?? lead.listing_id ?? lead.ctx.shortlist?.[0];
  const l = focusId ? await getListing(orgId, focusId) : null;
  const move: Move = l
    ? { k: "followup", title: l.title.replace(/, (Abuja|Lagos)$/, ""), price: naira(l.price_amount, l.price_period) }
    : { k: "followup", summary: needsSummary(lead.needs, lead.language === "pcm" ? "pcm" : "en-NG") };
  const { text } = await writeFor(orgId, leadId, "followup", [move], l ? [l.price_amount] : []);
  const optOut = lead.language === "pcm" ? "Reply STOP if you no want message again." : "Reply STOP to opt out.";
  const body = /\bSTOP\b/.test(text) ? text : `${text}\n\n${optOut}`;
  const db = await getDb();
  const [d] = await db
    .insert(s.drafts)
    .values({ org_id: orgId, lead_id: leadId, body, original_body: body, trigger, expires_at: new Date(now().getTime() + DRAFT_TTL), created_at: now() })
    .returning();
  await updateLead(orgId, leadId, { ctx: { ...lead.ctx, followup_touches: (lead.ctx.followup_touches ?? 0) + 1, last_followup_at: now().toISOString() } });
  await logEvent(orgId, leadId, `Follow-up writer · draft ready (${trigger.replace("silent_", "no reply ")})`, { draft_id: d.id });
  await alert(orgId, leadId, "draft_ready", `Follow-up draft ready for ${lead.name ?? lead.phone}.`);
  return d;
}

export async function approveDraft(orgId: string, draftId: string, userId: string, editedBody?: string): Promise<SendOutcome & { via?: "text" | "template" }> {
  const db = await getDb();
  const [d] = await db.select().from(s.drafts).where(and(eq(s.drafts.org_id, orgId), eq(s.drafts.id, draftId)));
  if (!d || d.status !== "pending") return { ok: false, blocked: "send_failed", error: "Draft is not pending" };
  const lead = await getLead(orgId, d.lead_id);
  const org = await getOrg(orgId);
  if (!lead || !org) return { ok: false, blocked: "send_failed", error: "Lead not found" };
  const body = (editedBody ?? d.body).trim();
  let res: SendOutcome;
  let via: "text" | "template";
  if (insideWindow(lead.last_inbound_at)) {
    via = "text";
    res = await sendMessage(orgId, lead.id, { type: "text", body }, { author: `user:${userId}`, reason: `followup:${d.trigger}`, approvedBy: userId });
  } else {
    // Outside the 24-hour window only an approved template may be sent.
    via = "template";
    const core = body.replace(/\n+/g, " ").replace(/reply stop.*$/i, "").replace(/^(hi|hello|how far)[^,.]*[,.]\s*/i, "").replace(new RegExp(`^${org.name} here\\.\\s*`, "i"), "").trim().slice(0, 300);
    const vars = [lead.name?.split(" ")[0] ?? "there", org.name, core];
    res = await sendMessage(orgId, lead.id, { type: "template", name: "follow_up_checkin", language: "en", variables: vars, preview: renderTemplate("follow_up_checkin", vars) }, { author: `user:${userId}`, reason: `followup:${d.trigger}`, approvedBy: userId });
  }
  if (res.ok) {
    await db.update(s.drafts).set({ status: "sent", body, approved_by: userId, sent_at: now() }).where(eq(s.drafts.id, d.id));
    await audit(orgId, `user:${userId}`, "draft.approved", "draft", d.id, { edited: body !== d.original_body, via }, lead.id);
    await logEvent(orgId, lead.id, `Follow-up sent · approved${body !== d.original_body ? " with edits" : ""} · ${via}`);
  } else if (res.blocked === "opted_out") {
    await db.update(s.drafts).set({ status: "rejected" }).where(eq(s.drafts.id, d.id));
  }
  return { ...res, via };
}

export async function rejectDraft(orgId: string, draftId: string, userId: string) {
  const db = await getDb();
  await db.update(s.drafts).set({ status: "rejected", approved_by: userId }).where(and(eq(s.drafts.org_id, orgId), eq(s.drafts.id, draftId), eq(s.drafts.status, "pending")));
  await audit(orgId, `user:${userId}`, "draft.rejected", "draft", draftId, {});
}

export async function expireDrafts() {
  const db = await getDb();
  const r = await db.update(s.drafts).set({ status: "expired" }).where(and(eq(s.drafts.status, "pending"), lt(s.drafts.expires_at, now()))).returning({ id: s.drafts.id });
  return r.length;
}
