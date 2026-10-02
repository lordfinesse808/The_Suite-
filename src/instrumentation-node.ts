// Local dev: an in-process ticker stands in for Supabase pg_cron (mock mode only).
import { env } from "./lib/env";
import { tick } from "./lib/jobs/queue";

const g = globalThis as unknown as { __ileTicker?: NodeJS.Timeout };
if (env().MOCK_WHATSAPP && process.env.DISABLE_DEV_TICKER !== "true" && !g.__ileTicker) {
  g.__ileTicker = setInterval(() => {
    tick().catch((e) => console.error("[dev-ticker]", e));
  }, 15_000);
}
