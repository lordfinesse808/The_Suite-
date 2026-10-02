// Drizzle mirror of migrations/0001_init.sql. Keep the two in sync.
import {
  pgTable, uuid, text, boolean, integer, bigint, timestamp, jsonb, doublePrecision, numeric,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const id = () => uuid("id").primaryKey().defaultRandom();
const created = () => ts("created_at").notNull().defaultNow();

export type Purpose = "rent" | "sale" | "shortlet";
export type PricePeriod = "year" | "month" | "night" | "total";
export type Stage = "new" | "qualifying" | "qualified" | "shortlisted" | "viewing_booked" | "viewed" | "won" | "lost";
export const STAGES: Stage[] = ["new", "qualifying", "qualified", "shortlisted", "viewing_booked", "viewed", "won", "lost"];
export type Temperature = "hot" | "warm" | "cold";
export type Language = "en-NG" | "pcm";

export interface Needs {
  purpose?: Purpose;
  budget_min?: number;
  budget_max?: number;
  period?: PricePeriod;
  areas?: string[];
  property_type?: string;
  bedrooms_min?: number;
  move_in_by?: string; // ISO date
  move_in_text?: string;
  financing?: "cash" | "mortgage" | "instalments";
  nights?: number;
  must_haves?: string[];
}

export interface LeadSource {
  channel?: "whatsapp" | "web_form" | "import";
  listing_ref?: string;
  page?: string;
  utm?: Record<string, string>;
  referral?: Record<string, string>;
}

export interface ScoreItem { label: string; points: number; max: number; ok: boolean }

/** Agent working memory for one lead. */
export interface LeadCtx {
  questions_asked?: number;
  asked?: string[];
  ai_turns?: number;
  offered_slots?: { start: string; listing_id: string }[];
  pending_listing_id?: string;
  followup_touches?: number;
  last_followup_at?: string;
  shortlist?: string[]; // listing ids in rank order
  excluded?: string[]; // listing ids already shown (for "cheaper" etc.)
  holding_sent_at?: string;
}

export const organisations = pgTable("organisations", {
  id: id(),
  name: text("name").notNull(),
  areas_served: text("areas_served").array().notNull().default([]),
  tone_notes: text("tone_notes").notNull().default(""),
  office_hours: text("office_hours").notNull().default("Mon-Sat, 9:00-17:00"),
  timezone: text("timezone").notNull().default("Africa/Lagos"),
  founding_member: boolean("founding_member").notNull().default(true),
  consent_message: text("consent_message").notNull().default(""),
  fees_policy: text("fees_policy").notNull().default(""),
  public_key: text("public_key").notNull(),
  allowed_origins: text("allowed_origins").array().notNull().default([]),
  ai_daily_budget_usd: numeric("ai_daily_budget_usd", { mode: "number" }),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  onboarding_step: integer("onboarding_step").notNull().default(0),
  created_at: created(),
  updated_at: ts("updated_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  password_hash: text("password_hash").notNull(),
  created_at: created(),
});

export const sessions = pgTable("sessions", {
  id: id(),
  user_id: uuid("user_id").notNull(),
  token_hash: text("token_hash").notNull(),
  org_id: uuid("org_id"),
  expires_at: ts("expires_at").notNull(),
  created_at: created(),
});

export const memberships = pgTable("memberships", {
  id: id(),
  user_id: uuid("user_id").notNull(),
  org_id: uuid("org_id").notNull(),
  role: text("role").$type<"owner" | "agent">().notNull(),
  created_at: created(),
});

export const whatsappAccounts = pgTable("whatsapp_accounts", {
  id: id(),
  org_id: uuid("org_id").notNull(),
  phone_number_id: text("phone_number_id").notNull(),
  waba_id: text("waba_id").notNull().default(""),
  display_number: text("display_number").notNull().default(""),
  display_name: text("display_name").notNull().default(""),
  access_token_encrypted: text("access_token_encrypted").notNull().default(""),
  status: text("status").notNull().default("connected"),
  created_at: created(),
});

export const listings = pgTable("listings", {
  id: id(),
  org_id: uuid("org_id").notNull(),
  ref_code: text("ref_code").notNull(),
  title: text("title").notNull(),
  purpose: text("purpose").$type<Purpose>().notNull(),
  property_type: text("property_type").notNull(),
  bedrooms: integer("bedrooms").notNull().default(0),
  bathrooms: integer("bathrooms").notNull().default(0),
  price_amount: bigint("price_amount", { mode: "number" }).notNull(),
  price_period: text("price_period").$type<PricePeriod>().notNull(),
  service_charge: bigint("service_charge", { mode: "number" }),
  area: text("area").notNull(),
  city: text("city").notNull(),
  address: text("address").notNull().default(""),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  features: text("features").array().notNull().default([]),
  description: text("description").notNull().default(""),
  status: text("status").$type<"available" | "taken">().notNull().default("available"),
  verified: boolean("verified").notNull().default(false),
  pinned: boolean("pinned").notNull().default(false),
  hidden: boolean("hidden").notNull().default(false),
  photos: text("photos").array().notNull().default([]),
  agent_id: uuid("agent_id"),
  created_at: created(),
  updated_at: ts("updated_at").notNull().defaultNow(),
});

export const leads = pgTable("leads", {
  id: id(),
  org_id: uuid("org_id").notNull(),
  phone: text("phone").notNull(),
  name: text("name"),
  email: text("email"),
  language: text("language").$type<Language>().notNull().default("en-NG"),
  stage: text("stage").$type<Stage>().notNull().default("new"),
  score: integer("score").notNull().default(0),
  score_breakdown: jsonb("score_breakdown").$type<ScoreItem[]>().notNull().default([]),
  temperature: text("temperature").$type<Temperature>().notNull().default("cold"),
  needs: jsonb("needs").$type<Needs>().notNull().default({}),
  source: jsonb("source").$type<LeadSource>().notNull().default({}),
  listing_id: uuid("listing_id"),
  assigned_agent_id: uuid("assigned_agent_id"),
  ai_paused: boolean("ai_paused").notNull().default(false),
  needs_human: boolean("needs_human").notNull().default(false),
  flag_reason: text("flag_reason"),
  spam: boolean("spam").notNull().default(false),
  consent_at: ts("consent_at"),
  opted_out_at: ts("opted_out_at"),
  last_inbound_at: ts("last_inbound_at"),
  last_outbound_at: ts("last_outbound_at"),
  ctx: jsonb("ctx").$type<LeadCtx>().notNull().default({}),
  created_at: created(),
  updated_at: ts("updated_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: id(),
  seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
  org_id: uuid("org_id").notNull(),
  lead_id: uuid("lead_id").notNull(),
  direction: text("direction").$type<"in" | "out" | "event">().notNull(),
  type: text("type").notNull().default("text"),
  body: text("body").notNull().default(""),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  author: text("author").notNull(),
  wa_message_id: text("wa_message_id"),
  status: text("status").notNull().default("received"),
  created_at: created(),
});

export const matches = pgTable("matches", {
  id: id(),
  org_id: uuid("org_id").notNull(),
  lead_id: uuid("lead_id").notNull(),
  listing_id: uuid("listing_id").notNull(),
  rank: integer("rank").notNull(),
  score: integer("score").notNull().default(0),
  reason: text("reason").notNull(),
  sent_at: ts("sent_at"),
  created_at: created(),
});

export type DraftStatus = "pending" | "approved" | "sent" | "rejected" | "expired";
export const drafts = pgTable("drafts", {
  id: id(),
  org_id: uuid("org_id").notNull(),
  lead_id: uuid("lead_id").notNull(),
  body: text("body").notNull(),
  original_body: text("original_body").notNull(),
  trigger: text("trigger").notNull(),
  status: text("status").$type<DraftStatus>().notNull().default("pending"),
  approved_by: uuid("approved_by"),
  sent_at: ts("sent_at"),
  expires_at: ts("expires_at").notNull(),
  created_at: created(),
});

export const availability = pgTable("availability", {
  id: id(),
  org_id: uuid("org_id").notNull(),
  agent_id: uuid("agent_id").notNull(),
  weekday: integer("weekday").notNull(),
  start_time: text("start_time").notNull(),
  end_time: text("end_time").notNull(),
  buffer_minutes: integer("buffer_minutes").notNull().default(45),
  max_per_day: integer("max_per_day").notNull().default(4),
});

export type ViewingStatus = "confirmed" | "cancelled" | "attended" | "no_show";
export const viewings = pgTable("viewings", {
  id: id(),
  org_id: uuid("org_id").notNull(),
  lead_id: uuid("lead_id").notNull(),
  listing_id: uuid("listing_id").notNull(),
  agent_id: uuid("agent_id"),
  start_at: ts("start_at").notNull(),
  end_at: ts("end_at").notNull(),
  status: text("status").$type<ViewingStatus>().notNull().default("confirmed"),
  reminders_sent: text("reminders_sent").array().notNull().default([]),
  created_at: created(),
});

export const jobs = pgTable("jobs", {
  id: id(),
  org_id: uuid("org_id"),
  type: text("type").notNull(),
  run_at: ts("run_at").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").$type<"queued" | "running" | "done" | "failed" | "cancelled">().notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  last_error: text("last_error"),
  dedupe_key: text("dedupe_key"),
  created_at: created(),
});

export const aiRuns = pgTable("ai_runs", {
  id: id(),
  org_id: uuid("org_id"),
  lead_id: uuid("lead_id"),
  agent: text("agent").notNull(),
  step: text("step").notNull().default("respond"),
  model: text("model").notNull(),
  prompt_version: text("prompt_version").notNull().default(""),
  input_tokens: integer("input_tokens").notNull().default(0),
  output_tokens: integer("output_tokens").notNull().default(0),
  cache_read_tokens: integer("cache_read_tokens").notNull().default(0),
  cost_usd: numeric("cost_usd", { mode: "number" }).notNull().default(0),
  latency_ms: integer("latency_ms").notNull().default(0),
  created_at: created(),
});

export const auditLog = pgTable("audit_log", {
  id: id(),
  org_id: uuid("org_id").notNull(),
  lead_id: uuid("lead_id"),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entity_id: text("entity_id"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  created_at: created(),
});

export const alerts = pgTable("alerts", {
  id: id(),
  org_id: uuid("org_id").notNull(),
  lead_id: uuid("lead_id"),
  kind: text("kind").notNull(),
  body: text("body").notNull(),
  read_at: ts("read_at"),
  created_at: created(),
});

export type Org = typeof organisations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type Viewing = typeof viewings.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type AvailabilityRule = typeof availability.$inferSelect;
