# Progress

Source of truth: `docs/LEAN_BETA_BUILD_PROMPT.md` (lean $30 beta), with names and data model aligned to `BUILD_SPEC.md` (full product) so features can be added without rewrites.

## Milestones

| # | Milestone | Status | Proof |
| --- | --- | --- | --- |
| L0 | Next.js app, Tailwind, env loader (zod), mock framework, CI | Done | `pnpm dev` runs with no keys; `.github/workflows/ci.yml` runs lint, typecheck, test, eval, build, e2e |
| L1 | Schema + migrations, RLS, auth, signup creates an org, roles, seed | Done | `tests/tenancy.test.ts` (RLS fails closed for `app_user`); seed: Adaeze Homes, 30 listings, 12 leads |
| L2 | WhatsApp adapter, webhook + signature, `sendMessage()` policy layer, simulator, jobs + tick | Done | `tests/webhook.test.ts`; `/dev/simulator` |
| L3 | Orchestrator + Qualifier: understand/respond split, scoring, consent, STOP, takeover, English + Pidgin, anti-repetition | Done | `tests/flows.test.ts`, evals 01, 04, 05, 08, 09, 13 |
| L4 | Listings (form, CSV, paste reader, photos), Matchmaker, image + list replies | Done | evals 01–03, 12, 15 |
| L5 | Scheduler: hours, slot offer, booking, reminders, reschedule/cancel, calendar link | Done | time-shifted reminder test; eval 10 |
| L6 | Follow-up drafts + approvals, 24-hour window rule, templates | Done | follow-up tests (template outside the window, text inside) |
| L7 | Inbox, lead detail, pipeline, settings, mobile, PWA, website link builder + lead form | Done | `e2e/agent.spec.ts` (desktop + phone) |
| L8 | Evals, cost guard, error handling, delete-lead, audit log, Playwright, docs | Done | `pnpm eval` 15/15; `tests/budget.test.ts`; `docs/` |
| L9 | Deploy to Vercel + Supabase, pg_cron, live keys, Meta test number, live eval, testers | **Next** — needs your accounts | Step-by-step in `docs/going-live.md` Phase 1 |

Quality gates at the last commit: lint clean, typecheck clean, **56/56** unit and integration tests, **15/15** evals (needs extraction 100%, zero invented prices), **4/4** Playwright flows, production build succeeds.

## How to try it

```bash
pnpm install && pnpm dev
```
Sign in at http://localhost:3000 (`adaeze@demo.ile` / `demo1234`), open http://localhost:3000/dev/simulator in another tab and message as a lead. Scenarios are listed in `docs/setup.md`.

## Decisions and deviations from the spec

- **Database locally**: embedded PGlite instead of a Supabase local stack, so the prototype needs no Docker or account. The same SQL migrations run on Supabase.
- **Auth**: a small built-in session system (scrypt passwords, httpOnly cookie, `sessions` table) instead of Supabase Auth, to keep mock mode account-free. Swap is listed in going-live §2.3. Roles: owner and agent.
- **UI kit**: components are hand-built in the ilé artboard style rather than generated with the shadcn CLI.
- **Understand step (live)**: Claude structured output (`messages.parse` + zod) rather than tool calls; the results are applied by the same code paths the tools would call (`update_lead_needs` → `mergeNeeds`, `set_contact`, `request_human`, `mark_spam`).
- **Matchmaker reasons**: ranking and the one-line reasons are computed in code from listing data (no hallucination risk, no extra tokens). The model writes the surrounding message. A model re-rank can be added when the smarter model is switched on.
- **Live updates**: dashboard pages refresh every 3–10 seconds (server components) instead of Server-Sent Events.
- **Lead routing**: round-robin on creation, then reassigned to the agent who owns the best-matching listing (area-based routing, e.g. Abuja listings → Halima).
- **Signup name**: a name the lead states ("my name is Chiamaka Eze") replaces the WhatsApp profile name.

## Open issues

1. **Live LLM path not yet exercised** against the real API (no key in the build environment). Run `LLM_MODE=live pnpm eval` once (< $0.50) at L9 and tune `src/lib/llm/prompts.ts` if any check fails.
2. **Cloud API adapter not yet tested against Meta** (mocked in CI). First real send happens at L9 with the test number.
3. Listing photos: uploads work in mock storage; Supabase Storage upload is written but untested. Without real photos, live mode sends listing cards as text (WhatsApp rejects SVG placeholders).
4. Rate limiting on the lead form is in-memory (per server instance). Fine for the beta; use Upstash Redis before scale.
5. No burst debounce: two quick messages get two replies (processed in order).
6. The app connects to Postgres as the owner role, so RLS is a tested second wall but not enforced at runtime. Enforcing it means setting `app.org_id` per request with the `app_user` role (going-live §2.3).
7. Password reset and email invitations are not built (agents get a temporary password from the owner).
8. Next.js is pinned to 15.5 (stable `after()`), TypeScript to 5.9 (Next 15 config loader).

## Next milestone

**L9 — live beta.** Follow `docs/going-live.md` Phase 1: Supabase project + `pnpm db:migrate`, Vercel env vars, Meta test number + webhook, `supabase/cron.sql`, two templates, one live eval run, then onboard 5 testers.
