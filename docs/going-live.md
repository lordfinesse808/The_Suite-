# Going live: from prototype to a product estate agents pay for

The prototype in this repo runs end to end on mocks. This document lists everything needed to go from there to (1) a **live beta** with 5 testers on real WhatsApp, on the $30 lean budget, and then (2) a **commercial launch** that agencies in Lagos and Abuja pay for. Each item has an owner type: **Code** (Claude Code / engineering), **Ops** (accounts, settings), **Legal**, or **Business**.

Order matters. Phase 1 needs no new code beyond configuration. Phase 2 is mostly code, described as milestones from the full spec (`BUILD_SPEC.md` §14).

---

## Phase 0 — Where the prototype stands

| Area | Status in the prototype |
| --- | --- |
| Four agents (Qualifier, Matchmaker, Scheduler, Follow-up writer) | Built. Mock LLM by default, Claude Haiku 4.5 adapter ready (`LLM_MODE=live`). |
| WhatsApp | Cloud API adapter, signed webhook, simulator. Mock by default. |
| Data | Postgres schema with RLS on every tenant table. Runs on embedded PGlite locally, Supabase in production. |
| Dashboard | Inbox, lead, pipeline, listings, approvals, viewings, reports, settings, setup wizard, mobile layout, PWA. |
| Website | `wa.me` link builder per listing, lead-form endpoint with key + origin check + rate limit. |
| Privacy | Consent notice on first reply, STOP/START, per-lead export and delete, audit log. |
| Cost guard | `ai_runs` logging, daily cap with holding replies. |
| Quality | 56 unit/integration tests, 15 eval conversations, 4 Playwright flows, CI. |

Known gaps are listed in `PROGRESS.md` → "Open issues".

---

## Phase 1 — Live beta on real WhatsApp (lean milestone L9, about 2 days, ~$10)

### 1.1 Accounts (Ops, free)
- [ ] **Supabase** project (free tier), region closest to Nigeria (`eu-west-2` London or `eu-central-1`). Enable `pg_cron` and `pg_net` (Database → Extensions).
- [ ] **Vercel** Hobby account, import this GitHub repo.
- [ ] **Meta for Developers**: create an app (type Business), add the **WhatsApp** product. Note the **test phone number ID**, **WABA ID**, and generate a temporary token; add up to **5 recipient numbers** (the testers).
- [ ] **Anthropic Console**: create an API key, add **$10** of credit, set a monthly spend limit of $10 in the Console as a second guard.

### 1.2 Database (Ops, 15 minutes)
```bash
# Supabase → Project settings → Database → Connection string (URI, "Session" pooler, port 5432)
DATABASE_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-eu-west-2.pooler.supabase.com:5432/postgres" pnpm db:migrate
DATABASE_URL="..." pnpm db:seed   # optional: demo data; skip for a clean tenant
```
The migration creates the `app_user` role and RLS policies. In Vercel, use the **Transaction pooler** URI (port 6543) as `DATABASE_URL`.

### 1.3 Vercel environment (Ops)
Set these in Vercel → Settings → Environment Variables (see `.env.example`):

| Variable | Value |
| --- | --- |
| `APP_URL` | `https://<project>.vercel.app` |
| `DATABASE_URL` | Supabase transaction pooler URI |
| `SESSION_SECRET`, `JOBS_TICK_SECRET` | `openssl rand -base64 32` each |
| `ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `MOCK_WHATSAPP` | `false` |
| `META_APP_SECRET` | Meta app → Settings → Basic → App secret |
| `WHATSAPP_VERIFY_TOKEN` | any random string you choose |
| `WHATSAPP_GRAPH_VERSION` | current Graph API version (check Meta's changelog) |
| `LLM_MODE` | `live` |
| `ANTHROPIC_API_KEY` | from the Console |
| `CLAUDE_MODEL_FAST` | `claude-haiku-4-5` |
| `AI_DAILY_BUDGET_USD` | `0.50` |
| `MOCK_STORAGE` | `true` for the beta (photos are optional); see 2.4 for Supabase Storage |

Redeploy after setting them.

### 1.4 Connect WhatsApp (Ops)
1. Meta app → WhatsApp → Configuration → Webhook: callback URL `https://<project>.vercel.app/api/webhooks/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`. Subscribe to the **messages** field.
2. Sign up in the app (`/signup`), then Settings → WhatsApp: enter the test **phone number ID**, **WABA ID**, display number and the access token (stored AES-256-GCM encrypted).
3. Replace the temporary token (24 hours) with a **System User permanent token**: Business Settings → Users → System users → add → assign the app and WABA → generate token with `whatsapp_business_messaging` and `whatsapp_business_management`.

### 1.5 Jobs tick (Ops)
Edit `supabase/cron.sql` with your URL and `JOBS_TICK_SECRET`, run it in the Supabase SQL editor. This fires reminders and follow-up scans every minute and keeps the free Supabase project from pausing. Vercel Hobby cron runs only daily, so do not use it.

### 1.6 Templates (Ops, approval takes minutes to 2 days)
WhatsApp Manager → Message templates → create both from Settings → WhatsApp in the app (category **Utility**, language English):
- `follow_up_checkin`: "Hello {{1}}, this is {{2}}. Following up on your property search: {{3}} Reply here to continue, or reply STOP to opt out."
- `viewing_reminder`: "Hello {{1}}, a reminder of your viewing of {{2}} on {{3}} with {{4}}. Reply 1 to confirm or 2 to reschedule. Reply STOP to opt out."

Without approved templates, follow-ups outside the 24-hour window and web-form first contact are blocked by `sendMessage()` (by design).

### 1.7 One live eval run (Code, < $0.50)
```bash
LLM_MODE=live ANTHROPIC_API_KEY=sk-ant-... pnpm eval
```
Read every reply. If a check fails (tone, invented price, repetition, consent), tune `src/lib/llm/prompts.ts` and re-run. Bump `PROMPT_VERSION` when prompts change.

### 1.8 Onboard testers (Business)
- 2–3 agents (one Lagos, one Abuja if possible) plus friends playing leads. Each agent: sign up, run the setup wizard, import 20–30 real listings (CSV template in Listings).
- Testers message the Meta test number. Script to try: English rent, Pidgin, short-let, a cheaper request, a booking, a reschedule, STOP.
- Watch AI spend in Settings → AI spend. At $0.50/day the $10 lasts ~20 days (~100 test leads at ~$0.03–0.05 each).

**Beta exit criteria** (`BUILD_SPEC` lean §1): 5 testers complete the flow on real WhatsApp; website form works; STOP and deletion work; evals pass in mock and once live.

---

## Phase 2 — Commercial launch (full spec, ~8–12 weeks of build)

Vercel Hobby is **non-commercial only**. Before charging anyone, every item marked **Required** must be done.

### 2.1 Legal and compliance (Legal) — Required
- [ ] **Register the business** with CAC (Ltd) and open a business bank account (needed for Meta verification and Paystack).
- [ ] **NDPA 2023 / NDPC**: register with the Nigeria Data Protection Commission as a data controller/processor of major importance if thresholds apply; appoint a **Data Protection Officer**; file the annual compliance audit through a licensed DPCO.
- [ ] **DPIA** (data protection impact assessment) for AI processing of lead conversations.
- [ ] **Cross-border transfer**: lead messages are processed by Anthropic (US) and stored in Supabase (EU/US region). Document the transfer basis (adequacy or standard contractual clauses) in the privacy policy and DPA.
- [ ] **Lawyer review** of `/privacy`, terms of service, and a Data Processing Addendum between you (processor) and each agency (controller).
- [ ] **Real-estate compliance**: Lagos State requires agents to be registered with **LASRERA**; show the agency's registration on its profile and never let the AI give legal advice on titles (already enforced by guardrails).
- [ ] **Consumer protection** (FCCPC): clear pricing, refund and cancellation terms for subscriptions.

### 2.2 Meta / WhatsApp production (Ops) — Required
- [ ] **Meta Business verification** (CAC certificate, utility bill, domain).
- [ ] Add a **real production number** per agency (or migrate their existing WhatsApp Business App number via coexistence, if available in your region).
- [ ] **Payment method** on the WABA for message fees. Service (customer-initiated) conversations are free; utility/marketing templates are charged per message — check Meta's current Nigeria rate card.
- [ ] Request **Advanced access** for `whatsapp_business_messaging` and `whatsapp_business_management` (App Review).
- [ ] Become a **Tech Provider** to offer **Embedded Signup** (agencies connect their own number in 3 clicks) — the full spec's `whatsapp_embedded_signup` flag.
- [ ] Display-name approval and **quality rating** monitoring (show it in Settings).

### 2.3 Infrastructure upgrades (Ops + Code) — Required
| Item | Choice | Indicative cost |
| --- | --- | --- |
| Hosting | Vercel Pro (commercial use, longer function timeouts, better cron) | $20/user/month |
| Database | Supabase Pro (no pausing, daily backups, PITR add-on) | $25/month |
| Domain + email | own domain, transactional email (Resend) with SPF/DKIM/DMARC | ~$15/year + $0–20/month |
| Errors | Sentry (set `SENTRY_DSN`; add `@sentry/nextjs`) | free–$26/month |
| LLM traces | Langfuse cloud or self-hosted, with phone numbers hashed | free tier |
| Uptime | Better Stack / UptimeRobot on `/login` and the webhook GET | free |
| Rate limiting | replace the in-memory limiter (`src/lib/ratelimit.ts`) with Upstash Redis | free tier |

Code changes:
- [ ] **Auth**: move from the built-in session table to Supabase Auth (email + Google) or Better Auth, add password reset, email verification and invitations by email. Map `auth.uid()` to `memberships` and set `app.org_id` per request so RLS is enforced by the database for the app role (today the app connects as the owner role and scopes in code; RLS is tested but bypassed by the service role).
- [ ] **Storage**: set `MOCK_STORAGE=false`, create a public `listing-photos` bucket in Supabase Storage; resize to JPEG ≤ 1600px before upload (WhatsApp rejects SVG and large images).
- [ ] **Burst handling**: debounce rapid multi-message bursts (2 seconds) before replying.
- [ ] **Dead-letter**: jobs that fail 5 times are marked `failed`; add an alert and a retry button in the dashboard.
- [ ] **Backups and restore drill**: test a PITR restore once before launch.
- [ ] **Staging environment**: second Supabase project + Vercel preview with mocks on.

### 2.4 Product features for a paid launch (Code — full spec milestones)
| Milestone | What | Why it matters for paying agencies |
| --- | --- | --- |
| M5+ | Google Calendar OAuth (free/busy + event creation) | Agents live in their calendar; today they get an "Add to Google Calendar" link |
| M4+ | Vector matching (pgvector + embeddings) for must-haves like "close to Lekki Toll Gate" | Better shortlists on large inventories |
| M7 | Embeddable website chat widget (Shadow DOM, < 60 KB) | Agencies with websites want in-page chat, not only `wa.me` links |
| M8 | Full onboarding wizard with "send yourself a test lead", web push notifications | Self-serve signup in under 30 minutes |
| M9 | **Billing with Paystack**: plans (Starter ₦49k, Pro ₦179k, Business ₦499k per month in the full spec), setup fees, usage caps with overage, prepaid **messaging wallet** for Meta fees | Revenue |
| M10 | Business API + outbound webhooks | Larger agencies and developers syncing CRMs and portals |
| M11 | Email channel, retention job (delete inactive leads after 24 months), data-request queue | Compliance at scale |
| M12 | Super-admin console, feature flags, design-partner invites, analytics events | Running the business |
| Later | Instagram DMs, Yoruba/Hausa/Igbo at full quality, voice-note transcription, portal feeds (PropertyPro, Nigeria Property Centre) | Lead volume and reach |

### 2.5 AI quality and cost (Code)
- [ ] Grow the eval set from 15 to 40+ real (anonymised) conversations from the beta; run nightly in live mode.
- [ ] Thresholds before launch: needs-extraction ≥ 90%, **0** invented prices, qualification in ≤ 8 turns for ≥ 85% of leads.
- [ ] Consider a smarter model (`CLAUDE_MODEL_SMART`) only for the Matchmaker's ranking and reasons once revenue covers it; keep Haiku for qualification.
- [ ] Target AI cost ≤ $0.10 per lead; per-tenant daily budgets (already supported via `organisations.ai_daily_budget_usd`).

### 2.6 Security checklist (Code) — Required
- [ ] Dependency scanning (GitHub Dependabot) and secret scanning on the repo.
- [ ] Rotate `ENCRYPTION_KEY` procedure (ciphertexts carry a `v1:` prefix to allow rotation).
- [ ] CSRF: server actions are same-origin; keep `sameSite=lax` cookies; add origin checks if any JSON endpoints accept cookies.
- [ ] Penetration test of the public lead endpoint and webhook.
- [ ] Remove or protect `/dev/*` (already returns 404 when `MOCK_WHATSAPP=false`).

### 2.7 Go-to-market (Business)
- [ ] 10 **design partners** (solo agents, an agency, a developer, a short-let operator) on a free 90-day plan.
- [ ] Weekly check-ins; track the beta metrics on the Reports page: median first reply < 15 s, ≥ 60% qualified without a human, ≥ 25% qualified-to-viewing, ≥ 80% show rate, ≥ 70% drafts sent unedited.
- [ ] Support channel (a WhatsApp number for agents), onboarding video in English and Pidgin, a one-page ROI story ("replied at 2 a.m., viewing booked by 2:10").
- [ ] Pricing test with design partners before switching on Paystack.

### 2.8 Launch-day runbook
See `docs/runbook.md`: health checks, what to do when the AI budget trips, when Meta rejects a template, when the quality rating drops, and how to restore the database.

---

## Monthly running cost estimate (commercial, 10 agencies, ~1,500 leads/month)

| Item | Estimate |
| --- | --- |
| Vercel Pro (1 seat) | $20 |
| Supabase Pro | $25 |
| Claude Haiku 4.5 (~$0.04/lead) | ~$60 |
| Sentry, Langfuse, uptime | $0–30 |
| Domain, email | ~$5 |
| **Platform total** | **~$110–140/month** |
| WhatsApp template messages | passed through to agencies via the messaging wallet |

At the full-spec Starter price (₦49,000/month), two or three paying agencies cover the platform cost.
