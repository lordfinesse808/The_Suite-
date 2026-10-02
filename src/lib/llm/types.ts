import type { Understanding } from "../agents/understand";
import type { Needs } from "../db/schema";

export type AgentName = "qualifier" | "matchmaker" | "scheduler" | "followup" | "system";
export type AskField = "purpose" | "area" | "budget" | "type_bedrooms" | "move_in" | "nights" | "name";

/** What a reply must say. Code decides the facts; the model decides the words. */
export type Move =
  | { k: "greet"; named?: boolean }
  | { k: "intro" }
  | { k: "consent" }
  | { k: "ack_listing"; title: string; available: boolean }
  | { k: "ack_needs"; summary: string }
  | { k: "ack_name"; name: string }
  | { k: "answer"; topic: "price" | "service_charge" | "location" | "documents" | "fees" | "features" | "payment_plan" | "unknown"; title?: string; value?: string; area?: string; city?: string }
  | { k: "ask"; fields: AskField[]; purpose?: Needs["purpose"] }
  | { k: "matches_intro"; count: number; summary: string; variant?: "normal" | "cheaper" | "more" }
  | { k: "matches_outro" }
  | { k: "no_match"; summary: string; nearest: boolean }
  | { k: "pick_prompt" }
  | { k: "offer_slots"; title: string }
  | { k: "no_slots" }
  | { k: "booked"; when: string; agent: string; title: string }
  | { k: "reminder"; hours: 24 | 2; when: string; agent: string; title: string }
  | { k: "reschedule" }
  | { k: "cancelled"; when: string }
  | { k: "no_viewing" }
  | { k: "opt_out" }
  | { k: "opt_in" }
  | { k: "handoff_human"; agent: string }
  | { k: "other_language"; language: string }
  | { k: "voice_note" }
  | { k: "image_received" }
  | { k: "location_received" }
  | { k: "scam" }
  | { k: "holding" }
  | { k: "thanks" }
  | { k: "decline" }
  | { k: "smalltalk" }
  | { k: "followup"; title?: string; price?: string; summary?: string };

export interface ReplyPlan {
  agent: AgentName;
  language: "en-NG" | "pcm";
  orgName: string;
  leadName?: string | null;
  daypart: "morning" | "afternoon" | "evening";
  moves: Move[];
  /** Every naira figure the reply may contain (listing data + the lead's own budget). */
  allowedAmounts: number[];
  requireConsent: boolean;
  /** The lead's latest message (live mode answers it first). */
  leadMessage?: string;
  orgProfile: { tone: string; feesPolicy: string; areas: string[]; officeHours: string };
}

export interface HistoryItem {
  role: "lead" | "ai" | "human";
  text: string;
}

export interface UnderstandInput {
  orgId: string;
  leadId: string;
  text: string;
  replyId?: string;
  needs: Needs;
  history: HistoryItem[];
  lastOffer: "slots" | "listings" | null;
  ref: Date;
}

export interface RespondInput {
  orgId: string;
  leadId: string;
  plan: ReplyPlan;
  history: HistoryItem[];
  previousAi: string[];
  /** 0 on first attempt; 1 when regenerating after a failed check. */
  attempt: number;
  seed: string;
}

export interface LLM {
  readonly mode: "mock" | "live";
  understand(i: UnderstandInput): Promise<Understanding>;
  respond(i: RespondInput): Promise<string>;
}

export class BudgetExceededError extends Error {
  constructor(public spent: number, public cap: number) {
    super(`AI daily budget reached ($${spent.toFixed(4)} of $${cap.toFixed(2)})`);
  }
}
