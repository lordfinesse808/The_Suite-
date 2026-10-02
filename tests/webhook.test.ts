import crypto from "node:crypto";
import { beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { DEMO } from "@/lib/db/seed";
import { buildWebhook, parseWebhook } from "@/lib/channels/whatsapp/parse";
import { signBody, verifySignature } from "@/lib/channels/whatsapp/signature";
import { CloudWhatsApp } from "@/lib/channels/whatsapp/adapters";
import { receiveWebhook } from "@/lib/webhook";
import { env } from "@/lib/env";
import { setup } from "./helpers";

let db: Awaited<ReturnType<typeof setup>>["db"];
beforeAll(async () => {
  ({ db } = await setup());
});

const body = (id = `wamid.${crypto.randomUUID()}`) =>
  JSON.stringify(buildWebhook({ phoneNumberId: DEMO.phoneNumberId, from: "2348039990000", name: "Test", id, message: { type: "text", text: "Hello" } }));

describe("webhook", () => {
  test("signature check", () => {
    const b = body();
    expect(verifySignature("secret", b, signBody("secret", b))).toBe(true);
    expect(verifySignature("secret", b, signBody("other", b))).toBe(false);
    expect(verifySignature("secret", b, null)).toBe(false);
  });
  test("rejects unsigned webhooks", async () => {
    expect((await receiveWebhook(body(), "sha256=bad")).status).toBe(401);
  });
  test("stores once per WhatsApp message id (idempotent)", async () => {
    const id = `wamid.${crypto.randomUUID()}`;
    const b = body(id);
    const first = await receiveWebhook(b, signBody(env().webhookSecret, b));
    const again = await receiveWebhook(b, signBody(env().webhookSecret, b));
    expect(first.stored).toHaveLength(1);
    expect(again.stored).toHaveLength(0);
    const rows = await db.select().from(s.messages).where(eq(s.messages.wa_message_id, id));
    expect(rows).toHaveLength(1);
  });
  test("parses interactive, location and audio", () => {
    const parsed = parseWebhook(buildWebhook({ phoneNumberId: "P", from: "2348030000000", id: "1", message: { type: "button_reply", id: "slot:1", title: "Sat" } }));
    expect(parsed.messages[0]).toMatchObject({ type: "interactive", replyId: "slot:1", from: "+2348030000000" });
    expect(parseWebhook(buildWebhook({ phoneNumberId: "P", from: "1", id: "2", message: { type: "location", lat: 6.4, lng: 3.4 } })).messages[0].location).toEqual({ lat: 6.4, lng: 3.4, name: undefined, address: undefined });
    expect(parseWebhook(buildWebhook({ phoneNumberId: "P", from: "1", id: "3", message: { type: "audio" } })).messages[0].type).toBe("audio");
  });
  test("Cloud API payloads respect WhatsApp limits", () => {
    const g = new CloudWhatsApp().toGraph("+2348030000000", { type: "buttons", body: "Pick", buttons: [1, 2, 3, 4].map((i) => ({ id: `b${i}`, title: "A very long button title here" })) }) as { interactive: { action: { buttons: { reply: { title: string } }[] } } };
    expect(g.interactive.action.buttons).toHaveLength(3);
    expect(g.interactive.action.buttons[0].reply.title.length).toBeLessThanOrEqual(20);
  });
});
