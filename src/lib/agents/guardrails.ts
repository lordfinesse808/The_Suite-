// Output checks applied to every AI reply before it is sent.
import { extractAmounts } from "./understand";

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}\u{FE0F}\u{200D}\u{2B50}\u{2705}\u{274C}]/u;

export function hasEmoji(s: string) {
  return EMOJI.test(s);
}

export function sentences(s: string): string[] {
  return s
    .replace(/\n+/g, " ")
    .split(/(?<=[.?])\s+/)
    .map((x) => x.trim().toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " "))
    .filter((x) => x.split(" ").length >= 4);
}

export function repeatedSentence(draft: string, previous: string[]): string | null {
  const prev = new Set(previous.flatMap(sentences));
  for (const s of sentences(draft)) if (prev.has(s)) return s;
  return null;
}

export function questionCount(s: string) {
  return (s.match(/\?/g) ?? []).length;
}

/** Consent checker: mentions saving/using details AND the STOP opt-out. */
export function hasConsent(s: string) {
  const t = s.toLowerCase();
  const save = /(save|keep|store|record|use)\w*\b.{0,40}(details|information|info|number|data)|(details|information|info).{0,40}(saved|kept|stored|used)/.test(t);
  const stop = /\bstop\b/.test(t);
  return save && stop;
}

export interface GuardResult {
  ok: boolean;
  problems: string[];
}

export function checkReply(text: string, ctx: { allowedAmounts: number[]; previousAi: string[]; requireConsent: boolean; maxLen?: number }): GuardResult {
  const problems: string[] = [];
  if (hasEmoji(text)) problems.push("emoji");
  if (text.includes("!")) problems.push("exclamation");
  if (questionCount(text) > 2) problems.push("too_many_questions");
  if (text.length > (ctx.maxLen ?? 1000)) problems.push("too_long");
  const allowed = new Set(ctx.allowedAmounts.map((a) => Math.round(a)));
  for (const a of extractAmounts(text)) {
    if (!allowed.has(a)) problems.push(`invented_price:${a}`);
  }
  if (/\+?\d[\d\s-]{9,}\d/.test(text.replace(/₦[\d,]+/g, ""))) problems.push("phone_number");
  if (/(guarantee|guaranteed).{0,30}(title|document|c of o)|title is (clean|genuine|perfect)/i.test(text)) problems.push("legal_promise");
  const rep = repeatedSentence(text, ctx.previousAi);
  if (rep) problems.push("repeated_sentence");
  if (ctx.requireConsent && !hasConsent(text)) problems.push("missing_consent");
  return { ok: problems.length === 0, problems };
}

/** Last-resort clean-up so a reply never violates tone rules. */
export function sanitize(text: string) {
  return text
    .replace(new RegExp(EMOJI.source, "gu"), "")
    .replace(/!+/g, ".")
    .replace(/\.\.+/g, ".")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/ {2,}/g, " ")
    .trim();
}
