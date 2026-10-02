import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { findOrCreateLead } from "@/lib/inbound";
import { audit, getListingByRef, logEvent, updateLead } from "@/lib/repo";
import { sendMessage } from "@/lib/messaging/send";
import { renderTemplate } from "@/lib/channels/whatsapp/templates";
import { toE164 } from "@/lib/format";
import { now } from "@/lib/clock";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  key: z.string().optional(),
  name: z.string().max(120).optional(),
  phone: z.string().min(7).max(20),
  email: z.string().email().optional().or(z.literal("")),
  message: z.string().max(2000).optional(),
  listing_ref: z.string().max(20).optional(),
  source: z.record(z.string(), z.string()).optional(),
  consent: z.union([z.boolean(), z.literal("on"), z.literal("true")]).optional(),
});

function cors(origin: string | null, allowed: boolean) {
  const h: Record<string, string> = { "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, x-ile-key" };
  if (origin && allowed) h["access-control-allow-origin"] = origin;
  return h;
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req.headers.get("origin"), true) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`lead:${ip}`, 10, 60_000)) return Response.json({ error: "Too many requests" }, { status: 429, headers: cors(origin, true) });

  let data: z.infer<typeof body>;
  const ct = req.headers.get("content-type") ?? "";
  try {
    const raw = ct.includes("application/json") ? await req.json() : Object.fromEntries((await req.formData()).entries());
    data = body.parse(raw);
  } catch {
    return Response.json({ error: "Invalid body: phone is required" }, { status: 400, headers: cors(origin, true) });
  }
  const key = req.headers.get("x-ile-key") ?? data.key ?? new URL(req.url).searchParams.get("key");
  if (!key) return Response.json({ error: "Missing public key" }, { status: 401, headers: cors(origin, false) });
  const db = await getDb();
  const [org] = await db.select().from(s.organisations).where(eq(s.organisations.public_key, key));
  if (!org) return Response.json({ error: "Unknown key" }, { status: 401, headers: cors(origin, false) });
  const allowed = !origin || org.allowed_origins.length === 0 || org.allowed_origins.includes(origin);
  if (!allowed) return Response.json({ error: "Origin not allowed" }, { status: 403, headers: cors(origin, false) });

  const phone = toE164(data.phone);
  const consent = data.consent === true || data.consent === "on" || data.consent === "true";
  const { lead, created } = await findOrCreateLead(org.id, phone, { name: data.name, source: { channel: "web_form", page: data.source?.page, utm: data.source } });
  const listing = data.listing_ref ? await getListingByRef(org.id, data.listing_ref) : null;
  await updateLead(org.id, lead.id, {
    name: lead.name ?? data.name ?? null,
    email: lead.email ?? (data.email || null),
    ...(listing ? { listing_id: listing.id, source: { ...lead.source, channel: "web_form", listing_ref: listing.ref_code, page: data.source?.page } } : {}),
    ...(consent && !lead.consent_at ? { consent_at: now() } : {}),
  });
  if (data.message) {
    await db.insert(s.messages).values({ org_id: org.id, lead_id: lead.id, direction: "event", type: "event", author: "system", body: `Website form: "${data.message.slice(0, 300)}"`, status: "logged", created_at: now() });
  }
  await audit(org.id, "public_api", "lead.form_submitted", "lead", lead.id, { created, consent, listing: listing?.ref_code ?? null }, lead.id);

  let whatsapp: "sent" | "skipped" | "blocked" = "skipped";
  const answerOnWhatsapp = (org.settings as { answer_web_form?: boolean }).answer_web_form !== false;
  if (consent && answerOnWhatsapp) {
    const first = data.name?.split(" ")[0] ?? "there";
    const line = listing ? `thanks for asking about the ${listing.title}. I can answer questions and book a viewing here.` : "thanks for your enquiry. I can help you find a home here.";
    const vars = [first, org.name, line];
    const r = await sendMessage(org.id, lead.id, { type: "template", name: "follow_up_checkin", language: "en", variables: vars, preview: renderTemplate("follow_up_checkin", vars) }, { author: "ai:qualifier", reason: "web_form_first_contact" });
    whatsapp = r.ok ? "sent" : "blocked";
    if (r.ok) await logEvent(org.id, lead.id, "Website form · WhatsApp conversation started with template");
  }
  const [fresh] = await db.select({ id: s.leads.id }).from(s.leads).where(and(eq(s.leads.org_id, org.id), eq(s.leads.id, lead.id)));
  return Response.json({ ok: true, lead_id: fresh.id, created, whatsapp }, { status: created ? 201 : 200, headers: cors(origin, true) });
}
