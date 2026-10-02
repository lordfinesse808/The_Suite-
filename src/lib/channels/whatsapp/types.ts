export type OutPayload =
  | { type: "text"; body: string }
  | { type: "image"; url: string; caption: string; listing_ref?: string }
  | { type: "buttons"; body: string; buttons: { id: string; title: string }[] }
  | { type: "list"; body: string; button: string; rows: { id: string; title: string; description?: string }[] }
  | { type: "location"; lat: number; lng: number; name: string; address: string }
  | { type: "template"; name: TemplateName; language: string; variables: string[]; preview: string };

export type TemplateName = "follow_up_checkin" | "viewing_reminder";

export interface Inbound {
  waMessageId: string;
  phoneNumberId: string;
  from: string; // E.164
  profileName?: string;
  type: "text" | "interactive" | "location" | "image" | "audio" | "unsupported";
  text: string;
  replyId?: string;
  location?: { lat: number; lng: number; name?: string; address?: string };
  referral?: Record<string, string>;
  timestamp: Date;
}

export interface StatusUpdate {
  waMessageId: string;
  status: string;
  pricingCategory?: string;
}

export interface SendResult {
  waMessageId: string;
  status: "sent" | "failed";
  error?: string;
}

export interface WhatsAppAdapter {
  readonly mode: "mock" | "cloud";
  send(to: string, payload: OutPayload, opts: { phoneNumberId: string; accessToken: string }): Promise<SendResult>;
}

/** Plain-text rendering of an outbound payload (stored in messages.body). */
export function payloadText(p: OutPayload): string {
  switch (p.type) {
    case "text":
      return p.body;
    case "image":
      return p.caption;
    case "buttons":
      return p.body;
    case "list":
      return p.body;
    case "location":
      return `${p.name} · ${p.address}`;
    case "template":
      return p.preview;
  }
}
