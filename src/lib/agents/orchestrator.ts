// The Orchestrator: loads the lead and its last 20 messages, understands the
// new message, picks the agent by stage and intent, writes the reply through
// the guardrails, and sends everything through sendMessage().
import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { getDb, withKeyLock } from "../db/client";
import * as s from "../db/schema";
import type { Lead, Listing, Needs, Org, LeadCtx } from "../db/schema";
import { now, HOUR } from "../clock";
import { alert, audit, getListing, getListingByRef, logEvent, recentMessages, updateLead, enqueueJob, cancelJobs, getUserName } from "../repo";
import { sendMessage } from "../messaging/send";
import { payloadText, type OutPayload } from "../channels/whatsapp/types";
import { llm, BudgetExceededError, type Move, type ReplyPlan, type HistoryItem, type AgentName, type AskField } from "../llm";
import { composeReply } from "../llm/mock";
import { mergeNeeds, pidginHits, type Understanding } from "./understand";
import { checkReply, sanitize, hasConsent } from "./guardrails";
import { scoreLead, missingFields, isQualified } from "./scoring";
import { searchListings, countFitting, needsSummary, type Ranked } from "./matchmaker";
import { freeSlots, googleCalendarLink, VIEWING_MINUTES } from "./scheduler";
import { naira, fmtSlot, fmtDayLong, fmtTime } from "../format";
import { env } from "../env";

const MAX_QUESTIONS = 8;

interface Turn {
  org: Org;
  lead: Lead;
  history: HistoryItem[];
  previousAi: string[];
  firstReply: boolean;
  language: "en-NG" | "pcm";
  leadText: string;
  agentName: string;
  seed: string;
}

function daypart(d: Date): ReplyPlan["daypart"] {
  const h = (d.getUTCHours() + 1) % 24;
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

async function loadTurn(orgId: string, leadId: string, leadText: string): Promise<Turn> {
  const db = await getDb();
  const [org] = await db.select().from(s.organisations).where(eq(s.organisations.id, orgId));
  const [lead] = await db.select().from(s.leads).where(and(eq(s.leads.org_id, orgId), eq(s.leads.id, leadId)));
  const msgs = await recentMessages(orgId, leadId, 20);
  const history: HistoryItem[] = msgs
    .filter((m) => m.direction !== "event")
    .map((m) => ({ role: m.direction === "in" ? "lead" : m.author.startsWith("user:") ? "human" : "ai", text: m.body }));
  const aiOut = msgs.filter((m) => m.direction === "out" && m.author.startsWith("ai:"));
  const anyOut = await db.select({ id: s.messages.id }).from(s.messages).where(and(eq(s.messages.lead_id, leadId), eq(s.messages.direction, "out"))).limit(1);
  const agentName = (await getUserName(lead.assigned_agent_id)) ?? "an agent";
  return {
    org, lead, history,
    previousAi: aiOut.slice(-10).map((m) => m.body),
    firstReply: anyOut.length === 0,
    language: lead.language === "pcm" ? "pcm" : "en-NG",
    leadText,
    agentName: agentName.split(" ")[0],
    seed: `${lead.id}:${msgs.length}`,
  };
}

/** Generate a reply for the plan, apply the checks, regenerate once, then fall back safely. */
async function write(t: Turn, agent: AgentName, moves: Move[], allowedAmounts: number[]): Promise<string> {
  const requireConsent = t.firstReply;
  if (requireConsent && !moves.some((m) => m.k === "consent")) {
    const at = moves.findIndex((m) => m.k !== "greet" && m.k !== "intro" && m.k !== "ack_listing" && m.k !== "answer");
    moves.splice(at === -1 ? moves.length : at, 0, { k: "consent" });
  }
  const plan: ReplyPlan = {
    agent, language: t.language, orgName: t.org.name, leadName: t.lead.name, daypart: daypart(now()), moves,
    allowedAmounts: [...allowedAmounts, ...budgetAmounts(t.lead.needs)], requireConsent, leadMessage: t.leadText,
    orgProfile: { tone: t.org.tone_notes, feesPolicy: t.org.fees_policy, areas: t.org.areas_served, officeHours: t.org.office_hours },
  };
  const model = await llm();
  let text = "";
  let problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    text = await model.respond({ orgId: t.org.id, leadId: t.lead.id, plan, history: t.history, previousAi: t.previousAi, attempt, seed: t.seed });
    const res = checkReply(text, { allowedAmounts: plan.allowedAmounts, previousAi: t.previousAi, requireConsent });
    problems = res.problems;
    if (res.ok) break;
  }
  if (problems.length) {
    const cleaned = sanitize(text);
    const res = checkReply(cleaned, { allowedAmounts: plan.allowedAmounts, previousAi: t.previousAi, requireConsent });
    const hard = res.problems.filter((p) => p.startsWith("invented_price") || p === "phone_number" || p === "legal_promise" || p === "too_long");
    if (hard.length) {
      // Safe fallback: the deterministic composer only uses facts from the plan.
      text = composeReply(plan, { previousAi: t.previousAi, attempt: 2, seed: t.seed });
      await audit(t.org.id, `ai:${agent}`, "reply.fallback", "lead", t.lead.id, { problems: hard }, t.lead.id);
    } else {
      text = cleaned;
    }
    if (requireConsent && !hasConsent(text)) text = `${text} ${composeReply({ ...plan, moves: [{ k: "consent" }] }, { previousAi: [], attempt: 0, seed: t.seed })}`;
  }
  return text;
}

function budgetAmounts(n: Needs) {
  return [n.budget_max, n.budget_min].filter((x): x is number => typeof x === "number");
}

async function send(t: Turn, agent: AgentName, payload: OutPayload, reason: string) {
  const r = await sendMessage(t.org.id, t.lead.id, payload, { author: `ai:${agent}`, reason });
  if (r.ok && payload.type !== "image" && payload.type !== "location") {
    t.previousAi.push(payloadText(payload));
    t.firstReply = false;
    if (!t.lead.consent_at) {
      t.lead = await updateLead(t.org.id, t.lead.id, { consent_at: now() });
    }
  }
  return r;
}

async function say(t: Turn, agent: AgentName, moves: Move[], allowed: number[] = [], reason = "reply") {
  const text = await write(t, agent, moves, allowed);
  return send(t, agent, { type: "text", body: text }, reason);
}

async function saveCtx(t: Turn, patch: Partial<LeadCtx>) {
  t.lead = await updateLead(t.org.id, t.lead.id, { ctx: { ...t.lead.ctx, ...patch } });
}

// ---------------------------------------------------------------------------

export async function processInboundMessage(orgId: string, leadId: string, messageId: string) {
  return withKeyLock(`lead:${leadId}`, async () => {
    const db = await getDb();
    const [msg] = await db.select().from(s.messages).where(and(eq(s.messages.org_id, orgId), eq(s.messages.id, messageId)));
    if (!msg || msg.direction !== "in" || (msg.payload as { processed?: boolean }).processed) return;
    try {
      await handle(orgId, leadId, msg);
    } catch (e) {
      if (e instanceof BudgetExceededError) {
        await onBudgetExceeded(orgId, leadId, e);
      } else {
        throw e;
      }
    } finally {
      await db.update(s.messages).set({ payload: { ...msg.payload, processed: true } }).where(eq(s.messages.id, msg.id));
    }
  });
}

async function onBudgetExceeded(orgId: string, leadId: string, e: BudgetExceededError) {
  const t = await loadTurn(orgId, leadId, "");
  const last = t.lead.ctx.holding_sent_at ? new Date(t.lead.ctx.holding_sent_at) : null;
  if (!last || now().getTime() - last.getTime() > 6 * HOUR) {
    const text = composeReply(
      { agent: "system", language: t.language, orgName: t.org.name, leadName: t.lead.name, daypart: daypart(now()), moves: t.firstReply ? [{ k: "holding" }, { k: "consent" }] : [{ k: "holding" }], allowedAmounts: [], requireConsent: t.firstReply, orgProfile: { tone: "", feesPolicy: "", areas: [], officeHours: "" } },
      { previousAi: t.previousAi, attempt: 0, seed: t.seed },
    );
    await send(t, "system", { type: "text", body: text }, "budget_holding");
    await saveCtx(t, { holding_sent_at: now().toISOString() });
  }
  await updateLead(orgId, leadId, { needs_human: true, flag_reason: "AI budget reached" });
  await alert(orgId, leadId, "ai_budget", `AI daily budget reached (${e.message}). The AI is paused; new messages get a holding reply.`);
}

async function handle(orgId: string, leadId: string, msg: s.Message) {
  const t = await loadTurn(orgId, leadId, msg.body);
  const p = msg.payload as { reply_id?: string; location?: { lat: number; lng: number } };
  const model = await llm();
  const u: Understanding = await model.understand({
    orgId, leadId, text: msg.body, replyId: p.reply_id, needs: t.lead.needs, history: t.history.slice(0, -1),
    lastOffer: t.lead.ctx.offered_slots?.length ? "slots" : t.lead.ctx.shortlist?.length ? "listings" : null, ref: now(),
  });
  const db = await getDb();
  await db.update(s.messages).set({ payload: { ...msg.payload, understanding: u } }).where(eq(s.messages.id, msg.id));

  // Language: follow the lead (keep the last English/Pidgin choice for "other").
  if ((u.language === "pcm" || u.language === "en-NG") && msg.type === "text" && u.language !== t.lead.language) {
    const words = msg.body.trim().split(/\s+/).length;
    // Switch to Pidgin on any clear Pidgin message; back to English only on a clearly English one.
    const switchTo = u.language === "pcm" ? words >= 2 : words >= 5 && pidginHits(msg.body) === 0;
    if (switchTo) {
      t.lead = await updateLead(orgId, leadId, { language: u.language });
      t.language = u.language;
    }
  }

  // 1. Opt-out always works, even when a human has taken over.
  if (u.intent === "opt_out") {
    if (!t.lead.opted_out_at) {
      t.lead = await updateLead(orgId, leadId, { opted_out_at: now(), ai_paused: false });
      const text = await write(t, "system", [{ k: "opt_out" }], []);
      await sendMessage(orgId, leadId, { type: "text", body: text }, { author: "ai:system", reason: "opt_out_confirmation", allowOptedOut: true });
      await logEvent(orgId, leadId, "Opted out · STOP");
      await audit(orgId, "lead", "lead.opted_out", "lead", leadId, {}, leadId);
      await cancelLeadJobs(orgId, leadId);
    }
    return;
  }
  if (t.lead.opted_out_at) {
    if (u.intent === "opt_in") {
      t.lead = await updateLead(orgId, leadId, { opted_out_at: null });
      await logEvent(orgId, leadId, "Re-subscribed · START");
      await say(t, "system", [{ k: "opt_in" }]);
    }
    return; // never reply to an opted-out lead
  }

  // Needs extraction still runs during a human takeover (it helps the agent).
  const pickOnly = (u.intent === "pick_listing" || u.intent === "book_viewing" || u.intent === "pick_slot") && !!(u.pick_area || u.pick_rank);
  const newNeeds = pickOnly ? mergeNeeds(t.lead.needs, { ...u.needs, areas: undefined }) : mergeNeeds(t.lead.needs, u.needs);
  const patch: Partial<typeof s.leads.$inferInsert> = { needs: newNeeds };
  // A name the lead states beats the WhatsApp profile name ("Chiamaka" -> "Chiamaka Eze").
  if (u.contact.name && u.contact.name !== t.lead.name) patch.name = u.contact.name;
  if (u.contact.email && !t.lead.email) patch.email = u.contact.email;
  t.lead = await updateLead(orgId, leadId, patch);

  // 2. Human takeover: the AI stays silent.
  if (t.lead.ai_paused) {
    await alert(orgId, leadId, "lead_message", `${t.lead.name ?? t.lead.phone} wrote while you have the chat: "${msg.body.slice(0, 80)}"`);
    return;
  }
  if (t.lead.stage === "new") t.lead = await updateLead(orgId, leadId, { stage: "qualifying" });

  // 3. Non-text messages
  if (msg.type === "audio") return void (await say(t, "system", greetIfFirst(t, [{ k: "voice_note" }])));
  if (msg.type === "image" && !msg.body) return void (await say(t, "system", greetIfFirst(t, [{ k: "image_received" }])));
  if (msg.type === "location") {
    await say(t, "qualifier", greetIfFirst(t, [{ k: "location_received" }, ...askMoves(t)]));
    return;
  }

  // 4. Safety and hand-offs
  if (u.language === "other") {
    await requestHuman(t, `Wrote in ${u.other_language ?? "another language"}`, [{ k: "other_language", language: u.other_language ?? "your language" }]);
    return;
  }
  if (u.scam_signals.length) {
    t.lead = await updateLead(orgId, leadId, { spam: true, ai_paused: true, needs_human: true, flag_reason: "Scam signals" });
    await rescore(t);
    await say(t, "qualifier", greetIfFirst(t, [{ k: "scam" }]), [], "scam_signals");
    await logEvent(orgId, leadId, `Qualifier · scam signals (${u.scam_signals.join(", ")}) · AI paused`);
    await alert(orgId, leadId, "spam", `Scam signals from ${t.lead.name ?? t.lead.phone}: ${u.scam_signals.join(", ")}. AI paused.`);
    return;
  }
  if (u.injection) {
    await audit(orgId, "lead", "lead.prompt_injection", "message", msg.id, {}, leadId);
  }
  if (u.intent === "request_human") {
    await requestHuman(t, "Asked for a person", [{ k: "handoff_human", agent: t.agentName }]);
    return;
  }

  // 5. Listing reference ("Hi, I'm interested in LST-1042")
  let refListing: Listing | null = null;
  if (u.listing_ref && !p.reply_id && u.intent !== "pick_listing") {
    refListing = await getListingByRef(orgId, u.listing_ref);
    if (refListing && !t.lead.listing_id) {
      const n = { ...t.lead.needs };
      if (!n.purpose) n.purpose = refListing.purpose;
      if (!n.areas?.length) n.areas = [refListing.area];
      if (n.bedrooms_min === undefined && refListing.property_type !== "land") n.bedrooms_min = refListing.bedrooms;
      if (!n.property_type) n.property_type = refListing.property_type;
      t.lead = await updateLead(orgId, leadId, { listing_id: refListing.id, needs: mergeNeeds(n, {}), source: { ...t.lead.source, listing_ref: refListing.ref_code } });
      await logEvent(orgId, leadId, `Came from listing ${refListing.ref_code}`);
    }
  }
  await rescore(t);

  // 6. Route by stage and intent
  const stage = t.lead.stage;
  const ctx = t.lead.ctx;
  if (u.intent === "pick_slot" && ctx.offered_slots?.length) return void (await bookSlot(t, u.slot_rank ?? 1));
  if (u.intent === "reschedule") return void (await reschedule(t));
  if (u.intent === "cancel_viewing") return void (await cancelViewing(t));
  if (u.intent === "pick_listing" || (u.intent === "book_viewing" && (stage !== "qualifying" || t.lead.listing_id))) {
    const listing = await resolvePick(t, u);
    if (listing) return void (await offerSlots(t, listing, u, answerMoves(t, u, listing)));
    if (ctx.shortlist?.length) return void (await say(t, "scheduler", [...answerMoves(t, u, null), { k: "pick_prompt" }]));
  }
  if ((u.intent === "refine" || u.intent === "ask_options") && (ctx.shortlist?.length || isQualified(t.lead.needs))) {
    return void (await sendMatches(t, u, answerMoves(t, u, null)));
  }
  if (stage === "new" || stage === "qualifying") return void (await qualify(t, u, refListing));
  if (stage === "qualified") return void (await sendMatches(t, u, answerMoves(t, u, null)));
  if (stage === "viewed" || stage === "won" || stage === "lost") {
    if (u.intent === "provide_info" && Object.keys(u.needs).length >= 2) {
      t.lead = await updateLead(orgId, leadId, { stage: "qualifying" });
      return void (await qualify(t, u, refListing));
    }
  }
  // Concierge: answer from listing data, otherwise acknowledge politely.
  const focus = await focusListing(t);
  const answers = answerMoves(t, u, focus);
  if (u.intent === "thanks") return void (await say(t, "system", [{ k: "thanks" }]));
  if (u.intent === "decline") {
    await updateLead(orgId, leadId, { stage: "lost", flag_reason: "Lead declined" });
    await logEvent(orgId, leadId, "Lead declined · moved to Lost");
    return void (await say(t, "system", [{ k: "decline" }]));
  }
  if (answers.length) {
    const extra: Move[] = stage === "shortlisted" ? [{ k: "pick_prompt" }] : [];
    return void (await say(t, "matchmaker", [...answers, ...extra], focus ? listingAmounts(focus) : []));
  }
  if (u.intent === "provide_info" && stage === "shortlisted") return void (await sendMatches(t, u, []));
  await say(t, "system", [{ k: "smalltalk" }, ...(stage === "shortlisted" ? [{ k: "pick_prompt" } as Move] : [])]);
}

function greetIfFirst(t: Turn, moves: Move[]): Move[] {
  return t.firstReply ? [{ k: "greet" }, { k: "intro" }, ...moves] : moves;
}

async function requestHuman(t: Turn, reason: string, moves: Move[]) {
  t.lead = await updateLead(t.org.id, t.lead.id, { needs_human: true, ai_paused: true, flag_reason: reason });
  await say(t, "qualifier", greetIfFirst(t, moves), [], "handoff");
  await logEvent(t.org.id, t.lead.id, `Handed to ${t.agentName} · ${reason.toLowerCase()} · AI paused`);
  await alert(t.org.id, t.lead.id, "human_requested", `${t.lead.name ?? t.lead.phone}: ${reason}. AI paused until you resume it.`);
}

async function cancelLeadJobs(orgId: string, leadId: string) {
  for (const type of ["reminder_24h", "reminder_2h", "viewing_followup"]) await cancelJobs(orgId, type, leadId);
}

async function rescore(t: Turn) {
  const db = await getDb();
  const inbound = await db.select({ id: s.messages.id }).from(s.messages).where(and(eq(s.messages.lead_id, t.lead.id), eq(s.messages.direction, "in")));
  const fitting = await countFitting(t.org.id, t.lead.needs);
  const r = scoreLead({ needs: t.lead.needs, name: t.lead.name, inboundCount: inbound.length, fromListing: !!t.lead.source.listing_ref, fittingListings: fitting, spam: t.lead.spam, ref: now() });
  t.lead = await updateLead(t.org.id, t.lead.id, { score: r.score, temperature: r.temperature, score_breakdown: r.breakdown });
}

function listingAmounts(l: Listing): number[] {
  return [l.price_amount, l.service_charge].filter((x): x is number => typeof x === "number");
}

/** Answer what the lead actually asked, using listing data only. */
function answerMoves(t: Turn, u: Understanding, l: Listing | null): Move[] {
  const out: Move[] = [];
  for (const q of u.questions) {
    if (q === "availability") continue; // handled by ack_listing
    if (!l) {
      if (q === "fees" && t.org.fees_policy) out.push({ k: "answer", topic: "fees", value: t.org.fees_policy });
      else if (q !== "price") out.push({ k: "answer", topic: "unknown" });
      continue;
    }
    if (q === "price") out.push({ k: "answer", topic: "price", title: shortTitle(l), value: naira(l.price_amount, l.price_period) });
    else if (q === "service_charge") out.push(l.service_charge ? { k: "answer", topic: "service_charge", value: naira(l.service_charge) } : { k: "answer", topic: "unknown" });
    else if (q === "location") out.push({ k: "answer", topic: "location", area: l.area, city: l.city });
    else if (q === "documents") out.push({ k: "answer", topic: "documents" });
    else if (q === "fees") out.push(t.org.fees_policy ? { k: "answer", topic: "fees", value: t.org.fees_policy } : { k: "answer", topic: "unknown" });
    else if (q === "features") out.push({ k: "answer", topic: "features", value: l.features.filter((f) => !/on file/i.test(f)).slice(0, 4).join(", ") });
    else if (q === "payment_plan") {
      const plan = l.features.find((f) => /payment plan|instal/i.test(f));
      out.push(plan ? { k: "answer", topic: "payment_plan", value: plan } : { k: "answer", topic: "unknown" });
    } else out.push({ k: "answer", topic: "unknown" });
  }
  // de-duplicate "unknown"
  return out.filter((m, i) => !(m.k === "answer" && m.topic === "unknown" && out.findIndex((x) => x.k === "answer" && x.topic === "unknown") !== i));
}

function shortTitle(l: Listing) {
  return l.title.replace(/, (Abuja|Lagos)$/, "");
}

async function focusListing(t: Turn): Promise<Listing | null> {
  const id = t.lead.ctx.pending_listing_id ?? t.lead.listing_id ?? t.lead.ctx.shortlist?.[0];
  return id ? getListing(t.org.id, id) : null;
}

// ---- Agent 1: Qualifier ---------------------------------------------------

function askMoves(t: Turn): Move[] {
  const n = t.lead.needs;
  const ctx = t.lead.ctx;
  const asked = ctx.asked ?? [];
  const timesAsked = (f: string) => asked.filter((a) => a === f).length;
  let fields: AskField[] = missingFields(n).filter((f) => timesAsked(f) < 2);
  if (n.purpose === "shortlet" && !n.nights && timesAsked("nights") < 1) fields.push("nights");
  if (fields.length <= 1 && !t.lead.name && timesAsked("name") < 1) fields.push("name");
  fields = fields.slice(0, 2);
  return fields.length ? [{ k: "ask", fields, purpose: n.purpose }] : [];
}

async function qualify(t: Turn, u: Understanding, refListing: Listing | null) {
  const moves: Move[] = [];
  if (t.firstReply) moves.push({ k: "greet" }, { k: "intro" });
  const allowed: number[] = [];
  const listing = refListing ?? (u.questions.length ? await focusListing(t) : null);
  if (listing && (u.listing_ref || u.questions.includes("availability"))) {
    moves.push({ k: "ack_listing", title: shortTitle(listing), available: listing.status === "available" && !listing.hidden });
  } else if (u.questions.includes("availability") && !listing && !Object.keys(t.lead.needs).length) {
    // Without a listing or any needs we cannot check; the shortlist will show what is available.
    moves.push({ k: "answer", topic: "unknown" });
  }
  if (listing) allowed.push(...listingAmounts(listing));
  moves.push(...answerMoves(t, u, listing));
  if (u.contact.name && !t.firstReply) moves.push({ k: "ack_name", name: u.contact.name });

  const questionsAsked = t.lead.ctx.questions_asked ?? 0;
  if (isQualified(t.lead.needs) || questionsAsked >= MAX_QUESTIONS) {
    if (!t.lead.needs.purpose && !t.lead.needs.areas?.length) {
      await requestHuman(t, "Could not qualify after 8 questions", [{ k: "handoff_human", agent: t.agentName }]);
      return;
    }
    await rescore(t);
    t.lead = await updateLead(t.org.id, t.lead.id, { stage: "qualified" });
    await logEvent(t.org.id, t.lead.id, `Qualified · score ${t.lead.score} · handed to Matchmaker`, { score: t.lead.score });
    await audit(t.org.id, "ai:qualifier", "lead.qualified", "lead", t.lead.id, { score: t.lead.score, needs: t.lead.needs }, t.lead.id);
    if (t.lead.temperature === "hot") await alert(t.org.id, t.lead.id, "hot_lead", `Hot lead: ${t.lead.name ?? t.lead.phone} scored ${t.lead.score}.`);
    await sendMatches(t, u, moves.filter((m) => m.k !== "ack_name"), allowed);
    return;
  }
  const asks = askMoves(t);
  if (!asks.length) {
    // Nothing left we may ask: hand off with what we have.
    t.lead = await updateLead(t.org.id, t.lead.id, { ctx: { ...t.lead.ctx, questions_asked: MAX_QUESTIONS } });
    return qualify(t, u, refListing);
  }
  const fields = (asks[0] as Extract<Move, { k: "ask" }>).fields;
  moves.push(...asks);
  await say(t, "qualifier", moves, allowed, "qualify");
  await saveCtx(t, { questions_asked: questionsAsked + fields.length, asked: [...(t.lead.ctx.asked ?? []), ...fields] });
}

// ---- Agent 2: Matchmaker --------------------------------------------------

async function sendMatches(t: Turn, u: Understanding, lead: Move[], allowed: number[] = []) {
  const ctx = t.lead.ctx;
  const n = t.lead.needs;
  const shown = ctx.excluded ?? [];
  let variant: "normal" | "cheaper" | "more" = "normal";
  let results: Ranked[];
  if (u.intent === "refine" && u.refine === "cheaper") {
    variant = "cheaper";
    const db = await getDb();
    const prev = shown.length ? await db.select().from(s.listings).where(and(eq(s.listings.org_id, t.org.id), inArray(s.listings.id, shown))) : [];
    const minShown = prev.length ? Math.min(...prev.map((p) => p.price_amount)) : n.budget_max;
    results = await searchListings(t.org.id, n, { exclude: shown, maxPrice: minShown ? minShown - 1 : undefined });
  } else if (u.intent === "ask_options" || u.intent === "refine") {
    variant = shown.length ? "more" : "normal";
    results = await searchListings(t.org.id, n, { exclude: shown });
  } else {
    results = await searchListings(t.org.id, n, {});
  }
  const summary = needsSummary(n, t.language);
  let picks = results.slice(0, 5).filter((r, i) => i < 3 || r.score >= 70);
  const moves: Move[] = [...lead];
  if (!picks.length) {
    const relaxed = await searchListings(t.org.id, n, { relaxed: true, exclude: shown });
    picks = relaxed.slice(0, 3);
    moves.push({ k: "no_match", summary, nearest: picks.length > 0 });
    await logEvent(t.org.id, t.lead.id, picks.length ? `Matchmaker · no exact match · ${picks.length} alternatives sent` : "Matchmaker · no match · agent alerted");
    if (!picks.length) {
      await alert(t.org.id, t.lead.id, "no_match", `No listings match ${t.lead.name ?? t.lead.phone}: ${summary}.`);
      await say(t, "matchmaker", moves, allowed, "no_match");
      return;
    }
  } else {
    moves.push({ k: "matches_intro", count: picks.length, summary, variant });
  }
  allowed.push(...picks.flatMap((p) => listingAmounts(p.listing)));
  await say(t, "matchmaker", moves, allowed, "matches");

  const db = await getDb();
  const sentAt = now();
  for (const [i, p] of picks.entries()) {
    const l = p.listing;
    const caption = `${l.title}\n${naira(l.price_amount, l.price_period)}\n${p.reason}`;
    // WhatsApp only accepts JPEG/PNG images; without a real photo, send the card as text.
    const payload: OutPayload = l.photos.length || env().MOCK_WHATSAPP ? { type: "image", url: photoUrl(l), caption, listing_ref: l.ref_code } : { type: "text", body: caption };
    await send(t, "matchmaker", payload, "match");
    await db.insert(s.matches).values({ org_id: t.org.id, lead_id: t.lead.id, listing_id: l.id, rank: shown.length + i + 1, score: p.score, reason: p.reason, sent_at: sentAt, created_at: sentAt });
  }
  const outro = await write(t, "matchmaker", [{ k: "matches_outro" }], []);
  await send(t, "matchmaker", {
    type: "list", body: outro, button: t.language === "pcm" ? "Choose house" : "Choose a home",
    rows: [
      ...picks.map((p) => ({ id: `pick:${p.listing.ref_code}`, title: shortTitle(p.listing).slice(0, 24), description: `${naira(p.listing.price_amount, p.listing.price_period)} · ${p.reason}`.slice(0, 72) })),
      { id: "act:cheaper", title: t.language === "pcm" ? "Show cheaper ones" : "Show cheaper options" },
      { id: "act:human", title: t.language === "pcm" ? "Talk to person" : "Talk to a person" },
    ],
  }, "match_list");
  await saveCtx(t, { shortlist: picks.map((p) => p.listing.id), excluded: [...shown, ...picks.map((p) => p.listing.id)], offered_slots: [] });
  // Route by area: the agent who owns the best match takes the lead.
  const owner = picks[0]?.listing.agent_id;
  if (owner && owner !== t.lead.assigned_agent_id && !shown.length) {
    t.lead = await updateLead(t.org.id, t.lead.id, { assigned_agent_id: owner });
    t.agentName = ((await getUserName(owner)) ?? t.agentName).split(" ")[0];
  }
  if (t.lead.stage === "qualified" || t.lead.stage === "qualifying") t.lead = await updateLead(t.org.id, t.lead.id, { stage: "shortlisted" });
  await logEvent(t.org.id, t.lead.id, `Matchmaker · ${picks.length} homes sent`, { refs: picks.map((p) => p.listing.ref_code) });
}

export function photoUrl(l: Listing) {
  const first = l.photos[0];
  if (first) return first.startsWith("http") ? first : `${env().APP_URL}${first}`;
  return `${env().APP_URL}/api/listing-photo/${l.ref_code}`;
}

// ---- Agent 4: Scheduler ---------------------------------------------------

async function resolvePick(t: Turn, u: Understanding): Promise<Listing | null> {
  const ctx = t.lead.ctx;
  if (u.listing_ref) {
    const l = await getListingByRef(t.org.id, u.listing_ref);
    if (l) return l;
  }
  const short = ctx.shortlist ?? [];
  if (u.pick_rank && short.length) {
    const id = u.pick_rank === 99 ? short[short.length - 1] : short[u.pick_rank - 1];
    if (id) return getListing(t.org.id, id);
  }
  if (u.pick_area && short.length) {
    const db = await getDb();
    const ls = await db.select().from(s.listings).where(and(eq(s.listings.org_id, t.org.id), inArray(s.listings.id, short)));
    const hit = short.map((id) => ls.find((l) => l.id === id)).find((l) => l && l.area === u.pick_area);
    if (hit) return hit;
  }
  if (short.length === 1) return getListing(t.org.id, short[0]);
  if (ctx.pending_listing_id) return getListing(t.org.id, ctx.pending_listing_id);
  if (t.lead.listing_id && (!short.length || short.includes(t.lead.listing_id))) return getListing(t.org.id, t.lead.listing_id);
  return null;
}

async function viewingAgent(t: Turn, l: Listing): Promise<string | null> {
  if (l.agent_id) return l.agent_id;
  if (t.lead.assigned_agent_id) return t.lead.assigned_agent_id;
  const db = await getDb();
  const [a] = await db.select().from(s.availability).where(eq(s.availability.org_id, t.org.id)).limit(1);
  return a?.agent_id ?? null;
}

async function offerSlots(t: Turn, l: Listing, u: Understanding | null, lead: Move[] = [], intro: Move[] = []) {
  const agentId = await viewingAgent(t, l);
  const slots = agentId ? await freeSlots(t.org.id, agentId, { from: now(), weekendFirst: u?.wants_weekend }) : [];
  if (!slots.length) {
    await say(t, "scheduler", [...intro, ...lead, { k: "no_slots" }], listingAmounts(l), "no_slots");
    await alert(t.org.id, t.lead.id, "no_slots", `${t.lead.name ?? t.lead.phone} wants to view ${l.ref_code} but there are no free slots this week.`);
    return;
  }
  const body = await write(t, "scheduler", [...intro, ...lead, { k: "offer_slots", title: shortTitle(l) }], listingAmounts(l));
  await send(t, "scheduler", { type: "buttons", body, buttons: slots.map((sl, i) => ({ id: `slot:${i + 1}`, title: fmtSlot(sl).slice(0, 20) })) }, "offer_slots");
  await saveCtx(t, { offered_slots: slots.map((sl) => ({ start: sl.toISOString(), listing_id: l.id })), pending_listing_id: l.id });
  if (!t.lead.listing_id) t.lead = await updateLead(t.org.id, t.lead.id, { listing_id: l.id });
  await logEvent(t.org.id, t.lead.id, `Scheduler · ${slots.length} slots offered for ${l.ref_code}`);
}

async function bookSlot(t: Turn, rank: number) {
  const offered = t.lead.ctx.offered_slots ?? [];
  const choice = offered[Math.min(Math.max(rank, 1), offered.length) - 1];
  if (!choice) return;
  const l = await getListing(t.org.id, choice.listing_id);
  if (!l) return;
  const start = new Date(choice.start);
  const agentId = await viewingAgent(t, l);
  const db = await getDb();
  // Re-check the slot is still free (another lead may have taken it).
  const clash = agentId
    ? await db.select().from(s.viewings).where(and(eq(s.viewings.org_id, t.org.id), eq(s.viewings.agent_id, agentId), ne(s.viewings.status, "cancelled"), gt(s.viewings.end_at, new Date(start.getTime() - 45 * 60_000)))).then((vs) => vs.filter((v) => Math.abs(v.start_at.getTime() - start.getTime()) < 90 * 60_000))
    : [];
  if (clash.length) {
    await offerSlots(t, l, null, [], [{ k: "reschedule" }]);
    return;
  }
  const end = new Date(start.getTime() + VIEWING_MINUTES * 60_000);
  const [v] = await db.insert(s.viewings).values({ org_id: t.org.id, lead_id: t.lead.id, listing_id: l.id, agent_id: agentId, start_at: start, end_at: end, created_at: now() }).returning();
  const agentName = ((await getUserName(agentId)) ?? t.agentName).split(" ")[0];
  t.lead = await updateLead(t.org.id, t.lead.id, { stage: "viewing_booked", listing_id: l.id, ctx: { ...t.lead.ctx, offered_slots: [], pending_listing_id: undefined } });
  const when = `${fmtDayLong(start)}, ${fmtTime(start)}`;
  await say(t, "scheduler", [{ k: "booked", when, agent: agentName, title: shortTitle(l) }], [], "booked");
  if (l.lat && l.lng) await send(t, "scheduler", { type: "location", lat: l.lat, lng: l.lng, name: l.title, address: l.address }, "location");
  for (const [type, before] of [["reminder_24h", 24 * HOUR], ["reminder_2h", 2 * HOUR]] as const) {
    const at = new Date(start.getTime() - before);
    if (at > now()) await enqueueJob(t.org.id, type, at, { lead_id: t.lead.id, viewing_id: v.id }, `${type}:${v.id}`);
  }
  await enqueueJob(t.org.id, "viewing_followup", new Date(end.getTime() + HOUR), { lead_id: t.lead.id, viewing_id: v.id }, `viewing_followup:${v.id}`);
  const cal = googleCalendarLink({ title: `Viewing: ${l.title} with ${t.lead.name ?? t.lead.phone}`, start, end, details: `Lead: ${t.lead.name ?? ""} ${t.lead.phone}\nListing ${l.ref_code}`, location: l.address });
  await logEvent(t.org.id, t.lead.id, `Scheduler · viewing ${fmtSlot(start)} · confirmed`, { viewing_id: v.id, calendar_link: cal });
  await audit(t.org.id, "ai:scheduler", "viewing.booked", "viewing", v.id, { start: start.toISOString(), listing: l.ref_code }, t.lead.id);
  await alert(t.org.id, t.lead.id, "viewing_booked", `Viewing booked: ${t.lead.name ?? t.lead.phone}, ${l.ref_code}, ${fmtSlot(start)}.`);
}

async function upcomingViewing(t: Turn) {
  const db = await getDb();
  const [v] = await db
    .select()
    .from(s.viewings)
    .where(and(eq(s.viewings.org_id, t.org.id), eq(s.viewings.lead_id, t.lead.id), eq(s.viewings.status, "confirmed"), gt(s.viewings.start_at, now())))
    .orderBy(desc(s.viewings.start_at))
    .limit(1);
  return v ?? null;
}

async function reschedule(t: Turn) {
  const v = await upcomingViewing(t);
  if (!v) {
    const l = await focusListing(t);
    if (l) return offerSlots(t, l, null);
    return say(t, "scheduler", [{ k: "no_viewing" }]);
  }
  const db = await getDb();
  await db.update(s.viewings).set({ status: "cancelled" }).where(eq(s.viewings.id, v.id));
  await cancelLeadJobs(t.org.id, t.lead.id);
  await logEvent(t.org.id, t.lead.id, `Scheduler · viewing ${fmtSlot(v.start_at)} released for reschedule`);
  await audit(t.org.id, "ai:scheduler", "viewing.rescheduling", "viewing", v.id, {}, t.lead.id);
  t.lead = await updateLead(t.org.id, t.lead.id, { stage: "shortlisted" });
  const l = await getListing(t.org.id, v.listing_id);
  if (l) await offerSlots(t, l, null, [], [{ k: "reschedule" }]);
}

async function cancelViewing(t: Turn) {
  const v = await upcomingViewing(t);
  if (!v) return say(t, "scheduler", [{ k: "no_viewing" }]);
  const db = await getDb();
  await db.update(s.viewings).set({ status: "cancelled" }).where(eq(s.viewings.id, v.id));
  await cancelLeadJobs(t.org.id, t.lead.id);
  t.lead = await updateLead(t.org.id, t.lead.id, { stage: "shortlisted" });
  await say(t, "scheduler", [{ k: "cancelled", when: fmtSlot(v.start_at) }], [], "cancelled");
  await logEvent(t.org.id, t.lead.id, `Scheduler · viewing ${fmtSlot(v.start_at)} cancelled by lead`);
  await alert(t.org.id, t.lead.id, "viewing_cancelled", `${t.lead.name ?? t.lead.phone} cancelled the viewing on ${fmtSlot(v.start_at)}.`);
}

// ---- Used by jobs ---------------------------------------------------------

export async function writeFor(orgId: string, leadId: string, agent: AgentName, moves: Move[], allowed: number[]) {
  const t = await loadTurn(orgId, leadId, "");
  t.firstReply = false;
  return { text: await write(t, agent, moves, allowed), turn: t };
}
