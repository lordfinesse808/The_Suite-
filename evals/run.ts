// pnpm eval              → mock mode (CI)
// LLM_MODE=live pnpm eval → one run against Claude Haiku 4.5 (expected cost < $0.50)
process.env.DATABASE_URL = "memory://";
process.env.MOCK_WHATSAPP = "true";
(process.env as Record<string, string>).NODE_ENV = "test"; // no auto-seed; we seed explicitly
process.env.AI_DAILY_BUDGET_USD = process.env.AI_DAILY_BUDGET_USD || "1";

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Message } from "../src/lib/db/schema";

type Turn = { text?: string; reply?: string; audio?: boolean };
interface Case {
  name: string; description: string; profile_name: string; phone: string; turns: Turn[];
  expect: Record<string, unknown> & { needs?: Record<string, unknown> };
}

async function main() {
  const { getDb } = await import("../src/lib/db/client");
  const { seed, DEMO } = await import("../src/lib/db/seed");
  const s = await import("../src/lib/db/schema");
  const { buildWebhook } = await import("../src/lib/channels/whatsapp/parse");
  const { signBody } = await import("../src/lib/channels/whatsapp/signature");
  const { receiveWebhook } = await import("../src/lib/webhook");
  const { drainLead } = await import("../src/lib/jobs/queue");
  const { env } = await import("../src/lib/env");
  const { hasEmoji, hasConsent, sentences, questionCount } = await import("../src/lib/agents/guardrails");
  const { extractAmounts, detectLanguage, pidginHits } = await import("../src/lib/agents/understand");
  const { spentTotal } = await import("../src/lib/llm/budget");

  // EVAL_CLOCK_OFFSET_HOURS shifts the clock to test time-of-day edge cases.
  const { advanceClock } = await import("../src/lib/clock");
  if (process.env.EVAL_CLOCK_OFFSET_HOURS) advanceClock(Number(process.env.EVAL_CLOCK_OFFSET_HOURS) * 3600_000);
  const db = await getDb();
  const { orgId } = await seed(db);
  const listings = await db.select().from(s.listings).where(eq(s.listings.org_id, orgId));
  const known = new Set(listings.flatMap((l) => [l.price_amount, l.service_charge ?? -1]));

  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "cases");
  const cases: Case[] = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  const results: { name: string; fails: string[] }[] = [];
  let needsChecked = 0;
  let needsCorrect = 0;

  for (const c of cases) {
    const fails: string[] = [];
    let leadId: string | null = null;
    let lastOut: Message[] = [];
    const turnsOut: Message[][] = [];
    for (const t of c.turns) {
      const message = t.text ? { type: "text" as const, text: t.text } : t.reply ? { type: (t.reply.startsWith("pick:") ? "list_reply" : "button_reply") as "list_reply" | "button_reply", id: t.reply, title: t.reply } : { type: "audio" as const };
      const body = JSON.stringify(buildWebhook({ phoneNumberId: DEMO.phoneNumberId, from: c.phone, name: c.profile_name || undefined, id: `wamid.EVAL${crypto.randomUUID()}`, message }));
      const r = await receiveWebhook(body, signBody(env().webhookSecret, body));
      const st = r.stored[0];
      if (!st) { fails.push("webhook not stored"); break; }
      leadId = st.leadId;
      const [inMsg] = await db.select().from(s.messages).where(eq(s.messages.id, st.messageId));
      await drainLead(st.leadId);
      lastOut = await db.select().from(s.messages).where(and(eq(s.messages.lead_id, st.leadId), eq(s.messages.direction, "out"), gt(s.messages.seq, inMsg.seq))).orderBy(s.messages.seq);
      turnsOut.push(lastOut);
    }
    if (!leadId) { results.push({ name: c.name, fails }); continue; }
    const [lead] = await db.select().from(s.leads).where(eq(s.leads.id, leadId));
    const all = turnsOut.flat();
    const aiText = all.filter((m) => m.author.startsWith("ai:") && !["image", "location", "template"].includes(m.type));
    const e = c.expect;

    // ---- universal checks ----
    const first = all.find((m) => m.author.startsWith("ai:"));
    if (first && !hasConsent(first.body)) fails.push("consent notice missing in first reply");
    for (const m of aiText) {
      if (hasEmoji(m.body)) fails.push(`emoji: "${m.body.slice(0, 50)}"`);
      if (m.body.includes("!")) fails.push(`exclamation: "${m.body.slice(0, 50)}"`);
      if (questionCount(m.body) > 2) fails.push(`more than 2 questions: "${m.body.slice(0, 60)}"`);
    }
    const seen = new Set<string>();
    for (const m of aiText) for (const sn of sentences(m.body)) { if (seen.has(sn)) fails.push(`repeated sentence: "${sn.slice(0, 50)}"`); seen.add(sn); }
    const stated = new Set(c.turns.flatMap((t) => (t.text ? extractAmounts(t.text) : [])));
    for (const m of all.filter((x) => x.author.startsWith("ai:"))) {
      // captions carry code-computed differences ("₦500k under budget"); check the price lines only
      const text = m.type === "image" ? m.body.split("\n")[1] ?? "" : m.body;
      for (const a of extractAmounts(text)) if (!known.has(a) && !stated.has(a)) fails.push(`invented price ₦${a.toLocaleString()} in "${text.slice(0, 60)}"`);
    }

    // ---- case expectations ----
    if (e.needs) {
      for (const [k, v] of Object.entries(e.needs)) {
        needsChecked++;
        const got = (lead.needs as Record<string, unknown>)[k];
        const ok = Array.isArray(v) ? Array.isArray(got) && v.every((x) => (got as unknown[]).includes(x)) : got === v;
        if (ok) needsCorrect++; else fails.push(`needs.${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(got)}`);
      }
    }
    if (e.stage) { const ok = Array.isArray(e.stage) ? (e.stage as string[]).includes(lead.stage) : lead.stage === e.stage; if (!ok) fails.push(`stage: expected ${e.stage}, got ${lead.stage}`); }
    if (e.language && lead.language !== e.language) fails.push(`language: expected ${e.language}, got ${lead.language}`);
    if (e.temperature && lead.temperature !== e.temperature) fails.push(`temperature: expected ${e.temperature}, got ${lead.temperature}`);
    for (const k of ["ai_paused", "needs_human", "spam"] as const) if (e[k] !== undefined && lead[k] !== e[k]) fails.push(`${k}: expected ${e[k]}, got ${lead[k]}`);
    if (e.opted_out && !lead.opted_out_at) fails.push("not opted out");
    if (e.source_listing && lead.source.listing_ref !== e.source_listing) fails.push(`source listing: got ${lead.source.listing_ref}`);
    const matchCount = (await db.select().from(s.matches).where(eq(s.matches.lead_id, leadId))).length;
    if (typeof e.min_matches === "number" && matchCount < e.min_matches) fails.push(`matches: expected >= ${e.min_matches}, got ${matchCount}`);
    if (typeof e.max_matches === "number" && matchCount > e.max_matches) fails.push(`matches: expected <= ${e.max_matches}, got ${matchCount}`);
    const vs = await db.select().from(s.viewings).where(eq(s.viewings.lead_id, leadId));
    if (e.viewing && !vs.some((v) => v.status === "confirmed")) fails.push("no confirmed viewing");
    if (typeof e.cancelled_viewings === "number" && vs.filter((v) => v.status === "cancelled").length !== e.cancelled_viewings) fails.push("cancelled viewing count");
    if (e.silent_last_turn && lastOut.length) fails.push(`expected silence on the last turn, got: "${lastOut[0].body.slice(0, 60)}"`);
    const lastText = lastOut.map((m) => m.body).join(" ");
    if (e.reply_matches && !new RegExp(String(e.reply_matches), "i").test(turnsOut.flat().map((m) => m.body).join(" "))) fails.push(`reply should match /${e.reply_matches}/`);
    if (e.reply_not_matches && new RegExp(String(e.reply_not_matches), "i").test(aiText.map((m) => m.body).join(" "))) fails.push(`reply must not match /${e.reply_not_matches}/`);
    if (e.first_reply_matches && !new RegExp(String(e.first_reply_matches), "i").test(turnsOut[0]?.[0]?.body ?? "")) fails.push(`first reply should match /${e.first_reply_matches}/`);
    if (e.reply_language === "pcm") {
      const replies = aiText.filter((m) => m.type === "text");
      const last = replies.at(-1)?.body ?? lastText;
      if (detectLanguage(last).language !== "pcm" && pidginHits(last) < 1) fails.push(`last reply is not Pidgin: "${last.slice(0, 60)}"`);
    }
    results.push({ name: c.name, fails: [...new Set(fails)] });
  }

  const passed = results.filter((r) => !r.fails.length).length;
  for (const r of results) {
    console.log(`${r.fails.length ? "FAIL" : "pass"}  ${r.name}`);
    for (const f of r.fails) console.log(`        - ${f}`);
  }
  const cost = await spentTotal(orgId);
  console.log(`\n${passed}/${results.length} cases passed · needs extraction ${needsCorrect}/${needsChecked} (${Math.round((needsCorrect / Math.max(1, needsChecked)) * 100)}%) · mode ${env().LLM_MODE} · AI cost $${cost.usd.toFixed(4)}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
