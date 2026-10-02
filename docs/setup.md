# Local setup

Requirements: Node 20+ and pnpm 10. No database server, no accounts, no API keys.

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

On first boot the app creates an embedded Postgres (PGlite) in `.data/pglite`, applies the migrations and loads the demo agency.

- Dashboard: http://localhost:3000 — sign in as `adaeze@demo.ile` / `demo1234` (owner). Agents: `tunde@demo.ile`, `halima@demo.ile` (same password).
- WhatsApp simulator: http://localhost:3000/dev/simulator — you are the lead. Up to 3 phones side by side, buttons, lists, images, location, voice notes, and a clock you can move forward (+2h / +24h / +72h) to fire reminders and follow-ups.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server with an in-process job ticker (every 15 s) |
| `pnpm test` | Vitest: extraction, guardrails, scoring, webhooks, tenant isolation, agent flows |
| `pnpm eval` | 15 scripted conversations in mock mode; exits 1 on any failure |
| `LLM_MODE=live pnpm eval` | Same against Claude Haiku 4.5 (needs `ANTHROPIC_API_KEY`, < $0.50) |
| `pnpm e2e` | Playwright: inbox/takeover, approvals, mobile, full simulator booking (starts its own server on :3100) |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | Quality gates (all run in CI) |
| `pnpm db:reset` | Delete the local database; the next `pnpm dev` re-seeds it |
| `pnpm db:migrate` / `pnpm db:seed` | Apply migrations / seed against `DATABASE_URL` (use for Supabase) |

## Mock switches (all on by default)

| Variable | Default | Effect |
| --- | --- | --- |
| `MOCK_WHATSAPP` | `true` | Outbound messages are stored and shown in the simulator; `/dev/*` routes exist |
| `LLM_MODE` | `mock` | Understanding by rules, replies composed from `fixtures/llm/phrases.json` (English + Pidgin) |
| `MOCK_STORAGE` | `true` | Listing photos saved to `public/uploads` |
| `DATABASE_URL` | empty | Empty = PGlite in `.data/pglite`; `memory://` = in-memory; `postgres://…` = real Postgres |

## Try these in the simulator

1. Lagos rent: "Good evening. I saw the 3-bed in Lekki on your Instagram. Is it still available?" then "Rent, around 6m a year, Lekki Phase 1 or Ikate, moving December". Pick a home from the list, tap a slot.
2. Pidgin: "How far, abeg I dey find mini flat for Yaba. My budget na 1.8m".
3. From a listing link: "Hi, I'm interested in LST-1042".
4. Yoruba: "Ẹ kú àárọ̀. Mo fẹ́ ilé ní Lekki" → handed to a human.
5. Scam: "Send me your account number first so I can pay the deposit before viewing" → AI paused, agent alerted.
6. Reply STOP, then START.
7. Book a viewing, then press +24h: reminders fire. Stop replying and press +24h again: a follow-up draft appears in Approvals.
8. In the dashboard, open a lead and press Take over: the AI goes silent until you Resume AI.
