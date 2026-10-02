import { z } from "zod";

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  APP_NAME: z.string().default("ilé"),
  APP_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().optional().default(""),
  ENCRYPTION_KEY: z.string().optional().default(""),
  SESSION_SECRET: z.string().optional().default(""),
  JOBS_TICK_SECRET: z.string().optional().default(""),

  NEXT_PUBLIC_SUPABASE_URL: z.string().optional().default(""),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(""),

  LLM_MODE: z.enum(["mock", "live"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  CLAUDE_MODEL_FAST: z.string().default("claude-haiku-4-5"),
  CLAUDE_MODEL_SMART: z.string().optional().default(""),
  AI_DAILY_BUDGET_USD: z.coerce.number().default(0.5),

  MOCK_WHATSAPP: bool(true),
  META_APP_SECRET: z.string().optional().default(""),
  WHATSAPP_VERIFY_TOKEN: z.string().optional().default(""),
  WHATSAPP_GRAPH_VERSION: z.string().default("v23.0"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(""),

  MOCK_STORAGE: bool(true),
  SENTRY_DSN: z.string().optional().default(""),
});

export type Env = z.infer<typeof schema> & {
  /** HMAC secret used to sign webhooks; a fixed dev value in mock mode. */
  webhookSecret: string;
  verifyToken: string;
  tickSecret: string;
  sessionSecret: string;
  isProd: boolean;
};

const DEV_SECRET = "ile-dev-only-secret-change-me";

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("Invalid environment: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  const e = parsed.data;
  const isProd = e.NODE_ENV === "production";
  if (isProd) {
    const missing: string[] = [];
    if (!e.SESSION_SECRET) missing.push("SESSION_SECRET");
    if (!e.ENCRYPTION_KEY) missing.push("ENCRYPTION_KEY");
    if (!e.JOBS_TICK_SECRET) missing.push("JOBS_TICK_SECRET");
    if (!e.MOCK_WHATSAPP && (!e.META_APP_SECRET || !e.WHATSAPP_VERIFY_TOKEN)) missing.push("META_APP_SECRET/WHATSAPP_VERIFY_TOKEN");
    if (e.LLM_MODE === "live" && !e.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
    if (missing.length && process.env.NEXT_PHASE !== "phase-production-build") {
      console.warn(`[env] missing production settings: ${missing.join(", ")}`);
    }
  }
  return {
    ...e,
    webhookSecret: e.META_APP_SECRET || DEV_SECRET,
    verifyToken: e.WHATSAPP_VERIFY_TOKEN || "ile-dev-verify",
    tickSecret: e.JOBS_TICK_SECRET || DEV_SECRET,
    sessionSecret: e.SESSION_SECRET || DEV_SECRET,
    isProd,
  };
}

let cached: Env | null = null;
export function env(): Env {
  if (!cached || process.env.NODE_ENV === "test") cached = load();
  return cached;
}
