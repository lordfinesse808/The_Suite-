// Read models for the dashboard. All scoped by org_id.
import { and, asc, desc, eq, gte, inArray, lt, ne, sql, isNull } from "drizzle-orm";
import { getDb, rows } from "./db/client";
import * as s from "./db/schema";
import { now, DAY } from "./clock";
import type { Lead } from "./db/schema";

export async function sidebarCounts(orgId: string) {
  const db = await getDb();
  const [r] = await db
    .select({
      open: sql<number>`count(*) filter (where ${s.leads.stage} not in ('won','lost'))::int`,
    })
    .from(s.leads)
    .where(eq(s.leads.org_id, orgId));
  const [l] = await db.select({ n: sql<number>`count(*)::int` }).from(s.listings).where(and(eq(s.listings.org_id, orgId), eq(s.listings.hidden, false)));
  const [d] = await db.select({ n: sql<number>`count(*)::int` }).from(s.drafts).where(and(eq(s.drafts.org_id, orgId), eq(s.drafts.status, "pending")));
  const [a] = await db.select({ n: sql<number>`count(*)::int` }).from(s.alerts).where(and(eq(s.alerts.org_id, orgId), isNull(s.alerts.read_at)));
  return { open: r?.open ?? 0, listings: l?.n ?? 0, approvals: d?.n ?? 0, alerts: a?.n ?? 0 };
}

export type InboxRow = Lead & { relay: { agent: string; label: string; step: number }; lastAt: Date | null; lastBody: string; lastIn: string; pendingDraft: boolean; nextViewing: Date | null };

export function relayOf(l: Lead, opts: { pendingDraft?: boolean; nextViewing?: Date | null } = {}): { agent: string; label: string; step: number } {
  if (l.spam) return { agent: "Qualifier", label: "paused", step: 1 };
  if (l.opted_out_at) return { agent: "Opted out", label: "STOP", step: 0 };
  if (l.needs_human && l.ai_paused) return { agent: "Qualifier", label: l.flag_reason?.toLowerCase().includes("person") ? "asked for a human" : (l.flag_reason ?? "needs you").toLowerCase(), step: 1 };
  if (l.ai_paused) return { agent: "You", label: "took over", step: 1 };
  if (opts.pendingDraft) return { agent: "Follow-up", label: "draft ready", step: 3 };
  switch (l.stage) {
    case "new":
    case "qualifying":
      return { agent: "Qualifier", label: "asking", step: 1 };
    case "qualified":
      return { agent: "Matchmaker", label: "ranking", step: 2 };
    case "shortlisted": {
      const n = l.ctx.shortlist?.length ?? 0;
      if (l.ctx.offered_slots?.length) return { agent: "Scheduler", label: "slots offered", step: 4 };
      if ((l.ctx.followup_touches ?? 0) > 0) return { agent: "Follow-up", label: `touch ${l.ctx.followup_touches} of 2`, step: 3 };
      return { agent: "Matchmaker", label: `${n} homes sent`, step: 2 };
    }
    case "viewing_booked":
      return { agent: "Scheduler", label: opts.nextViewing ? `viewing ${new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(opts.nextViewing)}` : "viewing booked", step: 4 };
    case "viewed":
      return { agent: "You", label: "viewed · offer stage", step: 4 };
    case "won":
      return { agent: "Closed", label: "won", step: 4 };
    case "lost":
      return { agent: "Closed", label: "lost", step: 0 };
  }
}

export async function inbox(orgId: string, filter: string, q: string) {
  const db = await getDb();
  const leads = await db.select().from(s.leads).where(eq(s.leads.org_id, orgId)).orderBy(desc(s.leads.updated_at));
  const ids = leads.map((l) => l.id);
  const last = ids.length
    ? await db.execute(sql`select distinct on (lead_id) lead_id, body, created_at from messages where org_id = ${orgId} and direction <> 'event' order by lead_id, seq desc`)
    : [];
  const lastInRes = ids.length
    ? await db.execute(sql`select distinct on (lead_id) lead_id, body from messages where org_id = ${orgId} and direction = 'in' order by lead_id, seq desc`)
    : [];
  const lastInMap = new Map(rows<{ lead_id: string; body: string }>(lastInRes).map((r) => [r.lead_id, r.body]));
  const lastMap = new Map(rows<{ lead_id: string; body: string; created_at: string }>(last).map((r) => [r.lead_id, r]));
  const drafts = ids.length ? await db.select({ lead_id: s.drafts.lead_id }).from(s.drafts).where(and(eq(s.drafts.org_id, orgId), eq(s.drafts.status, "pending"))) : [];
  const draftSet = new Set(drafts.map((d) => d.lead_id));
  const vs = await db.select().from(s.viewings).where(and(eq(s.viewings.org_id, orgId), eq(s.viewings.status, "confirmed"), gte(s.viewings.start_at, now()))).orderBy(asc(s.viewings.start_at));
  const nextV = new Map<string, Date>();
  for (const v of vs) if (!nextV.has(v.lead_id)) nextV.set(v.lead_id, v.start_at);

  let list: InboxRow[] = leads
    .filter((l) => l.stage !== "won" && l.stage !== "lost")
    .map((l) => {
      const lm = lastMap.get(l.id);
      return {
        ...l,
        relay: relayOf(l, { pendingDraft: draftSet.has(l.id), nextViewing: nextV.get(l.id) }),
        lastAt: lm ? new Date(lm.created_at) : l.updated_at,
        lastBody: lm?.body ?? "",
        lastIn: lastInMap.get(l.id) ?? "",
        pendingDraft: draftSet.has(l.id),
        nextViewing: nextV.get(l.id) ?? null,
      };
    })
    .sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0));

  const waiting = (r: InboxRow) => r.needs_human || r.pendingDraft || r.spam || (r.ai_paused && !r.opted_out_at);
  const counts = {
    all: list.length,
    waiting: list.filter(waiting).length,
    hot: list.filter((r) => r.temperature === "hot").length,
    ai: list.filter((r) => !r.ai_paused && !r.opted_out_at && !waiting(r)).length,
    viewing: list.filter((r) => r.stage === "viewing_booked").length,
  };
  if (filter === "waiting") list = list.filter(waiting);
  else if (filter === "hot") list = list.filter((r) => r.temperature === "hot");
  else if (filter === "ai") list = list.filter((r) => !r.ai_paused && !r.opted_out_at && !waiting(r));
  else if (filter === "viewing") list = list.filter((r) => r.stage === "viewing_booked");
  if (q) {
    const t = q.toLowerCase();
    list = list.filter((r) => [r.name, r.phone, r.needs.areas?.join(" "), r.needs.property_type, String(r.needs.budget_max ?? ""), r.lastBody].join(" ").toLowerCase().includes(t));
  }
  return { rows: list, counts };
}

export async function headlineMetrics(orgId: string, sinceDays = 30) {
  const db = await getDb();
  const since = new Date(now().getTime() - sinceDays * DAY);
  // Median first reply: first AI outbound after first inbound, per lead.
  const fr = await db.execute(sql`
    with firsts as (
      select lead_id,
        min(created_at) filter (where direction = 'in') as first_in,
        min(created_at) filter (where direction = 'out' and author like 'ai:%') as first_ai
      from messages where org_id = ${orgId} and created_at >= ${since.toISOString()}::timestamptz group by lead_id
    )
    select percentile_cont(0.5) within group (order by extract(epoch from (first_ai - first_in))) as median_s
    from firsts where first_ai is not null and first_in is not null and first_ai >= first_in`);
  const frRows = rows<{ median_s: number | string | null }>(fr);
  const median = frRows[0]?.median_s != null ? Number(frRows[0].median_s) : null;

  const leads = await db.select().from(s.leads).where(and(eq(s.leads.org_id, orgId), gte(s.leads.created_at, since)));
  const allLeads = leads.length ? leads : await db.select().from(s.leads).where(eq(s.leads.org_id, orgId));
  const qualifiedStages = ["qualified", "shortlisted", "viewing_booked", "viewed", "won"];
  const qualified = allLeads.filter((l) => qualifiedStages.includes(l.stage));
  const humanTouched = new Set(
    (await db.select({ lead_id: s.messages.lead_id }).from(s.messages).where(and(eq(s.messages.org_id, orgId), sql`${s.messages.author} like 'user:%'`))).map((r) => r.lead_id),
  );
  const qualifiedNoHuman = qualified.filter((l) => !humanTouched.has(l.id) && !l.needs_human).length;
  const viewingLeads = new Set((await db.select({ lead_id: s.viewings.lead_id }).from(s.viewings).where(and(eq(s.viewings.org_id, orgId), ne(s.viewings.status, "cancelled")))).map((v) => v.lead_id));
  const qualifiedToViewing = qualified.filter((l) => viewingLeads.has(l.id)).length;
  const done = await db.select({ status: s.viewings.status }).from(s.viewings).where(and(eq(s.viewings.org_id, orgId), inArray(s.viewings.status, ["attended", "no_show"])));
  const attended = done.filter((d) => d.status === "attended").length;
  const sent = await db.select({ body: s.drafts.body, original: s.drafts.original_body }).from(s.drafts).where(and(eq(s.drafts.org_id, orgId), eq(s.drafts.status, "sent")));
  const unedited = sent.filter((d) => d.body.trim() === d.original.trim()).length;
  const weekStart = new Date(now().getTime() - 7 * DAY);
  const [vw] = await db.select({ n: sql<number>`count(*)::int` }).from(s.viewings).where(and(eq(s.viewings.org_id, orgId), gte(s.viewings.created_at, weekStart), ne(s.viewings.status, "cancelled")));
  return {
    medianFirstReplyS: median,
    qualifiedWithoutHumanPct: qualified.length ? Math.round((qualifiedNoHuman / qualified.length) * 100) : null,
    qualifiedToViewingPct: qualified.length ? Math.round((qualifiedToViewing / qualified.length) * 100) : null,
    showRatePct: done.length ? Math.round((attended / done.length) * 100) : null,
    draftsUneditedPct: sent.length ? Math.round((unedited / sent.length) * 100) : null,
    viewingsThisWeek: vw?.n ?? 0,
    qualifiedCount: qualified.length,
    leadCount: allLeads.length,
  };
}

export async function bySource(orgId: string) {
  const db = await getDb();
  const leads = await db.select().from(s.leads).where(eq(s.leads.org_id, orgId));
  const viewings = await db.select().from(s.viewings).where(and(eq(s.viewings.org_id, orgId), ne(s.viewings.status, "cancelled")));
  const vLeads = new Set(viewings.map((v) => v.lead_id));
  const label = (l: Lead) =>
    l.source.referral ? "Click-to-WhatsApp ads" : l.source.channel === "web_form" ? "Website form" : l.source.listing_ref ? "Listing links (wa.me)" : l.source.page === "instagram" ? "Instagram" : "WhatsApp direct";
  const map = new Map<string, { leads: number; viewings: number; won: number }>();
  for (const l of leads) {
    const k = label(l);
    const r = map.get(k) ?? { leads: 0, viewings: 0, won: 0 };
    r.leads++;
    if (vLeads.has(l.id)) r.viewings++;
    if (l.stage === "won") r.won++;
    map.set(k, r);
  }
  return [...map.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.viewings - a.viewings || b.leads - a.leads);
}

export async function teamStats(orgId: string) {
  const db = await getDb();
  const members = await db
    .select({ id: s.users.id, name: s.users.name, email: s.users.email, role: s.memberships.role })
    .from(s.memberships)
    .innerJoin(s.users, eq(s.users.id, s.memberships.user_id))
    .where(eq(s.memberships.org_id, orgId));
  const leads = await db.select({ agent: s.leads.assigned_agent_id, stage: s.leads.stage }).from(s.leads).where(eq(s.leads.org_id, orgId));
  const vs = await db.select({ agent: s.viewings.agent_id, start: s.viewings.start_at, status: s.viewings.status }).from(s.viewings).where(eq(s.viewings.org_id, orgId));
  return members.map((m) => ({
    ...m,
    open: leads.filter((l) => l.agent === m.id && l.stage !== "won" && l.stage !== "lost").length,
    won: leads.filter((l) => l.agent === m.id && l.stage === "won").length,
    upcoming: vs.filter((v) => v.agent === m.id && v.status === "confirmed" && v.start > now()).length,
  }));
}

export async function weekViewings(orgId: string, weekStart: Date) {
  const db = await getDb();
  const end = new Date(weekStart.getTime() + 7 * DAY);
  return db
    .select({ v: s.viewings, lead: { id: s.leads.id, name: s.leads.name, phone: s.leads.phone }, listing: { title: s.listings.title, area: s.listings.area, ref: s.listings.ref_code, purpose: s.listings.purpose, address: s.listings.address }, agent: s.users.name })
    .from(s.viewings)
    .innerJoin(s.leads, eq(s.leads.id, s.viewings.lead_id))
    .innerJoin(s.listings, eq(s.listings.id, s.viewings.listing_id))
    .leftJoin(s.users, eq(s.users.id, s.viewings.agent_id))
    .where(and(eq(s.viewings.org_id, orgId), gte(s.viewings.start_at, weekStart), lt(s.viewings.start_at, end), ne(s.viewings.status, "cancelled")))
    .orderBy(asc(s.viewings.start_at));
}

export async function recentAlerts(orgId: string, limit = 8) {
  const db = await getDb();
  return db.select().from(s.alerts).where(eq(s.alerts.org_id, orgId)).orderBy(desc(s.alerts.created_at)).limit(limit);
}
