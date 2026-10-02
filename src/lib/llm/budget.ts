// The daily AI budget guard and ai_runs logging.
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import * as s from "../db/schema";
import { env } from "../env";
import { now } from "../clock";
import { BudgetExceededError } from "./types";

function startOfLagosDay(d: Date) {
  const lagos = new Date(d.getTime() + 3600_000);
  return new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate()) - 3600_000);
}

export async function spentToday(orgId: string | null): Promise<number> {
  const db = await getDb();
  const since = startOfLagosDay(now());
  const where = orgId ? and(eq(s.aiRuns.org_id, orgId), gte(s.aiRuns.created_at, since)) : gte(s.aiRuns.created_at, since);
  const [r] = await db.select({ total: sql<string>`coalesce(sum(${s.aiRuns.cost_usd}), 0)` }).from(s.aiRuns).where(where);
  return Number(r?.total ?? 0);
}

export async function spentTotal(orgId: string): Promise<{ usd: number; runs: number; inputTokens: number; outputTokens: number; cacheRead: number }> {
  const db = await getDb();
  const [r] = await db
    .select({
      usd: sql<string>`coalesce(sum(${s.aiRuns.cost_usd}), 0)`,
      runs: sql<number>`count(*)::int`,
      inp: sql<string>`coalesce(sum(${s.aiRuns.input_tokens}), 0)`,
      out: sql<string>`coalesce(sum(${s.aiRuns.output_tokens}), 0)`,
      cr: sql<string>`coalesce(sum(${s.aiRuns.cache_read_tokens}), 0)`,
    })
    .from(s.aiRuns)
    .where(eq(s.aiRuns.org_id, orgId));
  return { usd: Number(r.usd), runs: r.runs, inputTokens: Number(r.inp), outputTokens: Number(r.out), cacheRead: Number(r.cr) };
}

export async function dailyCap(orgId: string): Promise<number> {
  const db = await getDb();
  const [o] = await db.select({ cap: s.organisations.ai_daily_budget_usd }).from(s.organisations).where(eq(s.organisations.id, orgId));
  return o?.cap ?? env().AI_DAILY_BUDGET_USD;
}

/** Throws BudgetExceededError when the org (or the whole install) is over its daily cap. */
export async function assertBudget(orgId: string) {
  const cap = await dailyCap(orgId);
  const spent = await spentToday(null); // the $10 budget is shared by the whole beta install
  if (spent >= cap) throw new BudgetExceededError(spent, cap);
}

export async function recordRun(r: {
  orgId: string | null; leadId: string | null; agent: string; step: string; model: string; promptVersion: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null }; costUsd: number; latencyMs: number;
}) {
  const db = await getDb();
  await db.insert(s.aiRuns).values({
    org_id: r.orgId, lead_id: r.leadId, agent: r.agent, step: r.step, model: r.model, prompt_version: r.promptVersion,
    input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens, cache_read_tokens: r.usage.cache_read_input_tokens ?? 0,
    cost_usd: r.costUsd, latency_ms: r.latencyMs, created_at: now(),
  });
}
