# Architecture (lean beta)

One Next.js app (App Router, TypeScript strict) holds the dashboard, API routes, webhooks and the simulator. Postgres holds everything, including the job queue.

```
WhatsApp Cloud API ──► POST /api/webhooks/whatsapp ──► verify X-Hub-Signature-256
Website form ───────► POST /api/public/leads            │ store message (unique wa_message_id)
                                                         │ enqueue job process_inbound
                                                         ▼ return 200, then after() drains the lead's jobs
                                         Orchestrator (per-lead lock)
                                         1. understand  (LLM structured output or rules)
                                         2. route by stage + intent
                                            Qualifier → Matchmaker → Scheduler ; Follow-up writer (jobs)
                                         3. respond     (LLM writes words for a code-decided plan)
                                         4. guardrails  (tone, prices, repetition, consent) → regenerate once → safe fallback
                                         5. sendMessage() → opt-out, 24h window, log, audit → WhatsApp adapter
pg_cron (every minute) ──► POST /api/jobs/tick ──► reminders, follow-up scan, draft expiry, retries
```

## Key decisions

- **Code decides facts, the model decides words.** The orchestrator builds a `ReplyPlan` (moves such as `ask budget`, `answer price = ₦5,500,000 / yr`). The model only phrases it. Every naira figure in a reply is checked against listing data and the lead's own words; an invented price triggers a regenerate and then a deterministic fallback. This is how "zero invented prices" holds even with a small, cheap model.
- **Mock-first.** `LLM_MODE=mock` uses `understandRules()` (also the live fallback) and composes replies from `fixtures/llm/phrases.json`, never repeating a sentence used in the last 10 AI messages. Live mode uses Claude Haiku 4.5 with prompt caching and a 300-token reply cap.
- **One database, two drivers.** The same SQL migrations run on PGlite (local, tests, evals) and Supabase Postgres (production). Drizzle provides typed queries.
- **Tenancy.** Every query takes `org_id` explicitly (first wall). RLS policies on every tenant table use `app.org_id` (second wall), proven by `tests/tenancy.test.ts` with the `app_user` role.
- **Jobs in Postgres.** `jobs` rows are claimed with `FOR UPDATE SKIP LOCKED`, retried with backoff up to 5 times. No Redis, no worker.
- **Ordering.** One lead's messages are processed in order: an in-process lock, plus a Postgres advisory lock when running on real Postgres across instances.

## Code map

| Path | What |
| --- | --- |
| `src/lib/agents/orchestrator.ts` | State machine, routing, reply writing, Qualifier/Matchmaker/Scheduler turns |
| `src/lib/agents/understand.ts` | Extraction schema (zod) and the rule-based extractor (English + Pidgin, money, areas, intents, scam, injection, language) |
| `src/lib/agents/matchmaker.ts` | SQL filters (budget +10%, neighbouring areas), ranking and reasons |
| `src/lib/agents/scheduler.ts` | Free slots (hours, 45-min travel buffer, max a day), Google Calendar link |
| `src/lib/agents/followup.ts` | Silent-lead scan (24h, 72h, max 2 touches), drafts, approval (text vs template) |
| `src/lib/agents/guardrails.ts`, `scoring.ts`, `areas.ts` | Output checks, lead score rubric, Lagos/Abuja gazetteer |
| `src/lib/llm/` | `LLM` interface, mock composer, Anthropic adapter, prompts (versioned), budget guard |
| `src/lib/messaging/send.ts` | `sendMessage()` policy layer |
| `src/lib/channels/whatsapp/` | Webhook parsing, signatures, Cloud API + mock adapters, templates |
| `src/lib/jobs/` | Queue, tick, handlers (inbound, reminders, viewing follow-up) |
| `src/lib/db/` | Schema, migrations (SQL + RLS), client, seed |
| `src/app/(app)/` | Dashboard pages; `src/app/actions.ts` server actions |
| `src/app/api/` | Webhook, tick, public leads, export, dev simulator endpoints |
| `evals/`, `tests/`, `e2e/` | Eval set, Vitest, Playwright |
