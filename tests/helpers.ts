import crypto from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { seed, DEMO } from "@/lib/db/seed";
import * as s from "@/lib/db/schema";
import { buildWebhook } from "@/lib/channels/whatsapp/parse";
import { signBody } from "@/lib/channels/whatsapp/signature";
import { receiveWebhook } from "@/lib/webhook";
import { drainLead } from "@/lib/jobs/queue";
import { env } from "@/lib/env";

export async function setup() {
  const db = await getDb();
  const ids = await seed(db);
  return { db, ...ids };
}

export type Send = { text: string } | { reply: string; title?: string } | { audio: true } | { location: { lat: number; lng: number } };

/** Send one simulated WhatsApp message and return the AI's outbound messages. */
export async function chat(phone: string, input: Send, opts: { name?: string; phoneNumberId?: string } = {}) {
  const db = await getDb();
  const message =
    "text" in input ? { type: "text" as const, text: input.text }
    : "reply" in input ? { type: input.reply.startsWith("slot:") || input.reply.startsWith("act:") || input.reply.startsWith("rem:") ? ("button_reply" as const) : ("list_reply" as const), id: input.reply, title: input.title ?? input.reply }
    : "audio" in input ? { type: "audio" as const }
    : { type: "location" as const, lat: input.location.lat, lng: input.location.lng };
  const body = JSON.stringify(buildWebhook({ phoneNumberId: opts.phoneNumberId ?? DEMO.phoneNumberId, from: phone, name: opts.name, id: `wamid.${crypto.randomUUID()}`, message }));
  const res = await receiveWebhook(body, signBody(env().webhookSecret, body));
  if (res.status !== 200) throw new Error(`webhook ${res.status}`);
  const stored = res.stored[0];
  if (!stored) return { lead: null, out: [] as s.Message[] };
  const [inMsg] = await db.select().from(s.messages).where(eq(s.messages.id, stored.messageId));
  await drainLead(stored.leadId);
  const out = await db.select().from(s.messages).where(and(eq(s.messages.lead_id, stored.leadId), eq(s.messages.direction, "out"), gt(s.messages.seq, inMsg.seq))).orderBy(s.messages.seq);
  const [lead] = await db.select().from(s.leads).where(eq(s.leads.id, stored.leadId));
  return { lead, out };
}
