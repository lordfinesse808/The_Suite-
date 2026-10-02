# Lean Beta Build Spec ($30 budget): AI Real Estate Lead System

> **How to use this file**
> 1. **Prep week (free, before you pay for anything).** Do every item in section 12. Paying for Claude Pro only after prep means none of the paid month is spent waiting on accounts or decisions.
> 2. Subscribe to Claude Pro ($20). Create an empty GitHub repo, save this file at its root as `BUILD_SPEC.md`, open Claude Code in that folder, and paste the kickoff message below.
> 3. Run one milestone per session (section 10). At the start of each session, paste the "Resume" message.
> 4. Add $10 of Anthropic API credit only at milestone L9, when testers start chatting. Until then everything runs on mocks and costs nothing.
>
> The full-product spec (`CLAUDE_CODE_BUILD_PROMPT.md`) is the long-term target. This file is the smallest slice of it that can be tested by real people.

---

## Kickoff message (first session)

```
Read BUILD_SPEC.md in full. It is the source of truth.

We are building a lean beta on a $30 total budget, so:
- Use only the free tiers listed in section 4. Never add a paid service or a new dependency that needs an account without asking me.
- Build mock-first: every external service has a mock adapter, and mocks are on by default. The app must run end to end with no real credentials.
- Work through the milestones in section 10 in order, one per session. Start each milestone with a short plan (10 lines at most), then build, then run lint, typecheck and tests, and fix any failures.
- After each milestone, update PROGRESS.md with: what was built, how to try it, open issues, and the next milestone. Then commit.
- Be economical with usage: make small, focused changes; don't print large files or logs; don't rewrite files that don't need to change.

Start with milestone L0.
```

## Resume message (every later session)

```
Read BUILD_SPEC.md sections 1–4 and PROGRESS.md. Continue with the next unfinished milestone in section 10. Same rules as before: plan briefly, build, test, update PROGRESS.md, commit.
```

---

## 1. What the beta must do

A Nigerian estate agent connects WhatsApp, uploads their listings and sets viewing hours. When a lead messages them on WhatsApp in English or Nigerian Pidgin:

1. **Qualifier:** chats naturally, captures budget, area, property type, bedrooms and move-in date, and scores the lead.
2. **Matchmaker:** sends 3–5 matching listings with a photo and a one-line reason each.
3. **Scheduler:** offers viewing slots, books one, and sends reminders.
4. **Follow-up writer:** drafts a follow-up when a lead goes quiet. The agent approves it before it is sent.

The agent sees every chat in a mobile-friendly inbox and can take over at any moment.

**Beta done when:**

- [ ] Everything above works in mock mode, using the built-in WhatsApp simulator.
- [ ] With live keys, 5 testers (the Meta test number's limit) can complete the flow on real WhatsApp.
- [ ] A website can send leads in through a "Chat on WhatsApp" button or a simple form.
- [ ] Consent notice, STOP opt-out and lead deletion work.
- [ ] The mock-mode eval set passes (section 8).

## 2. Scope

| In the lean beta | Later, from the full spec |
| --- | --- |
| WhatsApp (Cloud API, Meta test number) | Embeddable website chat widget |
| Website: "Chat on WhatsApp" link builder + lead-form endpoint | Instagram, email channel |
| Qualifier, Matchmaker (filters only), Scheduler (own availability table), Follow-up drafts with manual approval | Meaning-based (vector) matching, Google Calendar sync, auto-send |
| English and Nigerian Pidgin | Yoruba, Hausa and Igbo at full quality, voice notes, inbox translation |
| One organisation per signup; roles Owner and Agent | Viewer role, super-admin console |
| Inbox, lead detail, listings (form + CSV), simple pipeline, settings | Reports, Business API, webhooks |
| Free "founding member" access | Billing, plans and limits, messaging wallet |

The full spec's data model and interfaces are the target. Name tables and modules the same way, so features can be added later without rewrites.

## 3. Conversation quality (English and Pidgin)

- **Language:** reply in the lead's language. Match their mix of English and Pidgin. Detect and store `leads.language` (`en-NG` or `pcm`).
- **Tone:** neutral, courteous and calm.
  - No emojis, no exclamation marks, no flattery, no fake enthusiasm.
  - Short, plain sentences, like a capable human assistant on WhatsApp.
  - At most 2 questions per message.
- **Not robotic:**
  - No canned reply strings in code. Generate every reply for its conversation.
  - Split each turn into two steps:
    - *understand*: structured extraction with tools and zod schemas
    - *respond*: natural reply generation
  - Before sending, compare the draft with the last 10 AI messages. If it repeats a sentence, regenerate once.
- **Accuracy:** answer the lead's actual question first.
  - Prices, fees and availability come only from listing data.
  - If something is unknown, say an agent will confirm. Never guess.
- **Other languages:** if a lead writes in Yoruba, Hausa, Igbo or another language, reply briefly in English or Pidgin, say a colleague will continue, and flag the lead for the human agent.
- **Consent:** the first reply must say that the lead's details will be saved and that they can reply STOP at any time. Write it naturally in the lead's language; a checker confirms both points are present.

## 4. Stack (free tiers only)

| Need | Choice | Notes |
| --- | --- | --- |
| App | One Next.js app (App Router, TypeScript strict), Tailwind, shadcn/ui; installable PWA | Dashboard, API routes, webhooks and the simulator all in one app |
| Hosting | Vercel Hobby (free) | Non-commercial only, so fine for a free beta; move to a paid plan before charging customers. Hobby cron runs only once a day, so don't use Vercel cron |
| Database, auth, files | Supabase free: Postgres, Supabase Auth (email + Google), Row Level Security, Storage for listing photos | Free projects pause after a week of inactivity; the minute job below keeps it active during the beta |
| Background jobs | A `jobs` table in Postgres + Supabase `pg_cron` + `pg_net` calling `POST /api/jobs/tick` (with a shared secret) every minute | Replaces Redis/BullMQ. Use `SELECT … FOR UPDATE SKIP LOCKED` to claim jobs |
| Fast webhook replies | Return 200 to WhatsApp at once, then process with Next.js `after()` | Idempotent on WhatsApp message id; Postgres advisory lock per lead so one lead's messages are handled in order |
| AI | Anthropic SDK, Claude Haiku 4.5 (`CLAUDE_MODEL_FAST`) for everything in the beta; prompt caching on | `CLAUDE_MODEL_SMART` exists in config but stays off to protect the $10 |
| WhatsApp | Meta WhatsApp Cloud API with the free test number (free messages to up to 5 recipient numbers) | |
| Email | None in the beta; agent alerts appear in-app (optional web push) | |
| Errors | Sentry free tier (optional; console in mock mode) | |
| Tests | Vitest; Playwright for 2–3 key flows | |
| Code and CI | GitHub free + GitHub Actions (lint, typecheck, test) | |

No Redis, no separate worker, no paid hosting, no domain (use the `vercel.app` address).

## 5. Data model (Supabase, RLS on every table by `org_id`)

- `organisations`: name, areas_served, tone_notes, office_hours, timezone (`Africa/Lagos`), founding_member
- `memberships`: user_id, org_id, role (`owner` | `agent`)
- `whatsapp_accounts`: phone_number_id, waba_id, display_number, access_token_encrypted
- `listings`:
  - ref_code (`LST-1042`), title, purpose (`rent` | `sale` | `shortlet`), property_type, bedrooms
  - price_amount, price_period (`year` | `month` | `night` | `total`), area, city, features[], description
  - status (`available` | `taken`), photos[] (Storage paths)
- `leads`:
  - phone (E.164), name, language, stage, score, temperature
  - needs jsonb (purpose, budget_max, areas[], property_type, bedrooms_min, move_in_by, must_haves[])
  - source (listing_ref, page, utm), ai_paused, consent_at, opted_out_at, last_inbound_at
- `messages`: lead_id, direction, type, body, payload, author (`lead` | `ai:<agent>` | `user:<id>`), wa_message_id (unique), status
- `matches`: lead_id, listing_id, rank, reason
- `drafts`: lead_id, body, trigger, status (`pending` | `approved` | `sent` | `rejected` | `expired`), approved_by
- `availability`: agent_id, weekday, start_time, end_time, buffer_minutes (default 45), max_per_day
- `viewings`: lead_id, listing_id, agent_id, start_at, status (`confirmed` | `cancelled` | `attended` | `no_show`)
- `jobs`: type, run_at, payload, status, attempts
- `ai_runs`: agent, model, input_tokens, output_tokens, cache_read_tokens, cost_usd, created_at
- `audit_log`

**Lead stages:** `new → qualifying → qualified → shortlisted → viewing_booked → viewed → won | lost`

## 6. Agents (lean versions)

- **Orchestrator:** loads the lead and its last 20 messages, picks the agent by stage, runs *understand* then *respond*, applies the checks in section 3, and sends through one `sendMessage()` function. That function enforces opt-out, the 24-hour window and logging.
- **Qualifier:**
  - tools: `update_lead_needs`, `set_contact`, `request_human`, `mark_spam`
  - the score is computed in code from the captured fields, using the rubric in the full spec
  - hand off to the Matchmaker when purpose, budget, area and bedrooms or type are known
- **Matchmaker:**
  - SQL filters: available listings, purpose, price ≤ budget +10%, bedrooms, areas plus a small neighbouring-areas map for Lagos and Abuja
  - the model picks 3–5 and writes a reason for each
  - sent as WhatsApp image messages with captions, or an interactive list
- **Scheduler:**
  - offers 3 slots from `availability` minus existing viewings, as WhatsApp interactive buttons
  - books the viewing and sends the address
  - jobs send reminders 24 hours and 2 hours before
  - the agent gets an "Add to Google Calendar" link (no OAuth needed)
- **Follow-up writer:**
  - a job checks for leads silent for 24 hours, then 72 hours (at most 2 touches)
  - it creates a draft; the agent approves it in the inbox
  - inside the 24-hour window, the draft is sent as free text; outside it, as an approved template (`follow_up_checkin`)
- **Human takeover:** a toggle in the chat sets `ai_paused`. The AI stays silent until the agent resumes it.

## 7. WhatsApp and website

**WhatsApp**

- Webhook `GET`/`POST /api/webhooks/whatsapp`:
  - verify `hub.verify_token`
  - check `X-Hub-Signature-256` with the app secret
  - route each event to its org by `phone_number_id`
- Handle text, interactive replies, location and images. For audio, reply that voice notes are coming soon and ask for text.
- Opt-out: STOP (or a clear request to stop) sets `opted_out_at`, sends one confirmation and blocks all further outbound messages.
- Ship two templates to submit later: `viewing_reminder` and `follow_up_checkin`.
- **Simulator** at `/dev/simulator` (only when `MOCK_WHATSAPP=true`):
  - a WhatsApp-style page that sends correctly signed webhooks
  - shows replies, buttons, lists, images and location
  - supports up to 3 fake phones side by side

**Website (zero-cost integration)**

- **Link builder** in Settings → Website: per listing, a `https://wa.me/<number>?text=Hi, I'm interested in LST-1042` link and a copy-paste HTML button. The Qualifier detects the ref code and attaches that listing to the lead.
- **Lead form endpoint** `POST /api/public/leads`:
  - authenticated with the org's public key plus an allowed-origins check, and rate-limited
  - body: name, phone, message, listing_ref, consent
  - creates the lead and, if allowed, starts the WhatsApp conversation with the `follow_up_checkin` template
  - include a copy-paste HTML form example and a WordPress note in `docs/website.md`

## 8. Mocks, evals and the $10 guard

**Mocks**

| Flag (default `true`) | Mock |
| --- | --- |
| `MOCK_WHATSAPP` | Simulator page; outbound messages stored and shown instead of sent |
| `LLM_MODE=mock` | Scripted replies and tool calls from `fixtures/llm/` in English and Pidgin, keyed by conversation step |
| `MOCK_STORAGE` | Local `public/uploads` instead of Supabase Storage (optional) |

**Evals**

- `evals/` holds 15 scripted conversations: Lagos rent, Abuja sale, short-let, Pidgin, a code-switching mix, a time-waster, a scam attempt, a prompt-injection attempt, a human takeover, a reschedule, and a lead writing in Yoruba (expected outcome: handed to a human).
- `pnpm eval` runs them in mock mode in CI.
- `LLM_MODE=live pnpm eval` runs them once against the real model. Expected cost: under $0.50.
- Checks:
  - needs extracted correctly
  - zero invented prices
  - zero emojis and exclamation marks
  - no repeated sentences
  - consent notice present in the first reply

**$10 guard** (live mode)

- Log every AI call's tokens and cost to `ai_runs`.
- Hard daily cap `AI_DAILY_BUDGET_USD` (default 0.50): when it is reached, the AI pauses, new messages get a short holding reply, and the agent is alerted.
- Show the total spent so far in Settings.
- Cap replies at 300 output tokens.

## 9. Environment variables (`.env.example`)

```
APP_URL
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
ENCRYPTION_KEY, JOBS_TICK_SECRET
LLM_MODE=mock, ANTHROPIC_API_KEY, CLAUDE_MODEL_FAST=claude-haiku-4-5, CLAUDE_MODEL_SMART, AI_DAILY_BUDGET_USD=0.50
MOCK_WHATSAPP=true, META_APP_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_GRAPH_VERSION
MOCK_STORAGE=true
SENTRY_DSN (optional)
```

Check current Claude model IDs in Anthropic's docs before setting defaults.

## 10. Milestones (one per session; estimates assume about 5 hours a day)

| # | Milestone | Days | Done when |
| --- | --- | --- | --- |
| L0 | Next.js app, Tailwind/shadcn, Supabase project wiring, env loader (zod), mock framework, GitHub Actions CI | 1.5 | App runs locally with mocks; CI green |
| L1 | Schema + migrations, RLS policies, Supabase Auth, signup creates an org, roles, seed (demo org + 30 fictional Lagos/Abuja listings) | 2 | Cross-org access test fails closed; seed loads |
| L2 | WhatsApp adapter, webhook route, signature check, `sendMessage()` policy layer, simulator page, jobs table + tick endpoint | 3 | A simulator message is stored and answered by an echo reply |
| L3 | Orchestrator + Qualifier: understand/respond split, scoring, consent, STOP, takeover, English + Pidgin, anti-repetition check | 4 | A lead is qualified and scored in the simulator, in English and in Pidgin |
| L4 | Listings: form, CSV import, photos; Matchmaker with filters and reasons; WhatsApp image/list replies | 3 | Lead receives 3–5 relevant listings |
| L5 | Scheduler: availability settings, slot offer, booking, reminders via jobs, reschedule/cancel, calendar link | 3 | Viewing booked; reminders fire in a time-shifted test |
| L6 | Follow-up drafts + approvals in the inbox, 24-hour window rule, templates prepared | 2 | Quiet lead produces a draft; approve sends it |
| L7 | Inbox, lead detail, simple pipeline, settings, mobile layout, PWA, website link builder + lead form endpoint | 4 | Agent can run the whole flow from a phone |
| L8 | Evals, cost guard, error handling, delete-lead, audit log, Playwright tests, `docs/` (setup, website, going live) | 2.5 | `pnpm eval` passes in mock mode; e2e tests pass |
| L9 | Deploy to Vercel + Supabase, pg_cron tick, switch to live keys, Meta test number, 1 live eval run, onboard first testers | 2 | 5 testers complete the flow on real WhatsApp |
| | **Total** | **27 days** | |

## 11. Working with Claude Pro limits

- Claude Pro usage resets every 5 hours and also has a weekly limit. On heavy coding days the limit may be reached before the 5 hours are up. Use that time to review code, test in the simulator and write fixtures.
- Keep sessions small: one milestone, or half of one. Start long milestones (L3, L7) in a fresh session.
- Keep `PROGRESS.md` current so a new session can pick up without re-reading the whole codebase.
- Avoid asking for whole-file rewrites, huge test outputs or broad "review everything" requests.

## 12. Prep week (free, before subscribing)

- [ ] GitHub account and empty repo.
- [ ] Supabase account and project (free); turn on `pg_cron` and `pg_net`.
- [ ] Vercel account (Hobby).
- [ ] Meta developer account and app with WhatsApp added; note the test number and add up to 5 tester phone numbers.
- [ ] Anthropic Console account (add the $10 credit only at L9).
- [ ] Sketch the key screens (inbox, lead detail, listings, settings) in Figma or on paper.
- [ ] Write 10 example chats in English and Pidgin showing the tone you want (these become `fixtures/llm/` and eval cases).
- [ ] Prepare a CSV of 20–30 real or realistic listings from one agent you know.
- [ ] Line up 5 testers: ideally 2–3 agents plus friends playing leads.

## 13. Budget

| Item | Cost |
| --- | --- |
| Claude Pro, one month (Claude Code included) | $20 |
| Anthropic API credit for the live beta (Haiku, with a $0.50/day cap; roughly 100 test leads) | $10 |
| Supabase, Vercel, GitHub, Meta test number, Sentry | $0 |
| **Total** | **$30** |

If the build runs past the Pro month, a second month costs another $20. Hold scope fixed to avoid that.
