"use server";
// Server actions for the dashboard. Every action re-checks the session and
// scopes by the session's org_id.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { getSession, login, logout, requireOwner, requireSession, signup } from "@/lib/auth";
import { audit, getLead, logEvent, updateLead } from "@/lib/repo";
import { sendMessage } from "@/lib/messaging/send";
import { approveDraft, rejectDraft } from "@/lib/agents/followup";
import { parseListingText, importListingsCsv, nextRefCode } from "@/lib/listings";
import { encrypt } from "@/lib/crypto";
import { now } from "@/lib/clock";
import { STAGES, type Stage } from "@/lib/db/schema";
import { saveUpload } from "@/lib/storage";

export type FormState = { error?: string; ok?: string } | null;

// ---- auth ----
export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const err = await login(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""));
  if (err) return { error: err };
  redirect("/inbox");
}

export async function signupAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8), orgName: z.string().min(2) }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Please fill in every field. Passwords need at least 8 characters." };
  const err = await signup(parsed.data);
  if (err) return { error: err };
  redirect("/setup");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

// ---- lead / chat ----
export async function setAiPaused(leadId: string, paused: boolean) {
  const sess = await requireSession();
  const lead = await getLead(sess.orgId, leadId);
  if (!lead) return;
  await updateLead(sess.orgId, leadId, { ai_paused: paused, ...(paused ? {} : { needs_human: false, flag_reason: lead.spam ? lead.flag_reason : null }) });
  await logEvent(sess.orgId, leadId, paused ? `${sess.name.split(" ")[0]} took over · AI paused` : `${sess.name.split(" ")[0]} resumed the AI`);
  await audit(sess.orgId, `user:${sess.userId}`, paused ? "lead.takeover" : "lead.resume_ai", "lead", leadId, {}, leadId);
  revalidatePath(`/leads/${leadId}`);
}

export async function sendAgentMessage(leadId: string, _: FormState, fd: FormData): Promise<FormState> {
  const sess = await requireSession();
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return null;
  const r = await sendMessage(sess.orgId, leadId, { type: "text", body }, { author: `user:${sess.userId}`, reason: "agent_message" });
  revalidatePath(`/leads/${leadId}`);
  if (!r.ok) {
    return { error: r.blocked === "outside_24h_window" ? "The 24-hour window has closed. Send a follow-up template from Approvals instead." : r.blocked === "opted_out" ? "This lead opted out. Nothing can be sent." : `Not sent: ${r.error ?? r.blocked}` };
  }
  return { ok: "Sent" };
}

export async function setStage(leadId: string, stage: string) {
  const sess = await requireSession();
  if (!STAGES.includes(stage as Stage)) return;
  const lead = await getLead(sess.orgId, leadId);
  if (!lead || lead.stage === stage) return;
  await updateLead(sess.orgId, leadId, { stage: stage as Stage });
  await logEvent(sess.orgId, leadId, `${sess.name.split(" ")[0]} moved the lead to ${stage.replace("_", " ")}`);
  await audit(sess.orgId, `user:${sess.userId}`, "lead.stage_changed", "lead", leadId, { from: lead.stage, to: stage }, leadId);
  revalidatePath("/pipeline");
  revalidatePath(`/leads/${leadId}`);
}

/** NDPA 2023: delete a lead and everything about them. */
export async function deleteLead(leadId: string) {
  const sess = await requireSession();
  const db = await getDb();
  const lead = await getLead(sess.orgId, leadId);
  if (!lead) return;
  await db.delete(s.leads).where(and(eq(s.leads.org_id, sess.orgId), eq(s.leads.id, leadId)));
  await db.delete(s.jobs).where(and(eq(s.jobs.org_id, sess.orgId), sql`${s.jobs.payload}->>'lead_id' = ${leadId}`));
  await audit(sess.orgId, `user:${sess.userId}`, "lead.deleted", "lead", leadId, {});
  redirect("/inbox");
}

export async function markViewing(viewingId: string, status: "attended" | "no_show" | "cancelled") {
  const sess = await requireSession();
  const db = await getDb();
  const [v] = await db.update(s.viewings).set({ status }).where(and(eq(s.viewings.org_id, sess.orgId), eq(s.viewings.id, viewingId))).returning();
  if (!v) return;
  if (status === "attended") await updateLead(sess.orgId, v.lead_id, { stage: "viewed" });
  await logEvent(sess.orgId, v.lead_id, `Viewing marked ${status.replace("_", "-")}`);
  await audit(sess.orgId, `user:${sess.userId}`, `viewing.${status}`, "viewing", viewingId, {}, v.lead_id);
  revalidatePath("/viewings");
}

export async function markAlertsRead() {
  const sess = await requireSession();
  const db = await getDb();
  await db.update(s.alerts).set({ read_at: now() }).where(eq(s.alerts.org_id, sess.orgId));
  revalidatePath("/", "layout");
}

// ---- approvals ----
export async function approveDraftAction(draftId: string, _: FormState, fd: FormData): Promise<FormState> {
  const sess = await requireSession();
  const body = String(fd.get("body") ?? "");
  const r = await approveDraft(sess.orgId, draftId, sess.userId, body || undefined);
  revalidatePath("/approvals");
  if (!r.ok) return { error: r.blocked === "opted_out" ? "This lead opted out. The draft was discarded." : `Not sent: ${r.error ?? r.blocked}` };
  return { ok: r.via === "template" ? "Sent as the follow_up_checkin template (outside the 24-hour window)." : "Sent." };
}

export async function rejectDraftAction(draftId: string) {
  const sess = await requireSession();
  await rejectDraft(sess.orgId, draftId, sess.userId);
  revalidatePath("/approvals");
}

// ---- listings ----
const listingForm = z.object({
  title: z.string().min(3),
  purpose: z.enum(["rent", "sale", "shortlet"]),
  property_type: z.string().min(2),
  bedrooms: z.coerce.number().int().min(0).max(20),
  price_amount: z.coerce.number().int().positive(),
  price_period: z.enum(["year", "month", "night", "total"]),
  service_charge: z.coerce.number().int().nonnegative().optional().or(z.literal("").transform(() => undefined)),
  area: z.string().min(2),
  city: z.enum(["Lagos", "Abuja"]),
  address: z.string().optional().default(""),
  features: z.string().optional().default(""),
  description: z.string().optional().default(""),
});

export async function createListing(_: FormState, fd: FormData): Promise<FormState> {
  const sess = await requireSession();
  const parsed = listingForm.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Check the listing fields: " + parsed.error.issues.map((i) => i.path.join(".")).join(", ") };
  const d = parsed.data;
  const db = await getDb();
  const photos: string[] = [];
  for (const f of fd.getAll("photos")) {
    if (f instanceof File && f.size > 0) photos.push(await saveUpload(f, sess.orgId));
  }
  const ref = await nextRefCode(sess.orgId);
  const { findArea } = await import("@/lib/agents/areas");
  const a = findArea(d.area);
  await db.insert(s.listings).values({
    org_id: sess.orgId, ref_code: ref, title: d.title, purpose: d.purpose, property_type: d.property_type, bedrooms: d.bedrooms,
    bathrooms: Math.max(1, d.bedrooms), price_amount: d.price_amount, price_period: d.price_period, service_charge: d.service_charge ?? null,
    area: a?.name ?? d.area, city: d.city, address: d.address, lat: a?.lat ?? null, lng: a?.lng ?? null,
    features: d.features.split(",").map((x) => x.trim()).filter(Boolean), description: d.description, photos, verified: fd.get("verified") === "on",
    agent_id: sess.userId,
  });
  await audit(sess.orgId, `user:${sess.userId}`, "listing.created", "listing", ref, {});
  revalidatePath("/listings");
  return { ok: `Published ${ref}.` };
}

export async function parseListingAction(_: unknown, fd: FormData) {
  await requireSession();
  return parseListingText(String(fd.get("text") ?? ""));
}

export async function importCsvAction(_: FormState, fd: FormData): Promise<FormState> {
  const sess = await requireSession();
  const f = fd.get("csv");
  if (!(f instanceof File) || !f.size) return { error: "Choose a CSV file." };
  const r = await importListingsCsv(sess.orgId, await f.text(), sess.userId);
  revalidatePath("/listings");
  if (r.errors.length && !r.created) return { error: r.errors.slice(0, 3).join(" ") };
  return { ok: `Imported ${r.created} listing${r.created === 1 ? "" : "s"}.${r.errors.length ? ` Skipped ${r.errors.length}: ${r.errors.slice(0, 2).join(" ")}` : ""}` };
}

export async function toggleListing(listingId: string, field: "pinned" | "hidden" | "verified" | "taken") {
  const sess = await requireSession();
  const db = await getDb();
  const [l] = await db.select().from(s.listings).where(and(eq(s.listings.org_id, sess.orgId), eq(s.listings.id, listingId)));
  if (!l) return;
  const patch =
    field === "taken" ? { status: l.status === "taken" ? ("available" as const) : ("taken" as const) }
    : field === "pinned" ? { pinned: !l.pinned }
    : field === "hidden" ? { hidden: !l.hidden }
    : { verified: !l.verified };
  await db.update(s.listings).set({ ...patch, updated_at: now() }).where(eq(s.listings.id, l.id));
  await audit(sess.orgId, `user:${sess.userId}`, `listing.${field}`, "listing", l.ref_code, patch);
  revalidatePath("/listings");
}

// ---- settings ----
export async function saveOrgSettings(_: FormState, fd: FormData): Promise<FormState> {
  const sess = await requireOwner();
  const db = await getDb();
  const areas = String(fd.get("areas_served") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const origins = String(fd.get("allowed_origins") ?? "").split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  const budget = String(fd.get("ai_daily_budget_usd") ?? "");
  await db
    .update(s.organisations)
    .set({
      name: String(fd.get("name") ?? "").trim() || undefined,
      areas_served: areas,
      tone_notes: String(fd.get("tone_notes") ?? ""),
      office_hours: String(fd.get("office_hours") ?? ""),
      consent_message: String(fd.get("consent_message") ?? ""),
      fees_policy: String(fd.get("fees_policy") ?? ""),
      allowed_origins: origins,
      ai_daily_budget_usd: budget ? Number(budget) : null,
      updated_at: now(),
    })
    .where(eq(s.organisations.id, sess.orgId));
  await audit(sess.orgId, `user:${sess.userId}`, "settings.updated", "organisation", sess.orgId, {});
  revalidatePath("/settings");
  return { ok: "Saved." };
}

export async function saveWhatsapp(_: FormState, fd: FormData): Promise<FormState> {
  const sess = await requireOwner();
  const db = await getDb();
  const phone_number_id = String(fd.get("phone_number_id") ?? "").trim();
  const waba_id = String(fd.get("waba_id") ?? "").trim();
  const display_number = String(fd.get("display_number") ?? "").trim();
  const token = String(fd.get("access_token") ?? "").trim();
  if (!phone_number_id) return { error: "Phone number ID is required." };
  const [existing] = await db.select().from(s.whatsappAccounts).where(eq(s.whatsappAccounts.org_id, sess.orgId));
  const values = {
    phone_number_id, waba_id, display_number, display_name: String(fd.get("display_name") ?? ""),
    ...(token ? { access_token_encrypted: encrypt(token) } : {}),
  };
  try {
    if (existing) await db.update(s.whatsappAccounts).set(values).where(eq(s.whatsappAccounts.id, existing.id));
    else await db.insert(s.whatsappAccounts).values({ org_id: sess.orgId, ...values });
  } catch {
    return { error: "That phone number ID is already connected to another organisation." };
  }
  await audit(sess.orgId, `user:${sess.userId}`, "whatsapp.connected", "whatsapp_account", phone_number_id, { token_updated: !!token });
  revalidatePath("/settings");
  return { ok: "WhatsApp connection saved. The token is stored encrypted." };
}

export async function saveAvailability(_: FormState, fd: FormData): Promise<FormState> {
  const sess = await requireSession();
  const agentId = String(fd.get("agent_id") || sess.userId);
  if (agentId !== sess.userId && sess.role !== "owner") return { error: "Only the owner can change another agent's hours." };
  const db = await getDb();
  const start = String(fd.get("start_time") ?? "09:00");
  const end = String(fd.get("end_time") ?? "17:00");
  const buffer = Number(fd.get("buffer_minutes") ?? 45);
  const max = Number(fd.get("max_per_day") ?? 4);
  const days = fd.getAll("weekday").map(Number);
  await db.delete(s.availability).where(and(eq(s.availability.org_id, sess.orgId), eq(s.availability.agent_id, agentId)));
  if (days.length) {
    await db.insert(s.availability).values(days.map((wd) => ({ org_id: sess.orgId, agent_id: agentId, weekday: wd, start_time: start, end_time: end, buffer_minutes: buffer, max_per_day: max })));
  }
  await audit(sess.orgId, `user:${sess.userId}`, "availability.updated", "user", agentId, { days, start, end, buffer, max });
  revalidatePath("/settings");
  revalidatePath("/viewings");
  return { ok: "Viewing hours saved." };
}

export async function inviteAgent(_: FormState, fd: FormData): Promise<FormState> {
  const sess = await requireOwner();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim();
  if (!email || !name) return { error: "Name and email are required." };
  const db = await getDb();
  const { hashPassword, randomToken } = await import("@/lib/crypto");
  const temp = randomToken(6);
  let [u] = await db.select().from(s.users).where(eq(s.users.email, email));
  if (!u) [u] = await db.insert(s.users).values({ email, name, password_hash: hashPassword(temp) }).returning();
  await db.insert(s.memberships).values({ user_id: u.id, org_id: sess.orgId, role: "agent" }).onConflictDoNothing();
  await db.insert(s.availability).values([1, 2, 3, 4, 5, 6].map((wd) => ({ org_id: sess.orgId, agent_id: u.id, weekday: wd, start_time: "09:00", end_time: "17:00" })));
  await audit(sess.orgId, `user:${sess.userId}`, "member.invited", "user", u.id, { email });
  revalidatePath("/settings");
  return { ok: `Added ${name}. Temporary password: ${temp} (share it privately; email invites come later).` };
}

export async function setupStep(step: number, _: FormState, fd: FormData): Promise<FormState> {
  const sess = await getSession();
  if (!sess) redirect("/login");
  const db = await getDb();
  if (step === 1) {
    await db.update(s.organisations).set({ consent_message: String(fd.get("consent_message") ?? "") }).where(eq(s.organisations.id, sess.orgId));
    const display = String(fd.get("display_number") ?? "").trim();
    if (display) await db.update(s.whatsappAccounts).set({ display_number: display }).where(eq(s.whatsappAccounts.org_id, sess.orgId));
  }
  if (step === 4) {
    await db
      .update(s.organisations)
      .set({ tone_notes: String(fd.get("tone_notes") ?? ""), fees_policy: String(fd.get("fees_policy") ?? ""), areas_served: String(fd.get("areas_served") ?? "").split(",").map((x) => x.trim()).filter(Boolean) })
      .where(eq(s.organisations.id, sess.orgId));
  }
  await db.update(s.organisations).set({ onboarding_step: step }).where(eq(s.organisations.id, sess.orgId));
  redirect(step >= 4 ? "/inbox" : `/setup?step=${step + 1}`);
}
