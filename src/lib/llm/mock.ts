// LLM_MODE=mock: deterministic understanding (rules) and replies composed from
// fixtures/llm/phrases.json. Zero cost, works offline, varied per conversation.
import phrases from "../../../fixtures/llm/phrases.json";
import { understandRules } from "../agents/understand";
import { sentences } from "../agents/guardrails";
import type { LLM, Move, RespondInput, UnderstandInput, ReplyPlan } from "./types";

type Book = Record<string, string[]>;
const BOOKS = phrases as unknown as Record<"en-NG" | "pcm", Book>;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function fill(t: string, v: Record<string, string | number | undefined | null>) {
  return t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
}

export function composeReply(plan: ReplyPlan, opts: { previousAi: string[]; attempt: number; seed: string }): string {
  const book = BOOKS[plan.language] ?? BOOKS["en-NG"];
  const used = new Set(opts.previousAi.flatMap(sentences));
  const orgPoss = plan.orgName.endsWith("s") ? `${plan.orgName}'` : `${plan.orgName}'s`;
  const vars = { org: plan.orgName, org_poss: orgPoss, name: plan.leadName?.split(" ")[0] ?? "", daypart: plan.daypart };
  const out: string[] = [];
  const pick = (key: string, extra: Record<string, string | number | undefined> = {}) => {
    const list = book[key] ?? BOOKS["en-NG"][key];
    if (!list?.length) return;
    const start = hash(`${opts.seed}:${key}`) + opts.attempt;
    for (let i = 0; i < list.length; i++) {
      const s = fill(list[(start + i) % list.length], { ...vars, ...extra });
      if (!sentences(s).some((x) => used.has(x)) || i === list.length - 1) {
        out.push(s);
        sentences(s).forEach((x) => used.add(x));
        return;
      }
    }
  };
  const askKey = (f: string, purpose?: string) => (f === "budget" ? (purpose ? `ask_budget_${purpose}` : "ask_budget") : `ask_${f}`);

  for (const m of plan.moves as Move[]) {
    switch (m.k) {
      case "greet": pick(m.named && plan.leadName ? "greet_named" : "greet"); break;
      case "intro": pick("intro"); break;
      case "consent": pick("consent"); break;
      case "ack_listing": pick(m.available ? "ack_listing_available" : "ack_listing_taken", { title: m.title }); break;
      case "ack_needs": pick("ack_needs", { summary: m.summary }); break;
      case "ack_name": pick("ack_name", { name: m.name }); break;
      case "answer":
        if (m.topic === "unknown") pick("answer_unknown");
        else pick(`answer_${m.topic}`, { title: m.title, price: m.value, value: m.value, area: m.area, city: m.city });
        break;
      case "ask": {
        const qs = m.fields.slice(0, 2);
        const parts: string[] = [];
        for (const f of qs) {
          const before = out.length;
          pick(askKey(f, m.purpose));
          if (out.length > before) parts.push(out.pop()!);
        }
        if (parts.length === 2 && plan.language === "en-NG") parts[1] = "And " + parts[1][0].toLowerCase() + parts[1].slice(1);
        out.push(parts.join(" "));
        break;
      }
      case "matches_intro":
        pick(m.variant === "cheaper" ? "cheaper_intro" : m.variant === "more" ? "more_matches" : "matches_intro", { count: m.count, summary: m.summary });
        break;
      case "matches_outro": pick("matches_outro"); break;
      case "no_match":
        pick("no_match", { summary: m.summary });
        pick(m.nearest ? "no_match_nearest" : "no_match_watch");
        break;
      case "pick_prompt": pick("pick_prompt"); break;
      case "offer_slots": pick("offer_slots", { title: m.title }); pick("offer_slots_q"); break;
      case "no_slots": pick("no_slots"); break;
      case "booked": pick("booked", { when: m.when, agent: m.agent, title: m.title }); pick("booked_location"); break;
      case "reminder": pick(m.hours === 24 ? "reminder_24" : "reminder_2", { when: m.when, agent: m.agent, title: m.title }); pick("reminder_confirm"); break;
      case "reschedule": pick("reschedule"); break;
      case "cancelled": pick("cancelled", { when: m.when }); pick("cancelled_more"); break;
      case "no_viewing": pick("no_viewing"); break;
      case "opt_out": pick("opt_out"); break;
      case "opt_in": pick("opt_in"); break;
      case "handoff_human": pick("handoff_human", { agent: m.agent }); break;
      case "other_language": pick("other_language", { language: m.language }); break;
      case "voice_note": pick("voice_note"); break;
      case "image_received": pick("image_received"); break;
      case "location_received": pick("location_received"); break;
      case "scam": pick("scam"); break;
      case "holding": pick("holding"); break;
      case "thanks": pick("thanks"); pick("thanks_more"); break;
      case "decline": pick("decline"); pick("decline_more"); break;
      case "smalltalk": pick("smalltalk"); break;
      case "followup":
        if (m.title && m.price) pick("followup_silent", { title: m.title, price: m.price });
        else pick("followup_silent_nomatch", { summary: m.summary });
        break;
    }
  }
  return out.filter(Boolean).join(" ").replace(/\s+/g, " ").replace(/ ,/g, ",").trim();
}

export class MockLLM implements LLM {
  readonly mode = "mock" as const;
  async understand(i: UnderstandInput) {
    return understandRules(i.text, { ref: i.ref, replyId: i.replyId, lastOffer: i.lastOffer });
  }
  async respond(i: RespondInput) {
    return composeReply(i.plan, { previousAi: i.previousAi, attempt: i.attempt, seed: i.seed });
  }
}
