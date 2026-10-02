# Runbook

## Health checks
- `GET /login` returns 200 (app and database up).
- `GET /api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=…&hub.challenge=ok` returns `ok`.
- Supabase → `select status, count(*) from jobs group by status;` — `queued` should stay small; `failed` should be 0.
- `select * from cron.job_run_details order by start_time desc limit 5;` — the tick runs every minute.

## The AI stopped replying
1. Settings → AI spend: if today's spend reached the cap, leads are getting a holding reply and the inbox shows them as waiting. Raise `AI_DAILY_BUDGET_USD` (or the org's budget) only if credit allows.
2. Check the Anthropic Console for errors or exhausted credit. The adapter falls back to rule-based understanding on API errors; replies need the model, so the holding reply is sent instead.
3. Check `jobs` for `failed` rows and their `last_error`. Re-queue: `update jobs set status='queued', attempts=0, run_at=now() where id='…';`

## Messages not arriving
- Meta app → WhatsApp → Configuration: webhook subscribed to `messages`, callback URL correct.
- A `401` in Vercel logs means `META_APP_SECRET` is wrong. An "unknown phone_number_id" warning means Settings → WhatsApp has the wrong phone number ID.
- Tokens: temporary tokens expire after 24 hours; use a System User token.

## Messages not sending
- `audit_log` rows with action `message.blocked` explain why: `opted_out`, `outside_24h_window` (use a template), `send_failed` (see `data.error`; common: template not approved, recipient not in the test list, expired token).

## Template rejected
Edit wording in WhatsApp Manager (avoid promotional language for Utility), resubmit, and update `src/lib/channels/whatsapp/templates.ts` to match.

## Quality rating drops (Meta)
Pause follow-ups (do not approve drafts), review recent conversations for complaints, check STOP rates. Low ratings reduce messaging limits.

## Data requests (NDPA)
- Export: lead page → Export data (JSON).
- Delete: lead page → Delete lead and data (removes messages, matches, viewings, drafts, jobs; leaves an audit entry without personal data).

## Restore
Supabase → Database → Backups (Pro: point-in-time). Restore into a new project first, verify, then switch `DATABASE_URL`.
