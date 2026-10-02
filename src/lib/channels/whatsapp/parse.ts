import { z } from "zod";
import type { Inbound, StatusUpdate } from "./types";
import { toE164 } from "../../format";

// Minimal schema for the WhatsApp Cloud API webhook (messages field).
const msgSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string().optional(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  interactive: z
    .object({
      type: z.string(),
      button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
      list_reply: z.object({ id: z.string(), title: z.string(), description: z.string().optional() }).optional(),
    })
    .optional(),
  button: z.object({ payload: z.string().optional(), text: z.string() }).optional(),
  location: z.object({ latitude: z.number(), longitude: z.number(), name: z.string().optional(), address: z.string().optional() }).optional(),
  image: z.object({ id: z.string().optional(), caption: z.string().optional() }).optional(),
  referral: z.record(z.string(), z.unknown()).optional(),
});

export const webhookSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string().optional(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            messaging_product: z.string().optional(),
            metadata: z.object({ phone_number_id: z.string(), display_phone_number: z.string().optional() }),
            contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).optional() })).optional(),
            messages: z.array(msgSchema).optional(),
            statuses: z
              .array(z.object({ id: z.string(), status: z.string(), pricing: z.object({ category: z.string().optional() }).optional() }))
              .optional(),
          }),
        }),
      ),
    }),
  ),
});

export type WebhookBody = z.infer<typeof webhookSchema>;

export function parseWebhook(body: unknown): { messages: Inbound[]; statuses: StatusUpdate[] } {
  const parsed = webhookSchema.parse(body);
  const messages: Inbound[] = [];
  const statuses: StatusUpdate[] = [];
  for (const entry of parsed.entry) {
    for (const ch of entry.changes) {
      if (ch.field !== "messages") continue;
      const v = ch.value;
      const phoneNumberId = v.metadata.phone_number_id;
      for (const st of v.statuses ?? []) statuses.push({ waMessageId: st.id, status: st.status, pricingCategory: st.pricing?.category });
      for (const m of v.messages ?? []) {
        const contact = v.contacts?.find((c) => c.wa_id === m.from);
        const base = {
          waMessageId: m.id,
          phoneNumberId,
          from: toE164(m.from),
          profileName: contact?.profile?.name,
          timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
          referral: m.referral ? Object.fromEntries(Object.entries(m.referral).map(([k, val]) => [k, String(val)])) : undefined,
        };
        switch (m.type) {
          case "text":
            messages.push({ ...base, type: "text", text: m.text?.body ?? "" });
            break;
          case "interactive": {
            const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
            messages.push({ ...base, type: "interactive", text: r?.title ?? "", replyId: r?.id });
            break;
          }
          case "button":
            messages.push({ ...base, type: "interactive", text: m.button?.text ?? "", replyId: m.button?.payload });
            break;
          case "location":
            messages.push({
              ...base, type: "location", text: m.location?.name ?? "Shared a location",
              location: m.location ? { lat: m.location.latitude, lng: m.location.longitude, name: m.location.name, address: m.location.address } : undefined,
            });
            break;
          case "image":
            messages.push({ ...base, type: "image", text: m.image?.caption ?? "" });
            break;
          case "audio":
            messages.push({ ...base, type: "audio", text: "" });
            break;
          default:
            messages.push({ ...base, type: "unsupported", text: "" });
        }
      }
    }
  }
  return { messages, statuses };
}

/** Build a webhook body the way Meta would (used by the simulator and tests). */
export function buildWebhook(opts: {
  phoneNumberId: string;
  from: string;
  name?: string;
  id: string;
  message:
    | { type: "text"; text: string }
    | { type: "button_reply" | "list_reply"; id: string; title: string }
    | { type: "location"; lat: number; lng: number; name?: string }
    | { type: "audio" }
    | { type: "image"; caption?: string };
  referral?: Record<string, string>;
  timestamp?: Date;
}): WebhookBody {
  const wa = opts.from.replace(/\D/g, "");
  const m = opts.message;
  const ts = String(Math.floor((opts.timestamp ?? new Date()).getTime() / 1000));
  const base = { from: wa, id: opts.id, timestamp: ts, ...(opts.referral ? { referral: opts.referral } : {}) };
  let msg: z.infer<typeof msgSchema>;
  if (m.type === "text") msg = { ...base, type: "text", text: { body: m.text } };
  else if (m.type === "button_reply") msg = { ...base, type: "interactive", interactive: { type: "button_reply", button_reply: { id: m.id, title: m.title } } };
  else if (m.type === "list_reply") msg = { ...base, type: "interactive", interactive: { type: "list_reply", list_reply: { id: m.id, title: m.title } } };
  else if (m.type === "location") msg = { ...base, type: "location", location: { latitude: m.lat, longitude: m.lng, name: m.name } };
  else if (m.type === "image") msg = { ...base, type: "image", image: { id: "mock-media", caption: m.caption } };
  else msg = { ...base, type: "audio" };
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "MOCK_WABA",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { phone_number_id: opts.phoneNumberId, display_phone_number: "2348035550142" },
          contacts: [{ wa_id: wa, profile: { name: opts.name ?? "" } }],
          messages: [msg],
        },
      }],
    }],
  };
}
