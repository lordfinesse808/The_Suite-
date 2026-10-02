// Simulator → signed webhook, exactly as Meta would send it.
import crypto from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";
import { buildWebhook } from "@/lib/channels/whatsapp/parse";
import { signBody } from "@/lib/channels/whatsapp/signature";
import { devOnly } from "../guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  phone: z.string(),
  name: z.string().optional(),
  phoneNumberId: z.string(),
  message: z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), text: z.string().min(1).max(2000) }),
    z.object({ type: z.literal("button_reply"), id: z.string(), title: z.string() }),
    z.object({ type: z.literal("list_reply"), id: z.string(), title: z.string() }),
    z.object({ type: z.literal("location"), lat: z.number(), lng: z.number(), name: z.string().optional() }),
    z.object({ type: z.literal("audio") }),
    z.object({ type: z.literal("image"), caption: z.string().optional() }),
  ]),
  referral: z.record(z.string(), z.string()).optional(),
});

export async function POST(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;
  const input = schema.parse(await req.json());
  const body = JSON.stringify(buildWebhook({ ...input, from: input.phone, id: `wamid.SIM${crypto.randomUUID().replace(/-/g, "")}` }));
  const url = new URL("/api/webhooks/whatsapp", req.url);
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": signBody(env().webhookSecret, body) }, body });
  return Response.json({ status: res.status });
}
