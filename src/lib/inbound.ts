// Webhook → database: route by phone_number_id, find or create the lead,
// store the message idempotently (unique wa_message_id) and enqueue processing.
import { and, eq, sql } from "drizzle-orm";
import { getDb, rows } from "./db/client";
import * as s from "./db/schema";
import { now } from "./clock";
import { enqueueJob, audit } from "./repo";
import type { Inbound, StatusUpdate } from "./channels/whatsapp/types";

export async function orgForPhoneNumberId(phoneNumberId: string) {
  const db = await getDb();
  const [a] = await db.select().from(s.whatsappAccounts).where(eq(s.whatsappAccounts.phone_number_id, phoneNumberId));
  return a?.org_id ?? null;
}

/** Round-robin to the agent with the fewest open leads (owner if no agents). */
export async function pickAgent(orgId: string): Promise<string | null> {
  const db = await getDb();
  const r = await db.execute(sql`
    select m.user_id, count(l.id)::int as open
    from memberships m
    left join leads l on l.assigned_agent_id = m.user_id and l.org_id = m.org_id and l.stage not in ('won','lost')
    where m.org_id = ${orgId}
    group by m.user_id, m.role
    order by (m.role = 'owner') asc, open asc
    limit 1`);
  const row = rows<{ user_id: string }>(r)[0];
  return row?.user_id ?? null;
}

export async function findOrCreateLead(orgId: string, phone: string, init: { name?: string; source?: s.LeadSource }) {
  const db = await getDb();
  const [existing] = await db.select().from(s.leads).where(and(eq(s.leads.org_id, orgId), eq(s.leads.phone, phone)));
  if (existing) return { lead: existing, created: false };
  const agent = await pickAgent(orgId);
  const [lead] = await db
    .insert(s.leads)
    .values({ org_id: orgId, phone, name: init.name || null, source: init.source ?? { channel: "whatsapp" }, assigned_agent_id: agent, created_at: now(), updated_at: now() })
    .onConflictDoNothing()
    .returning();
  if (!lead) {
    const [again] = await db.select().from(s.leads).where(and(eq(s.leads.org_id, orgId), eq(s.leads.phone, phone)));
    return { lead: again, created: false };
  }
  await audit(orgId, "system", "lead.created", "lead", lead.id, { channel: init.source?.channel ?? "whatsapp" }, lead.id);
  return { lead, created: true };
}

export interface Stored {
  orgId: string;
  leadId: string;
  messageId: string;
}

export async function storeInbound(m: Inbound): Promise<Stored | null> {
  const orgId = await orgForPhoneNumberId(m.phoneNumberId);
  if (!orgId) {
    console.warn(`[webhook] unknown phone_number_id ${m.phoneNumberId}`);
    return null;
  }
  const db = await getDb();
  const source: s.LeadSource = { channel: "whatsapp", ...(m.referral ? { referral: m.referral } : {}) };
  const { lead } = await findOrCreateLead(orgId, m.from, { name: m.profileName, source });
  const [msg] = await db
    .insert(s.messages)
    .values({
      org_id: orgId, lead_id: lead.id, direction: "in", type: m.type, body: m.text, author: "lead", wa_message_id: m.waMessageId,
      payload: { reply_id: m.replyId, location: m.location, referral: m.referral }, status: "received", created_at: now(),
    })
    .onConflictDoNothing({ target: s.messages.wa_message_id })
    .returning();
  if (!msg) return null; // duplicate delivery: already stored
  await db.update(s.leads).set({ last_inbound_at: now(), updated_at: now() }).where(eq(s.leads.id, lead.id));
  await enqueueJob(orgId, "process_inbound", now(), { lead_id: lead.id, message_id: msg.id }, `in:${m.waMessageId}`);
  return { orgId, leadId: lead.id, messageId: msg.id };
}

export async function applyStatus(st: StatusUpdate) {
  const db = await getDb();
  await db
    .update(s.messages)
    .set({ status: st.status, ...(st.pricingCategory ? { payload: sql`${s.messages.payload} || ${JSON.stringify({ pricing_category: st.pricingCategory })}::jsonb` } : {}) })
    .where(eq(s.messages.wa_message_id, st.waMessageId));
}
