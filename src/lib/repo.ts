// Small data-access helpers. Every function takes org_id explicitly so a
// query can never cross tenants by accident (RLS is the second wall).
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db/client";
import * as s from "./db/schema";
import { now } from "./clock";

export async function getOrg(orgId: string) {
  const db = await getDb();
  const [o] = await db.select().from(s.organisations).where(eq(s.organisations.id, orgId));
  return o ?? null;
}

export async function getLead(orgId: string, leadId: string) {
  const db = await getDb();
  const [l] = await db.select().from(s.leads).where(and(eq(s.leads.org_id, orgId), eq(s.leads.id, leadId)));
  return l ?? null;
}

export async function updateLead(orgId: string, leadId: string, patch: Partial<typeof s.leads.$inferInsert>) {
  const db = await getDb();
  const [l] = await db
    .update(s.leads)
    .set({ ...patch, updated_at: now() })
    .where(and(eq(s.leads.org_id, orgId), eq(s.leads.id, leadId)))
    .returning();
  return l;
}

export async function recentMessages(orgId: string, leadId: string, limit = 20) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(s.messages)
    .where(and(eq(s.messages.org_id, orgId), eq(s.messages.lead_id, leadId)))
    .orderBy(desc(s.messages.seq))
    .limit(limit);
  return rows.reverse();
}

export async function getListing(orgId: string, listingId: string) {
  const db = await getDb();
  const [l] = await db.select().from(s.listings).where(and(eq(s.listings.org_id, orgId), eq(s.listings.id, listingId)));
  return l ?? null;
}

export async function getListingByRef(orgId: string, ref: string) {
  const db = await getDb();
  const [l] = await db.select().from(s.listings).where(and(eq(s.listings.org_id, orgId), eq(s.listings.ref_code, ref.toUpperCase())));
  return l ?? null;
}

export async function audit(orgId: string, actor: string, action: string, entity: string, entityId: string | null, data: Record<string, unknown> = {}, leadId?: string | null) {
  const db = await getDb();
  await db.insert(s.auditLog).values({ org_id: orgId, actor, action, entity, entity_id: entityId, data, lead_id: leadId ?? null, created_at: now() });
}

export async function alert(orgId: string, leadId: string | null, kind: string, body: string) {
  const db = await getDb();
  await db.insert(s.alerts).values({ org_id: orgId, lead_id: leadId, kind, body, created_at: now() });
}

/** Timeline event shown inline in the chat ("Qualified · score 92 · handed to Matchmaker"). */
export async function logEvent(orgId: string, leadId: string, body: string, payload: Record<string, unknown> = {}) {
  const db = await getDb();
  await db.insert(s.messages).values({ org_id: orgId, lead_id: leadId, direction: "event", type: "event", author: "system", body, payload, status: "logged", created_at: now() });
}

export async function enqueueJob(orgId: string | null, type: string, runAt: Date, payload: Record<string, unknown>, dedupeKey?: string) {
  const db = await getDb();
  const [j] = await db
    .insert(s.jobs)
    .values({ org_id: orgId, type, run_at: runAt, payload, dedupe_key: dedupeKey ?? null, created_at: now() })
    .onConflictDoNothing({ target: s.jobs.dedupe_key })
    .returning();
  return j ?? null;
}

export async function cancelJobs(orgId: string, type: string, leadId: string) {
  const db = await getDb();
  await db
    .update(s.jobs)
    .set({ status: "cancelled" })
    .where(and(eq(s.jobs.org_id, orgId), eq(s.jobs.type, type), eq(s.jobs.status, "queued"), sql`${s.jobs.payload}->>'lead_id' = ${leadId}`));
}

export async function orgAgents(orgId: string) {
  const db = await getDb();
  return db
    .select({ id: s.users.id, name: s.users.name, email: s.users.email, role: s.memberships.role })
    .from(s.memberships)
    .innerJoin(s.users, eq(s.users.id, s.memberships.user_id))
    .where(eq(s.memberships.org_id, orgId));
}

export async function getUserName(userId: string | null | undefined) {
  if (!userId) return null;
  const db = await getDb();
  const [u] = await db.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, userId));
  return u?.name ?? null;
}
