import { env } from "./env";
import { verifySignature } from "./channels/whatsapp/signature";
import { parseWebhook } from "./channels/whatsapp/parse";
import { storeInbound, applyStatus, type Stored } from "./inbound";

export type WebhookResult = { status: 200 | 400 | 401; stored: Stored[] };

/** Verify, parse and store. Processing happens afterwards (Next.js after() or the job tick). */
export async function receiveWebhook(rawBody: string, signature: string | null): Promise<WebhookResult> {
  if (!verifySignature(env().webhookSecret, rawBody, signature)) return { status: 401, stored: [] };
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { status: 400, stored: [] };
  }
  let parsed;
  try {
    parsed = parseWebhook(body);
  } catch {
    // Unknown shapes are acknowledged so Meta does not retry forever.
    return { status: 200, stored: [] };
  }
  const stored: Stored[] = [];
  for (const m of parsed.messages) {
    const r = await storeInbound(m);
    if (r) stored.push(r);
  }
  for (const st of parsed.statuses) await applyStatus(st);
  return { status: 200, stored };
}
