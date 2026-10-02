import crypto from "node:crypto";
import type { OutPayload, SendResult, WhatsAppAdapter } from "./types";
import { TEMPLATES } from "./templates";
import { env } from "../../env";

/** Mock: nothing leaves the machine. Messages are stored by sendMessage() and shown in the simulator. */
export class MockWhatsApp implements WhatsAppAdapter {
  readonly mode = "mock" as const;
  async send(): Promise<SendResult> {
    return { waMessageId: `mock.${crypto.randomUUID()}`, status: "sent" };
  }
}

/** Real Meta WhatsApp Cloud API. */
export class CloudWhatsApp implements WhatsAppAdapter {
  readonly mode = "cloud" as const;
  constructor(private fetchImpl: typeof fetch = fetch) {}

  toGraph(to: string, p: OutPayload): Record<string, unknown> {
    const base = { messaging_product: "whatsapp", recipient_type: "individual", to: to.replace(/\D/g, "") };
    switch (p.type) {
      case "text":
        return { ...base, type: "text", text: { body: p.body.slice(0, 4096), preview_url: true } };
      case "image":
        return { ...base, type: "image", image: { link: p.url, caption: p.caption.slice(0, 1024) } };
      case "buttons":
        return {
          ...base, type: "interactive",
          interactive: {
            type: "button", body: { text: p.body.slice(0, 1024) },
            action: { buttons: p.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })) },
          },
        };
      case "list":
        return {
          ...base, type: "interactive",
          interactive: {
            type: "list", body: { text: p.body.slice(0, 4096) },
            action: {
              button: p.button.slice(0, 20),
              sections: [{ title: "Options", rows: p.rows.slice(0, 10).map((r) => ({ id: r.id.slice(0, 200), title: r.title.slice(0, 24), description: r.description?.slice(0, 72) })) }],
            },
          },
        };
      case "location":
        return { ...base, type: "location", location: { latitude: p.lat, longitude: p.lng, name: p.name, address: p.address } };
      case "template":
        return {
          ...base, type: "template",
          template: {
            name: p.name, language: { code: p.language },
            components: TEMPLATES[p.name] ? [{ type: "body", parameters: p.variables.map((t) => ({ type: "text", text: t })) }] : [],
          },
        };
    }
  }

  async send(to: string, payload: OutPayload, opts: { phoneNumberId: string; accessToken: string }): Promise<SendResult> {
    const url = `https://graph.facebook.com/${env().WHATSAPP_GRAPH_VERSION}/${opts.phoneNumberId}/messages`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { authorization: `Bearer ${opts.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(this.toGraph(to, payload)),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message: string } };
    if (!res.ok || !json.messages?.[0]?.id) {
      return { waMessageId: `failed.${crypto.randomUUID()}`, status: "failed", error: json.error?.message ?? `HTTP ${res.status}` };
    }
    return { waMessageId: json.messages[0].id, status: "sent" };
  }
}

let adapter: WhatsAppAdapter | null = null;
export function whatsapp(): WhatsAppAdapter {
  if (!adapter || process.env.NODE_ENV === "test") adapter = env().MOCK_WHATSAPP ? new MockWhatsApp() : new CloudWhatsApp();
  return adapter;
}
