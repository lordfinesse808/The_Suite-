# Build Spec: AI Real Estate Lead System (beta)

> **How to use this file**
> 1. Create an empty Git repo and save this file at its root as `BUILD_SPEC.md`.
> 2. Open Claude Code in that folder and paste the **Kickoff message** below.
> 3. Have these accounts ready, or let Claude Code build with mocks until you add the keys: Anthropic API, Voyage AI, Meta Developer app + WhatsApp Business Account, Google Cloud OAuth client, Paystack (test mode), Resend, Cloudflare R2, Sentry, a Postgres host.

---

## Kickoff message (paste into Claude Code)

```
Read BUILD_SPEC.md in full. It is the source of truth for this project.

Build the product end to end, up to the point where we can start beta testing, by working through the milestones in section 14 in order. For each milestone:
- Start with a short plan, then write the code, tests and migrations.
- Run lint, typecheck and tests. Fix any failures before you move on.
- Update PROGRESS.md: what you built, how to try it, any open issues.
- Commit with a clear message.

Where a step needs a credential we don't have yet, build it behind a mock or simulator, as section 12 describes, and keep going. Never hard-code secrets. Add every variable to .env.example.

Make sensible decisions inside this spec without asking. Stop and ask me only if a choice would change the product's scope, cost money, or contradict the spec.
```

---

## 1. Product in one paragraph

This is a WhatsApp-first, multi-tenant SaaS for estate agents, agencies, developers and short-let operators, starting in Lagos and Abuja and designed to go global later. Four AI agents carry every property enquiry from first message to booked viewing:

- **Agent 1, Qualifier**, chats with the lead.
- **Agent 2, Matchmaker**, recommends properties.
- **Agent 3, Follow-up writer**, drafts emails and WhatsApp follow-ups.
- **Agent 4, Scheduler**, books viewings.

The human agent stays in control: they can take over any chat at any time, and nothing goes out in their name without approval unless they opt in. Leads arrive on WhatsApp and through the tenant's own website (an embeddable chat widget plus a lead-capture API).

Codename: `proplead`. Use it for package names. All user-facing copy reads the brand name from config (`APP_NAME`), so we can rename later.

## 2. Definition of done (beta-ready)

The beta is ready when all of the following are true:

- [ ] A new agency can sign up, connect a WhatsApp number, connect Google Calendar, import listings, install the website widget and receive a live lead, all in under 30 minutes, guided by an onboarding wizard.
- [ ] A lead messaging on WhatsApp or the website widget gets an AI reply within 10 seconds at p95.
- [ ] The lead is qualified and scored, gets 3–5 matching listings, can book a viewing, and gets reminders at 24 hours and 2 hours before it.
- [ ] Follow-up drafts appear in an approvals queue. One tap sends them on the right channel.
- [ ] The agent can see every conversation, take over, hand back to the AI, and see the pipeline and basic reports on a phone.
- [ ] Tenants are fully isolated from each other. Automated tests prove it.
- [ ] Consent capture, STOP opt-out, data export and deletion all work (Nigeria Data Protection Act 2023).
- [ ] Billing works end to end in Paystack test mode. Beta tenants can be put on a free 90-day "design partner" plan.
- [ ] Staging and production are deployed with CI/CD, error tracking, LLM tracing, backups and a runbook.
- [ ] The agent eval suite passes its thresholds (section 9.6).

## 3. Scope

**In beta**

- Channels: WhatsApp Cloud API, website chat widget, website lead-form API, email (outbound only).
- All four agents.
- Lead inbox, pipeline, listings, approvals, calendar, reports.
- Team roles, plans and limits, billing, audit log.
- A super-admin console for our own team.

**Not in beta (design for it, don't build it)**

- Instagram DMs.
- Microsoft Outlook calendar (keep the calendar adapter interface ready).
- Portal feed integrations.
- Native mobile apps (ship a PWA instead).
- Multi-region hosting.
- Languages other than English. The AI must still understand Nigerian Pidgin and reply in plain English, or in Pidgin if the lead writes in Pidgin.

## 4. Users and roles

| Role | Can do |
| --- | --- |
| Owner | Everything, including billing, WhatsApp connection and deleting the organisation |
| Admin | Everything except billing and deleting the organisation |
| Agent | Handle assigned leads, approve follow-ups, manage own calendar, view listings |
| Viewer | Read-only access to the inbox and reports |
| Super-admin (us) | Separate console: tenants, usage, plan overrides, read-only impersonation (logged), feature flags |

## 5. Plans and limits (enforce in code)

| Plan | NGN/month | USD/month | Seats | Qualified leads/month | Notes |
| --- | --- | --- | --- | --- | --- |
| Starter | 49,000 | 79 | 1 | 100 | WhatsApp + widget, 1 calendar |
| Pro | 179,000 | 249 | 5 | 500 | Lead routing, approvals, reports; ₦100,000 setup |
| Business | 499,000 | 699 | 20 | 2,000 | API, webhooks, ad attribution, branches; ₦250,000 setup |
| Design partner (beta) | 0 | 0 | 5 | 500 | 90 days, then prompt to choose a plan |

- A "qualified lead" means a lead that reached the `qualified` state that billing month.
- Extra leads cost ₦250 each, billed in arrears.
- At 80% and 100% of the cap, show a banner and send an email. Never stop replying to leads: switch to overage instead.
- WhatsApp message fees are paid from a prepaid **messaging wallet** with a 10% margin.
  - Log every outbound message with its Meta pricing category (`service`, `utility`, `marketing`, `authentication`) in `wallet_ledger`.
  - Rates live in a `message_rates` table, editable in super-admin. Seed it with Nigeria `utility`/`service` at US$0.0101 and `marketing` at US$0.062.
- Annual billing gives 2 months free.

## 6. Tech stack (decided)

| Concern | Choice |
| --- | --- |
| Language | TypeScript everywhere, `strict: true` |
| Monorepo | pnpm workspaces + Turborepo |
| Dashboard | Next.js (App Router), React, Tailwind, shadcn/ui, TanStack Query; installable PWA |
| API | Fastify service (`apps/api`): webhooks, public API, dashboard API (or Next.js route handlers for dashboard-only calls) |
| Workers | Node service (`apps/worker`) running BullMQ queues on Redis |
| Database | PostgreSQL 16 + `pgvector`; Drizzle ORM + drizzle-kit migrations; row-level security (RLS) on every tenant table |
| Cache / queues | Redis (Upstash or managed Redis) |
| Auth | Better Auth (email + password, Google sign-in, organisations plugin for tenants, invitations) |
| LLM | Anthropic TypeScript SDK with tool use and prompt caching. Model IDs come from env: `CLAUDE_MODEL_FAST` (default `claude-haiku-4-5`) and `CLAUDE_MODEL_SMART` (default `claude-sonnet-5-5`). **Check the current model IDs in Anthropic's docs before you hard-code defaults.** |
| Embeddings | Voyage AI (`voyage-3.5-lite`, 1024 dimensions), behind an `EmbeddingProvider` interface |
| WhatsApp | Meta WhatsApp Cloud API, called directly (no paid BSP). Graph API version in env `WHATSAPP_GRAPH_VERSION`. |
| Calendar | Google Calendar API (OAuth, `calendar.events` scope); `CalendarProvider` interface ready for Microsoft Graph |
| Email | Resend (outbound), React Email templates |
| Payments | Paystack: subscriptions, one-off setup fees, wallet top-ups; webhook-verified |
| Storage | Cloudflare R2 (S3 API) for listing media and exports |
| Widget | Preact + Vite, built to one script under 60 KB gzipped, rendered in Shadow DOM |
| Observability | Sentry (all apps), Langfuse (LLM traces), pino structured logs, OpenTelemetry trace ids |
| Testing | Vitest, Testcontainers (Postgres, Redis), Playwright (dashboard + widget), custom LLM eval runner |
| Deploy | Docker images per app; `docker-compose.yml` for local; deploy to Railway or Render (staging + production); GitHub Actions CI |

### Repository layout

```
apps/
  web/          # Next.js dashboard + marketing/legal pages + super-admin (/admin)
  api/          # Fastify: /webhooks/*, /v1/public/*, /v1/* (dashboard + Business API)
  worker/       # BullMQ processors: inbound, agents, outbound, scheduler jobs, embeddings, billing
  widget/       # embeddable website chat (builds to dist/widget.js)
  simulator/    # local WhatsApp simulator UI (dev only)
packages/
  db/           # Drizzle schema, migrations, RLS policies, seed
  agents/       # orchestrator, 4 agents, prompts, tools, schemas, guardrails, evals
  channels/     # whatsapp, webchat, email adapters behind one interface
  integrations/ # calendar, paystack, r2, voyage, resend
  shared/       # types, zod schemas, config loader, logger, errors, i18n strings
  ui/           # shared React components
evals/          # conversation fixtures + expected outputs
docs/           # architecture, runbook, API reference, widget install guide
```

## 7. Architecture

```
WhatsApp Cloud API ─┐
Website widget ─────┼─► apps/api (verify, normalise, dedupe) ─► Redis/BullMQ "inbound"
Website lead API ───┘                                                │
                                                                     ▼
                                   apps/worker: Orchestrator (per-lead lock, state machine)
                                     ├─ Qualifier ─┐
                                     ├─ Matchmaker ├─► tools ─► Postgres / pgvector / Calendar / R2
                                     ├─ Follow-up ─┤
                                     └─ Scheduler ─┘
                                                │
                                   guardrails ─► "outbound" queue ─► channel adapter ─► lead
                                   timed jobs (delayed BullMQ): follow-ups, reminders, cap emails
Dashboard (apps/web) ◄─► API ◄─► Postgres;   real-time inbox via Server-Sent Events
```

**Rules for the pipeline**

- **Idempotency:** dedupe inbound events on `(channel, external_message_id)`.
- **Ordering:** process messages for one lead one at a time, using a Redis lock per `lead_id` (or BullMQ group).
- **Burst handling:** debounce rapid multi-message bursts from the same lead for 2 seconds, then answer them together.
- **Retries:** exponential backoff. After the final failure, move the job to a dead-letter queue, alert Sentry and notify the assigned agent. **Never drop a lead's message.**
- **LLM fallback:** if the smart model errors, retry once on the fast model. If that fails too, send the holding reply "Thanks! An agent will reply shortly" and alert the human.
- **Every outbound message goes through one function**, `sendMessage(leadId, payload, { reason, agent, approvedBy })`. It enforces opt-out, the WhatsApp 24-hour window, the wallet balance and the audit log.

## 8. Data model (minimum)

All tenant tables carry `org_id` with RLS: `org_id = current_setting('app.org_id')`. Use UUID v7 ids and `created_at`/`updated_at` columns everywhere.

- `organisations`: name, country, currency, timezone (default `Africa/Lagos`), plan, plan_status, trial_ends_at, settings jsonb
- `users`, `memberships` (role)
- `whatsapp_accounts`: waba_id, phone_number_id, display_number, access_token_encrypted, status, quality_rating
- `widget_configs`: publishable_key, allowed_origins[], theme, greeting, mode (`chat` | `whatsapp_handoff` | `both`)
- `api_keys`: hashed secret, scopes
- `webhook_endpoints`: url, secret, events[]
- `listings`:
  - ref_code (for example `LST-1042`), title, purpose (`rent` | `sale` | `shortlet` | `offplan`), property_type, bedrooms, bathrooms
  - price_amount, price_currency, price_period (`year` | `month` | `night` | `total`), service_charge
  - area, city, state, lat/lng, features[], description, status (`available` | `under_offer` | `taken`), verified
  - documents (private), media[] (R2 keys), agent_id
- `listing_embeddings`: listing_id, embedding vector(1024), content_hash
- `leads`:
  - channel, wa_id / phone (E.164), name, email
  - stage (enum in 9.1), score, temperature (`hot` | `warm` | `cold`)
  - needs jsonb (purpose, budget_min/max, currency, period, areas[], property_type, bedrooms_min, move_in_by, financing, must_haves[], deal_breakers[])
  - source (utm, widget page, listing ref), assigned_agent_id, ai_paused, consent_at, opted_out_at
- `conversations`, `messages`:
  - direction, channel, external_id, type, body, media, payload jsonb
  - author (`lead` | `ai:<agent>` | `user:<id>`), wa_pricing_category, status (sent / delivered / read / failed)
- `matches`: lead_id, listing_id, rank, reason, sent_at, reaction
- `sequences`, `drafts`: lead_id, channel, subject, body, status (`pending_approval` | `approved` | `sent` | `rejected` | `expired`), send_at, approved_by
- `viewings`: lead_id, listing_id, agent_id, start_at, end_at, calendar_event_id, status (`proposed` | `confirmed` | `rescheduled` | `cancelled` | `attended` | `no_show`), reminders_sent
- `availability_rules`: per agent: days, hours, buffer_minutes (default 45 for Lagos traffic), max_per_day
- `calendar_connections`: provider, tokens_encrypted
- `subscriptions`, `invoices`, `wallet_ledger`, `message_rates`, `usage_counters`
- `audit_log`: actor, action, entity, before/after, ip
- `ai_runs`: agent, model, prompt_version, input_tokens, output_tokens, cache_read_tokens, latency_ms, cost_usd, langfuse_trace_id
- `consents`, `data_requests` (export / delete)

Encrypt tokens with AES-256-GCM using `ENCRYPTION_KEY`, with key rotation support.

## 9. The four agents

### 9.1 Orchestrator and lead states

States: `new → qualifying → qualified → shortlisted → viewing_requested → viewing_booked → viewed → offer → won | lost`, plus the flag `ai_paused` (human took over).

| Event | Agent that acts |
| --- | --- |
| Inbound message, state `new` or `qualifying` | Qualifier |
| State becomes `qualified`, or lead asks to see options | Matchmaker |
| Lead asks to view or picks a listing | Scheduler |
| Timers (24h silence, after viewing, new matching listing, price drop) | Follow-up writer |
| Free-text question in any later state | Short "concierge" pass on the fast model, which answers from listing data or routes to the right agent |

Implementation rules:

- Each agent is a module: `{ name, model, systemPrompt (versioned), tools, outputSchema (zod), run(ctx) }`.
- **Context** passed to each agent:
  - the org profile (name, areas served, tone, office hours, fees policy)
  - the lead's needs and state
  - the last 20 messages plus a rolling summary
  - relevant listings (Matchmaker only)
- **Prompt caching:** put the system prompt and org profile in a cached prefix.
- **Human takeover:** when `ai_paused` is true, no agent replies. Show a "Resume AI" button. AI resumes automatically after 12 hours of human silence if the org setting allows it.

### 9.2 Agent 1: Qualifier (fast model)

- **Goal:** fill `needs` and score the lead in as few turns as possible (target 5–8 questions; ask at most 2 per message). Use WhatsApp interactive buttons and lists where they speed things up (purpose, bedrooms, budget bands).
- **First reply:** greet with the org name, include one consent line ("By continuing you agree we can save your details. Reply STOP anytime."), then ask the first question. If the lead came from a listing ref or a website page, acknowledge that listing.
- **Tools:**
  - `update_lead_needs(partial)`
  - `set_lead_contact(name?, email?)`
  - `score_lead()` — deterministic rubric in code; the AI supplies the inputs
  - `request_human(reason)`
  - `mark_spam(reason)`
- **Scoring rubric (0–100):**
  - budget stated and realistic for the area: 25
  - timeline within 60 days: 20
  - specific area and type: 15
  - financing ready or cash: 15
  - contact name: 5
  - engaged replies: 10
  - came from a specific listing: 10
- **Temperature:** Hot is 70 or above, Warm is 40–69, Cold is below 40.
- **Hand off to Matchmaker** when purpose, budget, area and bedrooms or type are known, or after 8 questions, whichever comes first.
- **Never** quote prices, fees or availability that are not in the data. **Never** give legal advice on titles; say an agent will confirm documents.

### 9.3 Agent 2: Matchmaker (smart model)

- **Retrieval:**
  1. Hard SQL filters: org, `status = available`, purpose, price within budget +10%, bedrooms, areas (with a neighbouring-areas map seeded for Lagos and Abuja).
  2. pgvector similarity on the lead's must-haves text.
  3. Take the top 15. The model ranks them and picks 3–5.
- **Output:** for each listing, a one-line reason tied to the lead's stated needs, the price exactly as stored, and the first image.
  - WhatsApp: image message with caption, or an interactive list.
  - Widget: cards.
- **Follow-up requests:** handle "cheaper", "closer to X", "bigger" by re-querying with adjusted filters.
- **No good match:** say so honestly, offer the nearest alternatives, and create a "notify me" watch. A new matching listing triggers the Follow-up writer.
- **Tools:** `search_listings(filters, semantic_query)`, `get_listing(ref)`, `record_matches(list)`, `create_watch(needs)`.

### 9.4 Agent 3: Follow-up writer (fast model; smart model for emails over 120 words)

- **Triggers:**
  - no lead reply for 24 hours (then 72 hours, then 7 days, maximum 3 touches)
  - 2 hours after a viewing ends (feedback request)
  - a new listing matches an open watch
  - a matched listing's price drops
- **Drafting:** writes in the org's tone, using the agent's past approved messages as style examples (up to 5), and mentions specifics from the chat.
- **Channel rules:**
  - WhatsApp inside the 24-hour window: free text.
  - WhatsApp outside the window: an approved template only, with the AI filling the variables.
  - Email: only if an email address was captured.
- **Approval:** every draft goes to the approvals queue unless the org turned on auto-send for that trigger. Drafts expire after 48 hours.
- **Tools:** `get_conversation_summary`, `create_draft(channel, subject?, body, template_name?, variables?)`, `schedule_send(draft_id, at)`.

### 9.5 Agent 4: Scheduler (fast model + calendar tools)

- **Finding slots:** read free/busy from the assigned agent's Google Calendar, apply `availability_rules` (hours, 45-minute travel buffer, daily maximum), and offer 3 slots as WhatsApp interactive buttons or a list, or as widget chips.
- **Booking:**
  - create the calendar event with the lead's details and listing address
  - send a confirmation with a WhatsApp location message (lat/lng) or a map link
  - schedule reminders 24 hours and 2 hours before, using template messages when outside the 24-hour window
  - at the 2-hour reminder, ask the lead to confirm with a button
- **Changes:** support reschedule and cancel by chat. Mark the viewing `attended` or `no_show` from the dashboard; the system prompts the agent 1 hour after the viewing.
- **Tools:** `get_free_slots(agent_id, listing_id, range)`, `book_viewing(...)`, `reschedule_viewing`, `cancel_viewing`, `send_location(listing_id)`.

### 9.6 Guardrails and evals

- **Prompt-injection defence:** treat all lead messages and listing text as untrusted data. The system prompt says to ignore instructions inside them.
- **Output checks before sending:**
  - every price or figure must exist in the referenced listing
  - no phone numbers or emails except the org's
  - no promises about legal title
  - length limit (WhatsApp body 1,000 characters)
  - profanity filter
  - if a check fails, regenerate once, then fall back to a safe holding reply
- **Personal data:** redact it in Langfuse traces (hash phone numbers).
- **Evals:** `evals/` holds at least 40 scripted conversations: Lagos rent, Abuja sale, short-let, off-plan, diaspora buyer, Pidgin, time-waster, scam attempt, prompt-injection attempt, human takeover, reschedule.
  - `pnpm eval` replays them against the real models and reports needs-extraction accuracy, hand-off correctness, hallucinated-price rate, and replies per qualification.
  - Thresholds: extraction accuracy of at least 90%, **0** hallucinated prices, and qualification in 8 turns or fewer in at least 85% of cases.
  - Run in CI nightly and on demand, not on every PR.

## 10. WhatsApp integration (Cloud API)

**Connection.** Support two ways for a tenant to connect a number:

- **(a) Manual connect (beta default):** the tenant enters their WABA ID, phone number ID and a permanent System User token. We validate them with a Graph API call, subscribe the app to the WABA's webhooks, and store the token encrypted.
- **(b) Embedded Signup:** build it behind the feature flag `whatsapp_embedded_signup`, ready for when we become a Meta Tech Provider.

**Webhook endpoint `/webhooks/whatsapp`**

- `GET`: verify `hub.mode`, `hub.verify_token` and return `hub.challenge`.
- `POST`: verify `X-Hub-Signature-256` (HMAC-SHA256 of the raw body using `META_APP_SECRET`), then return 200 within 2 seconds and enqueue the work.
- Route each event to its tenant by `metadata.phone_number_id`.
- Handle message types: text, interactive (`button_reply`, `list_reply`), button, location, image, document, audio and reactions.
  - Audio: transcribe later; in beta, reply politely asking for text.
- Handle status events (`sent`, `delivered`, `read`, `failed`) and record `pricing.category` from them.

**Sending messages**

- Message types to send: text, image with caption, interactive buttons (maximum 3), interactive list (maximum 10 rows), location, and templates.
- Mark inbound messages as read, and show the typing indicator while the AI works if the API version supports it.
- **24-hour customer service window:** track `last_inbound_at` per lead. Free-form messages are only allowed inside the window. Outside it, use an approved template, or create a draft for the human.

**Templates**

- Ship default templates and a one-click "Submit default templates" action that calls the template API:
  - `viewing_confirmation`
  - `viewing_reminder_24h`
  - `viewing_reminder_2h`
  - `follow_up_checkin`
  - `new_listing_match`
  - `price_drop_alert`
- Sync template status (pending / approved / rejected) daily.

**Opt-out:** the keywords `STOP`, `UNSUBSCRIBE` and `CANCEL` (and the Pidgin "abeg stop") set `opted_out_at`, send one confirmation, and block all further outbound messages. `START` re-subscribes.

**Click-to-WhatsApp from websites and ads**

- Generate `https://wa.me/<number>?text=<prefilled>` links per listing, containing the listing ref (for example "Hi, I'm interested in LST-1042").
- The Qualifier detects the ref and attaches the listing to the lead.
- For Meta click-to-WhatsApp ads, read `referral` data (`source_url`, `ctwa_clid`) into `leads.source`.

**Quality and cost:** show the number's quality rating and the wallet balance in the dashboard. Rate-limit marketing templates per lead (at most 2 a week).

## 11. Website integration

### 11.1 Embeddable chat widget

The tenant pastes one snippet (shown in Settings → Website, with a copy button and a live preview):

```html
<script src="https://cdn.<domain>/widget.js" data-key="pk_live_xxx" async></script>
```

- Shows a floating launcher that opens a chat panel. Use Shadow DOM so the host site's CSS can't break it. Make it mobile-friendly and accessible (keyboard support, ARIA). Theme colour, greeting, position and avatar come from `widget_configs`.
- **Modes:**
  - `chat`: in-page AI chat, using the same agents and pipeline as WhatsApp
  - `whatsapp_handoff`: the button opens a `wa.me` link with the page or listing context
  - `both`: chat first, with a "Continue on WhatsApp" button that carries a short code, so the WhatsApp conversation links to the same lead
- **Listing-aware:**
  - add `data-listing="LST-1042"` on the script tag, or
  - call `window.PropLead.open({ listing: 'LST-1042' })` from any "Enquire" button, or
  - use auto-detection from a `<meta name="proplead:listing" content="LST-1042">` tag
- **Visitor identity:** an anonymous `visitor_id` in localStorage plus page URL and UTM capture. Ask for name and phone during qualification, so the agent can move to WhatsApp later.
- **Transport:** REST for sends, Server-Sent Events for replies, with a polling fallback.
- **Security:** a publishable key plus an `Origin` check against `allowed_origins`, rate limits per IP and visitor, and Cloudflare Turnstile (feature-flagged) against bots.
- **JS API:** `PropLead.open()`, `.close()`, `.identify({ name, phone, email })`, `.on('lead_created' | 'viewing_booked', cb)` (so the tenant can fire their own analytics).
- **Packaging:** serve from R2 behind a CDN, versioned (`/widget@1.js`) with an `/widget.js` alias.

### 11.2 Lead-capture API (for existing website forms)

`POST /v1/public/leads`, authenticated with the publishable key and the origin check:

```json
{ "name": "...", "phone": "+234...", "email": "...", "message": "...",
  "listing_ref": "LST-1042", "source": { "page": "...", "utm_source": "..." },
  "consent": true }
```

- Creates the lead and, if a phone number is given and the org allows it, sends a WhatsApp `follow_up_checkin` template so the Qualifier continues on WhatsApp.
- Document it with copy-paste examples for plain HTML forms, WordPress (Contact Form 7 / WPForms webhook), Webflow, Wix and Framer.

### 11.3 Business API and outbound webhooks (Business plan)

- REST API at `/v1/*` with secret keys and scopes: leads, listings (CRUD + bulk upsert for website/CRM sync), viewings. Publish OpenAPI 3.1 docs at `/docs`.
- **Outbound webhooks:**
  - events: `lead.created`, `lead.qualified`, `viewing.booked`, `viewing.cancelled`, `lead.stage_changed`
  - signed with HMAC (`X-PropLead-Signature`) and retried with backoff
  - delivery log visible in settings
- **Listings import:** CSV upload with column mapping, plus "paste a listing" (free text or a photo of a flyer), which the AI turns into a structured listing for review.

## 12. Local development, mocks and seed data

- `docker compose up` starts Postgres with pgvector, Redis and Mailpit. `pnpm dev` runs all apps.
- **WhatsApp simulator (`apps/simulator`):** a page that looks like WhatsApp, posts correctly signed fake webhooks to the API, and shows outbound messages. It must support buttons, lists, location and templates, so the whole flow can be tested with no Meta account.
- **Mocks** behind env flags: `MOCK_LLM` (canned responses for unit tests), `MOCK_CALENDAR`, `MOCK_PAYSTACK`, `MOCK_EMBEDDINGS`.
- **Seed (`pnpm db:seed`):**
  - a demo organisation, "Demo Realty Lagos", with 3 users
  - 30 realistic, clearly fictional Lagos and Abuja listings across Lekki, Ikate, Ajah, Yaba, Ikeja, Gbagada, Maitama, Gwarinpa and Wuse 2, with naira prices per year (rent), totals (sale) and per night (short-let)
  - availability rules and a few leads in each stage
- A neighbouring-areas JSON for Lagos and Abuja, used by the Matchmaker.

## 13. Dashboard (`apps/web`)

Mobile-first. Every screen must work at 380 px wide. Real-time updates over Server-Sent Events.

1. **Onboarding wizard:** organisation details, areas served, tone, fee policy → connect WhatsApp → connect Google Calendar → add listings (CSV, paste or manual) → set viewing hours → install widget (snippet + test) → "Send yourself a test lead" → done.
2. **Inbox:** the conversation list with filters (Hot, unassigned, needs approval, AI paused); a chat view with the AI's actions shown inline ("Qualifier scored 82"); a **Take over / Resume AI** toggle; and composer quick replies.
3. **Lead detail:** needs, score breakdown, matches sent, viewings, drafts, timeline, notes, tasks, source, consent status, plus export and delete buttons.
4. **Pipeline:** a kanban by stage with drag and drop, and value per column.
5. **Listings:** a table and cards, filters, media upload, status, verified flag, the `wa.me` link and a copy button for widget code per listing.
6. **Approvals:** a queue of drafts with edit / approve / reject; bulk approve; push and email notification when the queue is non-empty.
7. **Calendar:** agenda view of viewings; mark attended or no-show.
8. **Reports:**
   - median first response
   - percentage qualified without a human
   - qualified-to-viewing rate
   - show rate
   - draft approval-without-edit rate
   - leads and won deals by source
   - plan usage and wallet spend
9. **Settings:** team and roles, lead routing (round-robin or by area), AI behaviour (tone, auto-send per trigger, resume after takeover), WhatsApp, templates, widget, API keys, webhooks, billing (plan, invoices, wallet top-up through Paystack), data and privacy.
10. **Super-admin (`/admin`):** tenants, usage, AI cost per tenant, plan overrides, design-partner invites (invite codes), feature flags, message rates, read-only impersonation (logged).
11. **Legal pages:** privacy policy, terms and data-processing addendum templates, filled from config, with a banner saying a lawyer must review them.

## 14. Milestones (execute in order)

Each milestone ends with green CI, an updated `PROGRESS.md` and a commit.

| # | Milestone | Done when |
| --- | --- | --- |
| M0 | Foundations: monorepo, tooling, CI (lint, typecheck, test, build), docker-compose, config loader with zod-validated env, logger, Sentry | `pnpm dev` runs empty apps; CI passes |
| M1 | Data and tenancy: Drizzle schema (section 8), migrations, RLS policies, Better Auth with organisations, roles, seed | Cross-tenant access tests fail closed; seed loads |
| M2 | Channels core: unified message model, inbound/outbound queues, `sendMessage` policy layer, WhatsApp adapter, webhook route, WhatsApp simulator | A simulator message reaches the DB and echoes back through the outbound queue with correct signing |
| M3 | Orchestrator + Qualifier: state machine, per-lead locking, context builder, prompt caching, scoring, takeover | In the simulator, a lead is qualified and scored; the inbox shows it live |
| M4 | Listings + Matchmaker: listings CRUD, CSV import, AI paste-import, R2 media, embeddings job, hybrid search, WhatsApp media/list replies | Lead receives 3–5 relevant listings with images and reasons |
| M5 | Scheduler: Google OAuth, free/busy, availability rules, booking, location message, reminders, reschedule/cancel | A viewing books into a real test calendar; reminders fire (time-travel test) |
| M6 | Follow-up writer + approvals: triggers, drafts, approvals UI, templates submit/sync, 24-hour window enforcement, email via Resend | A silent lead gets an approved follow-up through the correct channel |
| M7 | Website: widget (all modes, listing-aware, JS API), lead-capture API, install docs, origin checks | Widget on a sample HTML page completes the whole flow; Playwright e2e passes |
| M8 | Dashboard completion: onboarding wizard, pipeline, calendar, reports, settings, PWA, notifications | A new tenant completes onboarding in under 30 minutes on a phone |
| M9 | Billing and limits: Paystack plans, setup fees, wallet top-ups, message-cost ledger, caps and overage, design-partner plan | Paystack test-mode flows pass; usage counters are accurate |
| M10 | Business API: `/v1` REST, OpenAPI docs, outbound webhooks with retries and delivery log | API contract tests pass |
| M11 | Privacy, safety and evals: consent, opt-out, export/delete jobs, retention, guardrails, PII redaction, eval suite at thresholds, audit log | `pnpm eval` meets section 9.6; data-request e2e passes |
| M12 | Ops and beta launch: staging + production deploy, backups, uptime checks, Langfuse dashboards, runbook, super-admin, beta invite flow, in-app feedback button, analytics events | The checklist in section 2 is all ticked |

## 15. Non-functional requirements

- **Performance:** first AI reply under 10 seconds at p95 (measure and show it in super-admin). Dashboard loads in under 2 seconds on a mid-range Android over 3G. The widget script is under 60 KB gzipped.
- **Reliability:** 99.5% monthly uptime target; zero lost inbound messages; graceful degradation when the LLM, calendar or Paystack is down.
- **Security:**
  - OWASP ASVS level 1 basics
  - every query scoped by tenant, with RLS as a second wall
  - secrets only in env or the secret manager
  - token encryption
  - rate limits on public endpoints
  - dependency scanning in CI
  - signed webhooks in both directions
  - audit log for any action on leads, settings or billing
- **Privacy (NDPA 2023):**
  - lawful-basis and consent records
  - opt-out on every channel
  - export (JSON + CSV) and delete within 30 days
  - retention setting (default: delete inactive leads after 24 months)
  - data-region setting stored per organisation, ready for multi-region later
- **Cost control:**
  - log tokens and cost per AI run
  - cache-hit rate in Langfuse
  - a per-tenant daily AI budget guard with alerting
  - target AI cost of at most US$0.10 per lead on average
- **Accessibility:** WCAG 2.1 AA for the widget and dashboard.
- **Code quality:**
  - typed end to end with zod at every boundary
  - no `any` in core packages
  - tests for every agent tool and policy rule
  - each agent's prompt stored as a versioned file, with its version saved on every `ai_run`

## 16. Environment variables (put in `.env.example`)

```
APP_NAME, APP_URL, API_URL, WIDGET_CDN_URL, NODE_ENV
DATABASE_URL, REDIS_URL, ENCRYPTION_KEY
BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
ANTHROPIC_API_KEY, CLAUDE_MODEL_FAST, CLAUDE_MODEL_SMART
VOYAGE_API_KEY
META_APP_ID, META_APP_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_GRAPH_VERSION
GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET
PAYSTACK_SECRET_KEY, PAYSTACK_PUBLIC_KEY
RESEND_API_KEY, EMAIL_FROM
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
SENTRY_DSN, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST
TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY
MOCK_LLM, MOCK_CALENDAR, MOCK_PAYSTACK, MOCK_EMBEDDINGS
```

## 17. External setup checklist (for the human team, in parallel)

These need people, not code. Claude Code should produce `docs/beta-launch-checklist.md` with step-by-step instructions for each item.

- [ ] Meta Business verification; create the Meta app; add the WhatsApp product; get a production phone number; add a payment method for message fees (needed for per-message billing from 1 Oct 2026); request the `whatsapp_business_messaging` and `whatsapp_business_management` permissions.
- [ ] Submit the default message templates and wait for approval.
- [ ] Google Cloud OAuth consent screen. The calendar scope needs verification before going public; during beta, add design partners as test users (up to 100).
- [ ] Paystack business account (test, then live), with subscription plans created.
- [ ] Domain, DNS, transactional email domain verification (SPF, DKIM, DMARC).
- [ ] NDPA compliance steps and a lawyer's review of the privacy policy, terms and data-processing addendum.
- [ ] Recruit 10 design partners (mix of solo agents, an agency, a developer and a short-let operator); onboard them with invite codes.

## 18. Beta success metrics (instrument these from day one)

| Metric | Beta target |
| --- | --- |
| Median first response | under 15 seconds |
| Leads qualified without a human | 60% or more |
| Qualified lead to booked viewing | 25% or more |
| Viewing show rate | 80% or more |
| Follow-up drafts approved without edits | 70% or more |
| Design partners active weekly | 8 of 10 |
| AI cost per lead | US$0.10 or less |

Track product analytics events (PostHog, or our own `events` table): `signup`, `onboarding_step_completed`, `whatsapp_connected`, `widget_installed`, `lead_created`, `lead_qualified`, `match_sent`, `viewing_booked`, `draft_approved`, `takeover`, `plan_upgraded`.
