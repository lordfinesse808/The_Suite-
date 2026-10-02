// Postgres-backed job queue: a `jobs` table claimed with FOR UPDATE SKIP LOCKED.
// Triggered every minute by pg_cron + pg_net (production) or an in-process
// ticker (local dev), via POST /api/jobs/tick.
import { and, eq, sql } from "drizzle-orm";
import { getDb, rows } from "../db/client";
import * as s from "../db/schema";
import type { Job } from "../db/schema";
import { now } from "../clock";
import { handlers } from "./handlers";
import { expireDrafts, scanSilentLeads } from "../agents/followup";

const MAX_ATTEMPTS = 5;

export async function claimDueJobs(limit = 20, filter?: { leadId?: string }): Promise<Job[]> {
  const db = await getDb();
  const t = now();
  const leadCond = filter?.leadId ? sql`and payload->>'lead_id' = ${filter.leadId}` : sql``;
  const res = await db.execute(sql`
    update jobs set status = 'running', attempts = attempts + 1
    where id in (
      select id from jobs
      where status = 'queued' and run_at <= ${t.toISOString()}::timestamptz ${leadCond}
      order by run_at, created_at
      for update skip locked
      limit ${limit}
    )
    returning *`);
  return rows<Record<string, unknown>>(res).map((r) => ({
    id: r.id as string, org_id: r.org_id as string | null, type: r.type as string, run_at: new Date(r.run_at as string),
    payload: (typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload) as Record<string, unknown>,
    status: r.status as Job["status"], attempts: Number(r.attempts), last_error: r.last_error as string | null, dedupe_key: r.dedupe_key as string | null,
    created_at: new Date(r.created_at as string),
  })).sort((a, b) => a.run_at.getTime() - b.run_at.getTime() || a.created_at.getTime() - b.created_at.getTime());
}

export async function runJob(job: Job) {
  const db = await getDb();
  const h = handlers[job.type];
  try {
    if (!h) throw new Error(`no handler for ${job.type}`);
    await h(job);
    await db.update(s.jobs).set({ status: "done", last_error: null }).where(eq(s.jobs.id, job.id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[jobs] ${job.type} failed (attempt ${job.attempts})`, msg);
    const retry = job.attempts < MAX_ATTEMPTS;
    await db
      .update(s.jobs)
      .set({ status: retry ? "queued" : "failed", last_error: msg.slice(0, 500), run_at: new Date(now().getTime() + 2 ** job.attempts * 15_000) })
      .where(and(eq(s.jobs.id, job.id)));
  }
}

let lastScan = 0;

/** One tick: run due jobs, then the follow-up scan and draft expiry (at most once a minute). */
export async function tick(opts: { scan?: boolean } = {}) {
  const jobs = await claimDueJobs(25);
  for (const j of jobs) await runJob(j);
  let drafts = 0;
  let expired = 0;
  const t = Date.now();
  if (opts.scan || t - lastScan > 55_000) {
    lastScan = t;
    drafts = await scanSilentLeads();
    expired = await expireDrafts();
  }
  return { ran: jobs.length, drafts, expired };
}

/** Run this lead's due jobs right away (called after a webhook returns 200). */
export async function drainLead(leadId: string) {
  for (let i = 0; i < 5; i++) {
    const jobs = await claimDueJobs(10, { leadId });
    if (!jobs.length) return;
    for (const j of jobs) await runJob(j);
  }
}
