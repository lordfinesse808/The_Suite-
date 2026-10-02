# ilé — AI lead desk for Nigerian estate agents

A WhatsApp-first system where four AI agents carry every property enquiry from the first message to a booked viewing, in English and Nigerian Pidgin. The agent sees every chat on their phone, takes over at any moment, and approves anything sent in their name.

| Agent | Does |
| --- | --- |
| **Qualifier** | Chats naturally, captures budget, area, type, bedrooms and move-in date in at most 2 questions per message, scores the lead 0–100 |
| **Matchmaker** | Sends 3–5 matching listings with a photo, the exact price and a one-line reason each |
| **Scheduler** | Offers 3 slots from the agent's hours (45-min Lagos travel buffer), books, sends the location pin and reminders 24h and 2h before |
| **Follow-up writer** | Drafts a follow-up when a lead goes quiet; nothing is sent until the agent approves |

Runs end to end with **no accounts and no API keys**: an embedded Postgres, a mock WhatsApp with a simulator, and a mock LLM. Switch to live keys when ready (`docs/going-live.md`).

```bash
pnpm install
pnpm dev     # http://localhost:3000  (adaeze@demo.ile / demo1234)
             # http://localhost:3000/dev/simulator  (you are the lead)
```

- Setup and commands: [`docs/setup.md`](docs/setup.md)
- How it works: [`docs/architecture.md`](docs/architecture.md)
- Website integration: [`docs/website.md`](docs/website.md)
- **Everything needed to go live**: [`docs/going-live.md`](docs/going-live.md)
- Operations: [`docs/runbook.md`](docs/runbook.md)
- Status and next steps: [`PROGRESS.md`](PROGRESS.md)
- Specs: [`BUILD_SPEC.md`](BUILD_SPEC.md) (full product), [`docs/LEAN_BETA_BUILD_PROMPT.md`](docs/LEAN_BETA_BUILD_PROMPT.md) (the $30 lean beta built here); screen designs in [`docs/design/`](docs/design)

Stack: Next.js 15 (App Router, TypeScript strict), Tailwind 4, Drizzle on PGlite/Supabase Postgres with RLS, Anthropic SDK (Claude Haiku 4.5), WhatsApp Cloud API, Vitest, Playwright, GitHub Actions.
