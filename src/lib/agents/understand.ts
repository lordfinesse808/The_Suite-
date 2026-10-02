// The "understand" step: structured extraction from one lead message.
// This rule-based extractor is the mock-mode LLM and the live-mode fallback.
// Live mode asks Claude for the same Understanding shape (src/lib/llm/anthropic.ts).
import { z } from "zod";
import { extractAreas } from "./areas";
import type { Needs, Purpose, PricePeriod } from "../db/schema";

export const understandingSchema = z.object({
  language: z.enum(["en-NG", "pcm", "other"]),
  other_language: z.string().optional(),
  intent: z.enum([
    "greeting", "provide_info", "question", "ask_options", "pick_listing", "book_viewing", "pick_slot",
    "reschedule", "cancel_viewing", "request_human", "opt_out", "opt_in", "refine", "thanks", "decline", "other",
  ]),
  needs: z.object({
    purpose: z.enum(["rent", "sale", "shortlet"]).optional(),
    budget_min: z.number().optional(),
    budget_max: z.number().optional(),
    period: z.enum(["year", "month", "night", "total"]).optional(),
    areas: z.array(z.string()).optional(),
    property_type: z.string().optional(),
    bedrooms_min: z.number().optional(),
    move_in_by: z.string().optional(),
    move_in_text: z.string().optional(),
    financing: z.enum(["cash", "mortgage", "instalments"]).optional(),
    nights: z.number().optional(),
    must_haves: z.array(z.string()).optional(),
  }),
  contact: z.object({ name: z.string().optional(), email: z.string().optional() }),
  listing_ref: z.string().optional(),
  questions: z.array(z.enum(["availability", "price", "service_charge", "location", "documents", "fees", "features", "payment_plan", "other"])),
  refine: z.enum(["cheaper", "bigger", "closer", "different_area"]).optional(),
  pick_rank: z.number().optional(),
  pick_area: z.string().optional(),
  slot_rank: z.number().optional(),
  wants_weekend: z.boolean().optional(),
  scam_signals: z.array(z.string()),
  injection: z.boolean(),
});

export type Understanding = z.infer<typeof understandingSchema>;

const PIDGIN = [
  "abeg", "dey", "wetin", "una", "wahala", "sef", "abi", "comot", "oga", "sabi", "pikin", "wan", "dem", "e don",
  "how far", "no be", "go fit", "make i", "i fit", "na im", "na so", "nawa", "shey", "biko", "jare", "kpatakpata", "small small",
  "wey", "dis", "dat", "fit pay", "my money na", "e get", "e reach", "no wahala", "abeg o", "o jare", "una get",
];
const PIDGIN_STRONG = ["abeg", "wetin", "una", "wahala", "dey", "wey", "na im", "make i", "e get", "i fit", "my money na"];

const YORUBA = ["bawo", "e kaaro", "e kaasan", "e kaale", "ẹ kú", "e ku", "jọwọ", "jowo", "mo fe", "mo fẹ", "ile", "ilé", "owo", "ṣe", "se o wa", "ọmọ", "mo n wa", "ẹ jọ", "e jo", "nibo", "elo ni"];
const HAUSA = ["sannu", "ina kwana", "yaya", "don allah", "gida", "ina son", "nawa ne", "na gode", "ina neman", "kudin", "wurin"];
const IGBO = ["kedu", "biko", "ndewo", "ụlọ", "ulo", "achọrọ m", "achoro m", "nnoo", "ego ole", "ebee", "daalu", "imeela"];

function count(t: string, words: string[]) {
  return words.filter((w) => new RegExp(`(^|[^a-zà-ỹ])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-zà-ỹ]|$)`, "i").test(t)).length;
}

export function detectLanguage(text: string): { language: "en-NG" | "pcm" | "other"; other?: string } {
  const t = text.toLowerCase();
  const yo = count(t, YORUBA) + (/[ẹọṣ]/.test(t) ? 2 : 0);
  const ha = count(t, HAUSA);
  const ig = count(t, IGBO) + (/[ụịọ]/.test(t) && !/[ẹṣ]/.test(t) ? 1 : 0);
  const pcmHits = count(t, PIDGIN);
  const pcmStrong = count(t, PIDGIN_STRONG);
  const best = Math.max(yo, ha, ig);
  if (best >= 2 && best > pcmHits) {
    return { language: "other", other: yo === best ? "Yoruba" : ha === best ? "Hausa" : "Igbo" };
  }
  if (pcmStrong >= 1 || pcmHits >= 2) return { language: "pcm" };
  return { language: "en-NG" };
}

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** Money amounts mentioned in text, in naira. */
export function extractAmounts(text: string): number[] {
  const t = text.toLowerCase().replace(/,(?=\d{3})/g, "");
  const out: number[] = [];
  const re = /(₦|ngn|n)?\s?(\d+(?:\.\d+)?)\s?(million|mill|mil|m|k|thousand|bn|billion|b)?(?![a-z0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const [, cur, numS, unit] = m;
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 12);
    if (/^\s?-?\s?(bed|bedroom|br|bdr|room|night|nite|day|week|month|year|yr|min|sqm|plot|storey|unit|people|person)/.test(after) && !unit) continue;
    let n = Number(numS);
    if (!Number.isFinite(n)) continue;
    if (unit === "m" || unit === "mil" || unit === "mill" || unit === "million") n *= 1_000_000;
    else if (unit === "k" || unit === "thousand") n *= 1_000;
    else if (unit === "b" || unit === "bn" || unit === "billion") n *= 1_000_000_000;
    else if (!cur && n < 50_000) continue; // bare small numbers are not money
    if (n < 10_000) continue;
    out.push(Math.round(n));
  }
  return out;
}

function extractPeriod(t: string): PricePeriod | undefined {
  if (/(per|a|\/|each)\s?(night|nite)|nightly|per day|a day/.test(t)) return "night";
  if (/(per|a|\/)\s?(month|mo)\b|monthly/.test(t)) return "month";
  if (/(per|a|\/)\s?(year|yr|annum)|yearly|annual|p\.?a\.?\b|every year/.test(t)) return "year";
  return undefined;
}

function extractPurpose(t: string): Purpose | undefined {
  if (/short[\s-]?let|shortlet|airbnb|per night|nights?\b|weekend stay|vacation|holiday/.test(t)) return "shortlet";
  if (/\b(buy|buying|purchase|for sale|own|ownership|invest|off[\s-]?plan|land|plot|mortgage)\b|buy am/.test(t)) return "sale";
  if (/\b(rent|renting|rental|lease|let|tenant|yearly|per annum|to let)\b|rent am/.test(t)) return "rent";
  return undefined;
}

const TYPES: [RegExp, string][] = [
  [/mini[\s-]?flat/, "mini flat"],
  [/self[\s-]?con(tain)?|studio|room and parlou?r/, "self contain"],
  [/semi[\s-]?detached/, "duplex"],
  [/duplex|detached house|maisonette/, "duplex"],
  [/terrace|terraced/, "terrace"],
  [/bungalow/, "bungalow"],
  [/penthouse/, "penthouse"],
  [/\b(land|plot|plots|acre|sqm)\b/, "land"],
  [/\b(flat|apartment|apt)\b/, "flat"],
  [/\bhouse\b/, "house"],
];

function extractBedrooms(t: string): number | undefined {
  const m = t.match(/(\d+|one|two|three|four|five|six)\s?-?\s?(bed|bedroom|bdrm|bdr|br\b|room)/);
  if (m) return WORD_NUM[m[1]] ?? Number(m[1]);
  if (/mini[\s-]?flat|self[\s-]?con|studio|1 room/.test(t)) return 1;
  return undefined;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MON_SHORT = MONTHS.map((m) => m.slice(0, 3));

export function extractMoveIn(t: string, ref: Date): { iso?: string; text?: string } {
  const endOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  const plusDays = (d: number) => new Date(ref.getTime() + d * 86400_000).toISOString().slice(0, 10);
  if (/\b(asap|immediately|right away|urgent|urgently|now now|this week|sharp sharp)\b/.test(t)) return { iso: plusDays(14), text: "As soon as possible" };
  if (/next week/.test(t)) return { iso: plusDays(10), text: "Next week" };
  const inN = t.match(/in (\d+|one|two|three|four|six) (week|weeks|month|months)/);
  if (inN) {
    const n = WORD_NUM[inN[1]] ?? Number(inN[1]);
    return { iso: plusDays(inN[2].startsWith("week") ? n * 7 : n * 30), text: inN[0].replace(/^in /, "In ") };
  }
  if (/next month/.test(t)) return { iso: endOfMonth(ref.getUTCFullYear(), ref.getUTCMonth() + 1), text: "Next month" };
  if (/next year|early next year/.test(t)) return { iso: endOfMonth(ref.getUTCFullYear() + 1, 2), text: "Early next year" };
  for (let i = 0; i < 12; i++) {
    const re = new RegExp(`\\b(${MONTHS[i]}|${MON_SHORT[i]})\\b`);
    if (re.test(t) && !(MON_SHORT[i] === "may" && !/\b(by|in|from|before|end of) may\b/.test(t))) {
      const y = i < ref.getUTCMonth() ? ref.getUTCFullYear() + 1 : ref.getUTCFullYear();
      return { iso: endOfMonth(y, i), text: MONTHS[i][0].toUpperCase() + MONTHS[i].slice(1) };
    }
  }
  if (/\b(not sure|no rush|just looking|later|no timeline)\b/.test(t)) return { text: "Not decided" };
  return {};
}

const FEATURES: [RegExp, string][] = [
  [/\bbq\b|boys'? quarters?/, "BQ"],
  [/24\s?(h|hr|hrs|hours?)\s?(power|light|electricity)|constant (light|power)|steady light|light dey|uninterrupted power/, "24h power"],
  [/pool|swimming/, "pool"],
  [/\bgym\b/, "gym"],
  [/parking|car park|garage/, "parking"],
  [/serviced/, "serviced"],
  [/furnished/, "furnished"],
  [/security|gated/, "security"],
  [/fitted kitchen/, "fitted kitchen"],
  [/wifi|wi-fi|internet/, "wifi"],
  [/water|borehole/, "water"],
  [/\b(lift|elevator)\b/, "lift"],
  [/study/, "study"],
];

const NAME_STOP = new Set(["interested", "looking", "a", "an", "the", "in", "on", "here", "fine", "good", "ok", "okay", "not", "just", "from", "very", "abroad", "back", "ready", "available", "sure", "moving", "planning", "currently", "still"]);

function extractName(text: string): string | undefined {
  const m =
    text.match(/\bmy name is ([A-Za-z][a-zA-Z'-]+(?: [A-Z][a-zA-Z'-]+)?)/i) ??
    text.match(/\b(?:[Tt]his is|[Ii] am|[Ii]'m|[Ii]m|[Cc]all me|[Nn]a) ([A-Z][a-zA-Z'-]+(?: [A-Z][a-zA-Z'-]+)?)\b(?! (?:interested|looking))/) ??
    text.match(/\b([A-Z][a-zA-Z'-]+) (?:be|na) my name/i) ??
    text.match(/^\s*(?:name[:\s-]+)([A-Za-z][a-zA-Z'-]+(?: [A-Za-z][a-zA-Z'-]+)?)\s*$/i);
  if (!m) return undefined;
  const parts = m[1].split(" ").filter((p) => !NAME_STOP.has(p.toLowerCase()));
  if (!parts.length) return undefined;
  const name = parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
  if (name.length < 2 || /^(Rent|Buy|Lekki|Yaba|Ikate|Abuja|Lagos)$/i.test(name)) return undefined;
  return name;
}

const INJECTION = /ignore (all |any |the |your )?(previous|prior|above|earlier)?\s?(instructions|rules|prompt)|system prompt|you are now|developer mode|act as (an?|my)|reveal (your|the) (prompt|instructions)|jailbreak|pretend (to be|you are)|disregard (the|your|all)/i;
const SCAM: [RegExp, string][] = [
  [/(send|give|share) (me )?(your |the )?(account|acct|bank) (number|details|no)/i, "asks for account details"],
  [/pay(ment)? (the )?(deposit|money|fee).{0,20}before (viewing|inspection|seeing)/i, "wants to pay before viewing"],
  [/western union|moneygram|gift ?card|itunes card|bitcoin|crypto(currency)?|usdt/i, "unusual payment method"],
  [/(overpay|over-pay|refund the (balance|difference)|cheque|check) /i, "overpayment pattern"],
  [/i am (abroad|overseas|outside the country).{0,40}(pay|send|transfer)/i, "remote payment pressure"],
  [/(your|ur) (bvn|otp|pin|password)/i, "asks for credentials"],
];

export function understandRules(text: string, opts: { ref: Date; replyId?: string; lastOffer?: "slots" | "listings" | null }): Understanding {
  const raw = text.trim();
  const t = " " + raw.toLowerCase().replace(/[’]/g, "'") + " ";
  const lang = detectLanguage(raw);
  const u: Understanding = {
    language: lang.language,
    other_language: lang.other,
    intent: "other",
    needs: {},
    contact: {},
    questions: [],
    scam_signals: [],
    injection: INJECTION.test(raw),
  };

  // Interactive replies carry structured ids.
  if (opts.replyId) {
    const id = opts.replyId;
    if (id.startsWith("slot:")) return { ...u, intent: "pick_slot", slot_rank: Number(id.split(":")[1]) };
    if (id.startsWith("pick:")) return { ...u, intent: "pick_listing", listing_ref: id.slice(5) };
    if (id === "act:book") return { ...u, intent: "book_viewing" };
    if (id === "act:cheaper") return { ...u, intent: "refine", refine: "cheaper" };
    if (id === "act:human") return { ...u, intent: "request_human" };
    if (id === "act:more") return { ...u, intent: "ask_options" };
    if (id.startsWith("purpose:")) return { ...u, intent: "provide_info", needs: { purpose: id.slice(8) as Purpose } };
    if (id === "rem:confirm") return { ...u, intent: "thanks" };
    if (id === "rem:reschedule") return { ...u, intent: "reschedule" };
    if (id.startsWith("beds:")) return { ...u, intent: "provide_info", needs: { bedrooms_min: Number(id.slice(5)) } };
  }

  // Opt-out / opt-in
  if (/^\s*(stop|unsubscribe|stop all|stop messages?|end|quit)\s*[.!]*\s*$/i.test(raw) || /abeg (stop|leave me)|stop (messaging|texting|sending|contacting) me|don'?t (message|contact|text) me|leave me alone|remove my (number|details)/i.test(raw)) {
    return { ...u, intent: "opt_out" };
  }
  if (/^\s*cancel\s*$/i.test(raw)) return { ...u, intent: "cancel_viewing" };
  if (/^\s*(start|subscribe|resume)\s*$/i.test(raw)) return { ...u, intent: "opt_in" };

  for (const [re, label] of SCAM) if (re.test(raw)) u.scam_signals.push(label);

  // Needs
  const needs: Needs = {};
  const purpose = extractPurpose(t);
  if (purpose) needs.purpose = purpose;
  const amounts = extractAmounts(raw);
  if (amounts.length) {
    if (amounts.length >= 2 && /between|from|to|-/.test(t)) {
      needs.budget_min = Math.min(...amounts.slice(0, 2));
      needs.budget_max = Math.max(...amounts.slice(0, 2));
    } else {
      needs.budget_max = amounts[0];
    }
  }
  const period = extractPeriod(t);
  if (period) needs.period = period;
  else if (needs.budget_max && purpose === "sale") needs.period = "total";
  const areas = extractAreas(raw);
  if (areas.length) needs.areas = areas;
  for (const [re, type] of TYPES) if (re.test(t)) { needs.property_type = type; break; }
  if (needs.property_type === "land" && !needs.purpose) needs.purpose = "sale";
  const beds = extractBedrooms(t);
  if (beds !== undefined) needs.bedrooms_min = beds;
  const mi = extractMoveIn(t, opts.ref);
  if (mi.iso) needs.move_in_by = mi.iso;
  if (mi.text) needs.move_in_text = mi.text;
  if (/\bcash\b|outright|pay (in )?full|upfront|one[\s-]?off/.test(t)) needs.financing = "cash";
  else if (/mortgage|nhf|bank loan/.test(t)) needs.financing = "mortgage";
  else if (/instal(l)?ment|payment plan|spread (the )?payment/.test(t)) needs.financing = "instalments";
  const nights = t.match(/(\d+|one|two|three|four|five|six|seven)\s?(nights?|nites?|days)/);
  if (nights && (needs.purpose === "shortlet" || /night/.test(nights[2]))) {
    needs.nights = WORD_NUM[nights[1]] ?? Number(nights[1]);
    needs.purpose = "shortlet";
  }
  const feats = FEATURES.filter(([re]) => re.test(t)).map(([, f]) => f);
  if (feats.length) needs.must_haves = feats;
  u.needs = needs;

  // Contact
  const name = extractName(raw);
  if (name) u.contact.name = name;
  const email = raw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (email) u.contact.email = email[0];

  const ref = raw.match(/\bLST-?\s?(\d{3,5})\b/i);
  if (ref) u.listing_ref = `LST-${ref[1]}`;

  // Questions the lead actually asked
  if (/still available|is it available|e (still )?dey|available\?|has it been taken|is it taken|still there/.test(t)) u.questions.push("availability");
  if (/how much|what('s| is) the (price|rent|cost)|price\?|how much (be|is) (it|am)|wetin be the price|cost\?/.test(t)) u.questions.push("price");
  if (/service charge/.test(t)) u.questions.push("service_charge");
  if (/where (is|be) (it|am|the)|location|address|which street|exact place/.test(t)) u.questions.push("location");
  if (/c of o|c of o\b|governor'?s consent|title|deed|survey|documents?|papers?|excision/.test(t)) u.questions.push("documents");
  if (/agency fee|agent fee|legal fee|caution|commission|agreement fee|inspection fee/.test(t)) u.questions.push("fees");
  if (/payment plan|instal(l)?ment/.test(t) && /\?/.test(t)) u.questions.push("payment_plan");
  if (/is there (light|power|water|parking)|does it have|e get (light|water|parking)|any (bq|parking|pool)/.test(t)) u.questions.push("features");

  // Intents (most specific first)
  const lastOffer = opts.lastOffer ?? null;
  const ordinal = t.match(/\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last)\b(?: one)?|\b(?:number|no\.?|option)\s?(\d)\b|^\s*(\d)\s*$/);
  const ordinalRank = ordinal
    ? ({ first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4, fifth: 5, "5th": 5, last: 99 } as Record<string, number>)[ordinal[1] ?? ""] ?? Number(ordinal[2] ?? ordinal[3])
    : undefined;

  if (/reschedule|another (day|time)|change (the )?(time|date|day)|move (it|the viewing)|can'?t make it|no fit come|shift (am|it|the viewing)/.test(t)) {
    u.intent = "reschedule";
  } else if (/cancel (the |my )?(viewing|inspection|appointment|booking)/.test(t)) {
    u.intent = "cancel_viewing";
  } else if (/(talk|speak|chat) (to|with) (a |an )?(person|human|agent|someone|real person|somebody)|real human|call me|make (somebody|person|someone) call|i want (a|an) (agent|human)|connect me to|speak with someone|speak to someone/.test(t)) {
    u.intent = "request_human";
  } else if (lastOffer === "slots" && (ordinalRank !== undefined || /\b(\d{1,2}(:\d{2})?\s?(am|pm)?)\b/.test(t) && /(mon|tue|wed|thu|fri|sat|sun|tomorrow|first|second|third)/.test(t))) {
    u.intent = "pick_slot";
    u.slot_rank = ordinalRank ?? 1;
  } else if (/cheaper|less expensive|lower (price|budget)|something (less|lower)|e too cost|too expensive|price wey low|reduce|cheap pass/.test(t)) {
    u.intent = "refine";
    u.refine = "cheaper";
  } else if (/bigger|more (rooms|space)|larger/.test(t)) {
    u.intent = "refine";
    u.refine = "bigger";
  } else if (/closer to|nearer|near to/.test(t)) {
    u.intent = "refine";
    u.refine = "closer";
  } else if (/(can|could|may) i (see|view|inspect|check)|view(ing)?\b|inspect(ion)?|come (and )?see|make i come|when can i (come|see)|book (a )?(viewing|inspection)|see (it|am|the (house|place|flat))|visit/.test(t)) {
    u.intent = "book_viewing";
    if (/weekend|saturday|sunday/.test(t)) u.wants_weekend = true;
  } else if (lastOffer === "listings" && (ordinalRank !== undefined || /the (\w+ ?){1,3} one\b|i (like|want|prefer) the/.test(t))) {
    u.intent = "pick_listing";
    if (ordinalRank !== undefined) u.pick_rank = ordinalRank;
    if (areas.length) u.pick_area = areas[0];
  } else if (/(show|send|see) (me )?(options|listings|what you have|houses|homes|more)|what do you have|wetin you get|any (house|flat|options)/.test(t)) {
    u.intent = "ask_options";
  } else if (Object.keys(needs).length || name || email) {
    u.intent = "provide_info";
  } else if (u.questions.length) {
    u.intent = "question";
  } else if (/^\s*(thanks|thank you|thank u|ok thanks|noted|alright|ok|okay|great|perfect|cool|e se|ese|nagode|daalu|thank una)\W*\s*$/i.test(raw)) {
    u.intent = "thanks";
  } else if (/not interested|no longer interested|found (a|one|somewhere)|i don get|no thanks/.test(t)) {
    u.intent = "decline";
  } else if (/^\s*(hi|hello|hey|good (morning|afternoon|evening|day)|how far|howdy|hallo|bawo|sannu|kedu|ndewo)\b/i.test(raw)) {
    u.intent = "greeting";
  }
  if (lastOffer === "listings" && u.intent !== "pick_listing") {
    if (ordinalRank !== undefined && /one|option|number/.test(t)) u.pick_rank = ordinalRank;
    if (areas.length && /\bone\b|the .* (flat|house|duplex|terrace)/.test(t)) u.pick_area = areas[0];
  }
  if (u.questions.length && (u.intent === "provide_info" || u.intent === "greeting" || u.intent === "other")) {
    // Keep the extracted needs; the question is answered first.
    if (u.intent !== "provide_info") u.intent = "question";
  }
  return u;
}

/** Merge newly extracted needs into stored needs (new values win, arrays union). */
export function mergeNeeds(old: Needs, add: Partial<Needs>): Needs {
  const out: Needs = { ...old };
  for (const [k, v] of Object.entries(add) as [keyof Needs, unknown][]) {
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) continue;
    if (k === "must_haves" && Array.isArray(v)) {
      out.must_haves = [...new Set([...(old.must_haves ?? []), ...(v as string[])])];
    } else {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  if (out.purpose === "shortlet" && !add.period && out.budget_max && out.budget_max < 1_000_000) out.period = "night";
  if (out.purpose === "rent" && !out.period && out.budget_max) out.period = "year";
  if (out.purpose === "sale" && out.budget_max) out.period = "total";
  return out;
}
