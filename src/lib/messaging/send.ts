// The one function every outbound message goes through. It enforces:
// opt-out, the WhatsApp 24-hour customer-service window, logging and audit.
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import * as s from "../db/schema";
import { now, DAY } from "../clock";
import { audit, getLead } from "../repo";
import { whatsapp } from "../channels/whatsapp/adapters";
import { payloadText, type OutPayload } from "../channels/whatsapp/types";
import { decrypt } from "../crypto";
import { env } from "../env";

export interface SendOpts {
  /** Who is sending: ai:<agent> | user:<id> | system */
  author: string;
  reason: string;
  approvedBy?: string;
  /** Only the single STOP confirmation may go to an opted-out lead. */
  allowOptedOut?: boolean;
}

export type SendOutcome =
  | { ok: true; messageId: string; waMessageId: string }
  | { ok: false; blocked: "opted_out" | "outside_24h_window" | "no_whatsapp_account" | "send_failed"; error?: string };

export function insideWindow(lastInboundAt: Date | null | undefined, at: Date = now()): boolean {
  return !!lastInboundAt && at.getTime() - new Date(lastInboundAt).getTime() < DAY;
}

export async function sendMessage(orgId: string, leadId: string, payload: OutPayload, opts: SendOpts): Promise<SendOutcome> {
  const db = await getDb();
  const lead = await getLead(orgId, leadId);
  if (!lead) throw new Error("lead not found");

  const block = async (blocked: Exclude<SendOutcome, { ok: true }>["blocked"], error?: string): Promise<SendOutcome> => {
    await audit(orgId, opts.author, "message.blocked", "lead", leadId, { blocked, reason: opts.reason, type: payload.type }, leadId);
    return { ok: false, blocked, error };
  };

  if (lead.opted_out_at && !opts.allowOptedOut) return block("opted_out");
  if (payload.type !== "template" && !insideWindow(lead.last_inbound_at)) return block("outside_24h_window");

  const [acct] = await db.select().from(s.whatsappAccounts).where(and(eq(s.whatsappAccounts.org_id, orgId)));
  if (!acct && !env().MOCK_WHATSAPP) return block("no_whatsapp_account");
  const token = acct?.access_token_encrypted ? decrypt(acct.access_token_encrypted) : env().WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = acct?.phone_number_id ?? env().WHATSAPP_PHONE_NUMBER_ID;

  const result = await whatsapp().send(lead.phone, payload, { phoneNumberId, accessToken: token });
  const t = now();
  const [msg] = await db
    .insert(s.messages)
    .values({
      org_id: orgId, lead_id: leadId, direction: "out", type: payload.type, body: payloadText(payload),
      payload: { ...payload, reason: opts.reason, approved_by: opts.approvedBy ?? null },
      author: opts.author, wa_message_id: result.waMessageId,
      status: result.status === "sent" ? (whatsapp().mode === "mock" ? "delivered" : "sent") : "failed",
      created_at: t,
    })
    .returning();
  if (result.status === "failed") return block("send_failed", result.error);
  await db.update(s.leads).set({ last_outbound_at: t }).where(eq(s.leads.id, leadId));
  await audit(orgId, opts.author, "message.sent", "message", msg.id, { reason: opts.reason, type: payload.type, approved_by: opts.approvedBy ?? null }, leadId);
  return { ok: true, messageId: msg.id, waMessageId: result.waMessageId };
}
