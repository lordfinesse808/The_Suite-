// Demo data: "Adaeze Homes" (Lagos + Abuja) with 30 clearly fictional listings,
// three users, viewing hours and leads in every stage. A second small org
// ("Ikoyi Keys") exists so tenant isolation can be demonstrated.
import { sql } from "drizzle-orm";
import type { DB } from "./client";
import * as s from "./schema";
import { hashPassword } from "../crypto";
import { findArea } from "../agents/areas";
import { now, HOUR, DAY } from "../clock";

export const DEMO = {
  orgName: "Adaeze Homes",
  phoneNumberId: "MOCK_PNID_ADAEZE",
  displayNumber: "+234 803 555 0142",
  ownerEmail: "adaeze@demo.ile",
  password: "demo1234",
  otherOrgPhoneNumberId: "MOCK_PNID_IKOYIKEYS",
};

type L = [ref: string, title: string, purpose: s.Purpose, type: string, beds: number, price: number, period: s.PricePeriod,
  area: string, features: string[], verified: boolean, extra?: Partial<typeof s.listings.$inferInsert>];

const LISTINGS: L[] = [
  ["LST-1042", "3-bed flat, Ikate", "rent", "flat", 3, 5_500_000, "year", "Ikate", ["BQ", "24h power", "fitted kitchen", "C of O on file"], true, { pinned: true, description: "Spacious 3-bed flat in a gated estate off Elegushi road, 8 minutes to Lekki Phase 1." }],
  ["LST-1043", "3-bed flat, Lekki Phase 1", "rent", "flat", 3, 6_000_000, "year", "Lekki Phase 1", ["serviced", "24h power", "parking", "Governor's Consent on file"], true, { service_charge: 800_000 }],
  ["LST-1044", "2-bed + study, Ikate", "rent", "flat", 2, 4_800_000, "year", "Ikate", ["study", "24h power", "security"], true],
  ["LST-1045", "4-bed terrace, Sangotedo", "sale", "terrace", 4, 120_000_000, "total", "Sangotedo", ["off-plan", "12-month payment plan", "gated estate"], true],
  ["LST-1046", "2-bed short-let, Victoria Island", "shortlet", "flat", 2, 85_000, "night", "Victoria Island", ["wifi", "24h power", "pool", "min. 2 nights", "caution fee"], true],
  ["LST-1047", "Mini flat, Yaba", "rent", "mini flat", 1, 1_800_000, "year", "Yaba", ["prepaid meter", "water"], false],
  ["LST-1048", "3-bed flat, Wuse 2, Abuja", "rent", "flat", 3, 9_000_000, "year", "Wuse 2", ["BQ", "24h power", "C of O on file"], true],
  ["LST-1049", "4-bed semi-detached duplex, Lekki Phase 1", "rent", "duplex", 4, 12_000_000, "year", "Lekki Phase 1", ["BQ", "24h power", "fitted kitchen", "parking"], true],
  ["LST-1050", "3-bed flat, Agungi", "rent", "flat", 3, 4_500_000, "year", "Agungi", ["BQ", "water", "parking"], true],
  ["LST-1051", "2-bed flat, Chevron", "rent", "flat", 2, 3_800_000, "year", "Chevron", ["serviced", "gym", "24h power"], true, { service_charge: 600_000 }],
  ["LST-1052", "3-bed bungalow, Ajah", "rent", "bungalow", 3, 2_500_000, "year", "Ajah", ["parking", "water"], false],
  ["LST-1053", "4-bed detached duplex, Ajah", "sale", "duplex", 4, 95_000_000, "total", "Ajah", ["BQ", "gated estate", "Governor's Consent on file"], true],
  ["LST-1054", "Plot of land (600 sqm), Ibeju-Lekki", "sale", "land", 0, 25_000_000, "total", "Ibeju-Lekki", ["dry land", "survey plan", "gated estate"], true],
  ["LST-1055", "2-bed flat, Yaba", "rent", "flat", 2, 2_800_000, "year", "Yaba", ["prepaid meter", "parking"], true],
  ["LST-1056", "Self-contain, Yaba", "rent", "self contain", 1, 900_000, "year", "Yaba", ["water"], false],
  ["LST-1057", "3-bed flat, Ikeja GRA", "rent", "flat", 3, 5_000_000, "year", "Ikeja GRA", ["BQ", "24h power", "security"], true],
  ["LST-1058", "2-bed flat, Ikeja", "rent", "flat", 2, 2_500_000, "year", "Ikeja", ["prepaid meter", "parking"], true],
  ["LST-1059", "3-bed flat, Gbagada", "rent", "flat", 3, 3_500_000, "year", "Gbagada", ["parking", "water", "security"], true],
  ["LST-1060", "4-bed terrace, Gbagada", "sale", "terrace", 4, 85_000_000, "total", "Gbagada", ["BQ", "C of O on file"], true],
  ["LST-1061", "1-bed short-let, Oniru", "shortlet", "flat", 1, 55_000, "night", "Oniru", ["wifi", "24h power", "Netflix"], true],
  ["LST-1062", "3-bed short-let, Lekki Phase 1", "shortlet", "flat", 3, 120_000, "night", "Lekki Phase 1", ["pool", "wifi", "24h power", "chef on request"], true],
  ["LST-1063", "Studio short-let, Ikoyi", "shortlet", "studio", 1, 70_000, "night", "Ikoyi", ["wifi", "gym", "24h power"], true],
  ["LST-1064", "4-bed duplex, Ikoyi", "rent", "duplex", 4, 35_000_000, "year", "Ikoyi", ["pool", "BQ", "24h power", "serviced"], true, { service_charge: 4_000_000 }],
  ["LST-1065", "3-bed flat, Maitama, Abuja", "rent", "flat", 3, 12_000_000, "year", "Maitama", ["BQ", "24h power", "serviced"], true],
  ["LST-1066", "4-bed detached duplex, Maitama, Abuja", "sale", "duplex", 4, 450_000_000, "total", "Maitama", ["BQ", "pool", "C of O on file"], true],
  ["LST-1067", "3-bed terrace, Gwarinpa, Abuja", "rent", "terrace", 3, 4_500_000, "year", "Gwarinpa", ["BQ", "parking"], true],
  ["LST-1068", "4-bed semi-detached duplex, Gwarinpa, Abuja", "sale", "duplex", 4, 110_000_000, "total", "Gwarinpa", ["BQ", "C of O on file"], true],
  ["LST-1069", "2-bed flat, Wuse 2, Abuja", "rent", "flat", 2, 6_000_000, "year", "Wuse 2", ["24h power", "serviced"], true],
  ["LST-1070", "2-bed flat, Jabi, Abuja", "rent", "flat", 2, 4_000_000, "year", "Jabi", ["parking", "24h power"], false],
  ["LST-1071", "3-bed flat, Surulere", "rent", "flat", 3, 2_200_000, "year", "Surulere", ["prepaid meter", "water"], true, { status: "taken" }],
];

const OTHER_ORG_LISTINGS: L[] = [
  ["LST-9001", "5-bed mansion, Banana Island", "sale", "duplex", 5, 1_500_000_000, "total", "Ikoyi", ["pool", "cinema"], true],
  ["LST-9002", "3-bed flat, Old Ikoyi", "rent", "flat", 3, 15_000_000, "year", "Ikoyi", ["24h power"], true],
];

export async function seedIfEmpty(db: DB) {
  const existing = await db.select({ id: s.organisations.id }).from(s.organisations).limit(1);
  if (existing.length) return false;
  await seed(db);
  return true;
}

function listingRow(org_id: string, l: L, agent_id: string | null): typeof s.listings.$inferInsert {
  const [ref_code, title, purpose, property_type, bedrooms, price_amount, price_period, area, features, verified, extra] = l;
  const a = findArea(area);
  return {
    org_id, ref_code, title, purpose, property_type, bedrooms, bathrooms: Math.max(1, bedrooms), price_amount, price_period,
    area, city: a?.city ?? "Lagos", address: `${10 + (Number(ref_code.slice(-2)) % 40)} Demo Close, ${area}, ${a?.city ?? "Lagos"} (fictional)`,
    lat: a ? a.lat + ((Number(ref_code.slice(-2)) % 7) - 3) * 0.002 : null,
    lng: a ? a.lng + ((Number(ref_code.slice(-2)) % 5) - 2) * 0.002 : null,
    features, verified, agent_id,
    description: extra?.description ?? `${title}. ${features.join(", ")}. Fictional demo listing.`,
    ...extra,
  };
}

export async function seed(db: DB) {
  const t0 = now();
  const pw = hashPassword(DEMO.password);

  const [org] = await db.insert(s.organisations).values({
    name: DEMO.orgName,
    areas_served: ["Lekki Phase 1", "Ikate", "Ajah", "Sangotedo", "Yaba", "Ikeja", "Gbagada", "Victoria Island", "Maitama", "Wuse 2", "Gwarinpa"],
    tone_notes: "Warm but brief. Use the lead's first name once they share it. Never pushy.",
    consent_message: "You're chatting with Adaeze Homes' assistant. We use your details only to help you find a home. Reply STOP at any time.",
    fees_policy: "Agency and legal fees are confirmed by an agent before any payment. We never ask for payment before a viewing.",
    public_key: "pk_demo_adaeze",
    allowed_origins: ["http://localhost:3000", "https://adaezehomes.example"],
    onboarding_step: 4,
    settings: { auto_send_followups: false, answer_web_form: true },
  }).returning();

  const [adaeze, tunde, halima] = await db.insert(s.users).values([
    { email: DEMO.ownerEmail, name: "Adaeze Okafor", password_hash: pw },
    { email: "tunde@demo.ile", name: "Tunde O.", password_hash: pw },
    { email: "halima@demo.ile", name: "Halima B.", password_hash: pw },
  ]).returning();

  await db.insert(s.memberships).values([
    { user_id: adaeze.id, org_id: org.id, role: "owner" },
    { user_id: tunde.id, org_id: org.id, role: "agent" },
    { user_id: halima.id, org_id: org.id, role: "agent" },
  ]);

  await db.insert(s.whatsappAccounts).values({
    org_id: org.id, phone_number_id: DEMO.phoneNumberId, waba_id: "MOCK_WABA", display_number: DEMO.displayNumber, display_name: "Adaeze Homes",
  });

  // Viewing hours: Mon-Sat 9:00-17:00 for both agents (Friday is an office day for Tunde).
  const avail: (typeof s.availability.$inferInsert)[] = [];
  for (const agent of [tunde, halima]) {
    for (const wd of [1, 2, 3, 4, 5, 6]) {
      if (agent.id === tunde.id && wd === 5) continue;
      avail.push({ org_id: org.id, agent_id: agent.id, weekday: wd, start_time: "09:00", end_time: "17:00", buffer_minutes: 45, max_per_day: 4 });
    }
  }
  await db.insert(s.availability).values(avail);

  const rows = await db.insert(s.listings).values(
    LISTINGS.map((l) => listingRow(org.id, l, findArea(l[7])?.city === "Abuja" ? halima.id : tunde.id)),
  ).returning();
  const byRef = new Map(rows.map((r) => [r.ref_code, r]));
  const L = (ref: string) => byRef.get(ref)!;

  // ---- Leads in each stage ----
  const ago = (ms: number) => new Date(t0.getTime() - ms);
  type Seeded = { lead: Omit<typeof s.leads.$inferInsert, "org_id">; msgs: [dir: "in" | "out" | "event", author: string, body: string, agoMs: number][] };

  const lagosAgent = tunde.id;
  const seeded: Seeded[] = [
    {
      lead: {
        phone: "+2348034414471", name: "Chiamaka Eze", stage: "viewing_booked", score: 92, temperature: "hot", language: "en-NG",
        needs: { purpose: "rent", budget_max: 6_000_000, period: "year", areas: ["Lekki Phase 1", "Ikate"], property_type: "flat", bedrooms_min: 3, move_in_by: new Date(t0.getFullYear(), 11, 31).toISOString().slice(0, 10), move_in_text: "December", financing: "cash" },
        source: { channel: "whatsapp", page: "instagram" }, listing_id: L("LST-1042").id, assigned_agent_id: lagosAgent,
        consent_at: ago(7 * HOUR), last_inbound_at: ago(6.8 * HOUR), last_outbound_at: ago(6.8 * HOUR),
        ctx: { questions_asked: 3, shortlist: [L("LST-1042").id, L("LST-1043").id, L("LST-1044").id] },
      },
      msgs: [
        ["in", "lead", "Good evening. I saw the 3-bed in Lekki on your Instagram. Is it still available?", 7 * HOUR],
        ["out", "ai:qualifier", "Good evening. Yes, it is. I'm Adaeze Homes' assistant and can help right away. We'll save your details to help with your search, and you can reply STOP at any time. Is this to rent or to buy?", 7 * HOUR - 6000],
        ["in", "lead", "Rent. My budget is around 6m a year, Lekki Phase 1 or Ikate. I want to move by December.", 6.95 * HOUR],
        ["event", "system", "Qualified · score 92 · handed to Matchmaker", 6.94 * HOUR],
        ["out", "ai:matchmaker", "Here are 3 homes that fit ₦6,000,000 a year. The Ikate 3-bed is ₦5,500,000 / yr, 8 minutes from Lekki Phase 1, and verified.", 6.93 * HOUR],
        ["in", "lead", "The Ikate one. Can I see it this weekend?", 6.85 * HOUR],
        ["out", "ai:scheduler", "Booked: Saturday, 11:30, with Tunde. I've sent the location pin. I'll remind you the day before and 2 hours before.", 6.8 * HOUR],
      ],
    },
    {
      lead: {
        phone: "+2348021118890", name: "Femi Adeyemi", stage: "shortlisted", score: 78, temperature: "hot", language: "en-NG",
        needs: { purpose: "sale", budget_max: 120_000_000, period: "total", areas: ["Ajah", "Sangotedo"], property_type: "terrace", bedrooms_min: 4, financing: "mortgage" },
        source: { channel: "whatsapp", page: "instagram" }, assigned_agent_id: lagosAgent,
        consent_at: ago(2 * DAY), last_inbound_at: ago(26 * HOUR), last_outbound_at: ago(25.9 * HOUR),
        ctx: { questions_asked: 4, followup_touches: 0, shortlist: [L("LST-1045").id, L("LST-1053").id] },
      },
      msgs: [
        ["in", "lead", "Hello, I'm looking to buy a 4-bed terrace around Ajah or Sangotedo. Budget about 120m, mortgage.", 26.2 * HOUR],
        ["out", "ai:qualifier", "Hello. Thanks for the details. We'll save them to help with your search, and you can reply STOP at any time. When would you like to move?", 26.15 * HOUR],
        ["in", "lead", "Early next year.", 26 * HOUR],
        ["out", "ai:matchmaker", "Here are 2 homes that fit. The Sangotedo 4-bed terrace is ₦120,000,000 with a 12-month payment plan.", 25.9 * HOUR],
      ],
    },
    {
      lead: {
        phone: "+2348067773321", name: "Bisi Lawal", stage: "shortlisted", score: 81, temperature: "hot", language: "en-NG",
        needs: { purpose: "shortlet", budget_max: 85_000, period: "night", areas: ["Victoria Island"], bedrooms_min: 2, nights: 4 },
        source: { channel: "web_form", page: "/shortlets" }, assigned_agent_id: lagosAgent,
        consent_at: ago(3 * HOUR), last_inbound_at: ago(2.5 * HOUR), last_outbound_at: ago(2.4 * HOUR),
        ctx: { shortlist: [L("LST-1046").id, L("LST-1061").id, L("LST-1063").id] },
      },
      msgs: [
        ["in", "lead", "Need a 2-bed short-let in VI for 4 nights, around 85k per night", 2.6 * HOUR],
        ["out", "ai:matchmaker", "Here are 3 short-lets near Victoria Island. The 2-bed on VI is ₦85,000 / night with a pool and 24h power.", 2.4 * HOUR],
      ],
    },
    {
      lead: {
        phone: "+447700900123", name: "Kunle Ade", stage: "qualifying", score: 64, temperature: "warm", language: "en-NG",
        needs: { purpose: "sale", budget_max: 95_000_000, period: "total", areas: ["Lekki Phase 1"], bedrooms_min: 3, financing: "instalments" },
        source: { channel: "web_form", page: "/off-plan" }, assigned_agent_id: lagosAgent, needs_human: true, ai_paused: true, flag_reason: "Asked for a human",
        consent_at: ago(4 * HOUR), last_inbound_at: ago(3.5 * HOUR), last_outbound_at: ago(3.4 * HOUR),
      },
      msgs: [
        ["in", "lead", "Hi, I'm in London. Looking at off-plan 3-bed in Lekki, ~95m in instalments. Can I speak to someone directly?", 3.5 * HOUR],
        ["out", "ai:qualifier", "Hello Kunle. Thank you. I've asked Tunde to continue with you here shortly. We'll save your details for this, and you can reply STOP at any time.", 3.4 * HOUR],
      ],
    },
    {
      lead: {
        phone: "+2348099990001", name: "Ngozi Obi", stage: "shortlisted", score: 58, temperature: "warm", language: "pcm",
        needs: { purpose: "rent", budget_max: 1_800_000, period: "year", areas: ["Yaba"], property_type: "mini flat", bedrooms_min: 1, move_in_text: "January" },
        source: { channel: "whatsapp" }, assigned_agent_id: lagosAgent,
        consent_at: ago(5 * HOUR), last_inbound_at: ago(4 * HOUR), last_outbound_at: ago(3.9 * HOUR),
        ctx: { shortlist: [L("LST-1047").id, L("LST-1056").id] },
      },
      msgs: [
        ["in", "lead", "Abeg I dey find mini flat for Yaba, my budget na 1.8m", 4.2 * HOUR],
        ["out", "ai:qualifier", "Good afternoon. I fit help you. We go keep your details to help your search, and you fit reply STOP any time. When you wan move in?", 4.15 * HOUR],
        ["in", "lead", "January. Any one wey cheap pass?", 4 * HOUR],
        ["out", "ai:matchmaker", "See 2 wey fit your budget. The self-contain for Yaba na ₦900,000 / yr.", 3.9 * HOUR],
      ],
    },
    {
      lead: {
        phone: "+2348035556677", name: "Ibrahim Musa", stage: "viewing_booked", score: 88, temperature: "hot", language: "en-NG",
        needs: { purpose: "rent", budget_max: 9_000_000, period: "year", areas: ["Wuse 2"], property_type: "flat", bedrooms_min: 3, move_in_text: "November" },
        source: { channel: "whatsapp" }, listing_id: L("LST-1048").id, assigned_agent_id: halima.id,
        consent_at: ago(8 * HOUR), last_inbound_at: ago(7.9 * HOUR), last_outbound_at: ago(7.8 * HOUR),
      },
      msgs: [
        ["in", "lead", "Good morning, 3-bed in Wuse 2, 9m per year, moving November", 8 * HOUR],
        ["out", "ai:scheduler", "Good morning. You're booked to view the Wuse 2 3-bed with Halima. I've sent the location pin.", 7.8 * HOUR],
      ],
    },
    {
      lead: {
        phone: "+2348091112210", name: null, stage: "new", score: 22, temperature: "cold", language: "en-NG",
        needs: {}, source: { channel: "whatsapp", referral: { source_type: "ad", headline: "Lekki homes" } },
        spam: true, ai_paused: true, flag_reason: "Scam signals", assigned_agent_id: lagosAgent,
        last_inbound_at: ago(9 * HOUR), last_outbound_at: ago(8.9 * HOUR),
      },
      msgs: [
        ["in", "lead", "Send your account number first so I can pay deposit before viewing, I am abroad", 9 * HOUR],
        ["out", "ai:qualifier", "Thank you. We never take payment before a viewing, and an agent will continue with you here. We'll save your details for this, and you can reply STOP at any time.", 8.9 * HOUR],
      ],
    },
    {
      lead: {
        phone: "+2348057778899", name: "Tolu Bankole", stage: "shortlisted", score: 41, temperature: "warm", language: "en-NG",
        needs: { purpose: "sale", budget_max: 25_000_000, period: "total", areas: ["Ibeju-Lekki"], property_type: "land", financing: "cash" },
        source: { channel: "whatsapp" }, assigned_agent_id: lagosAgent,
        consent_at: ago(4 * DAY), last_inbound_at: ago(4 * DAY), last_outbound_at: ago(3 * DAY),
        ctx: { followup_touches: 2, shortlist: [L("LST-1054").id] },
      },
      msgs: [
        ["in", "lead", "Land in Ibeju-Lekki, 25m cash", 4 * DAY],
        ["out", "ai:matchmaker", "There is a 600 sqm plot in Ibeju-Lekki at ₦25,000,000 in a gated estate.", 4 * DAY - 60_000],
      ],
    },
    {
      lead: {
        phone: "+2348011234567", name: "Amaka Nwosu", stage: "viewed", score: 90, temperature: "hot", language: "en-NG",
        needs: { purpose: "rent", budget_max: 12_000_000, period: "year", areas: ["Lekki Phase 1"], property_type: "duplex", bedrooms_min: 4 },
        source: { channel: "whatsapp" }, listing_id: L("LST-1049").id, assigned_agent_id: lagosAgent,
        consent_at: ago(6 * DAY), last_inbound_at: ago(1 * DAY), last_outbound_at: ago(1 * DAY),
      },
      msgs: [["in", "lead", "Thanks for the viewing. We like the duplex.", 1 * DAY]],
    },
    {
      lead: { phone: "+2348022223333", name: "Yusuf Bello", stage: "won", score: 86, temperature: "hot", needs: { purpose: "rent", areas: ["Lekki Phase 1"], bedrooms_min: 3, budget_max: 6_500_000, period: "year" }, source: { channel: "whatsapp" }, consent_at: ago(20 * DAY), last_inbound_at: ago(10 * DAY), assigned_agent_id: lagosAgent },
      msgs: [["in", "lead", "Payment done, thank you.", 10 * DAY]],
    },
    {
      lead: { phone: "+2348044445555", name: "Efe Okoro", stage: "won", score: 75, temperature: "hot", needs: { purpose: "shortlet", areas: ["Oniru"], bedrooms_min: 1, nights: 7, budget_max: 60_000, period: "night" }, source: { channel: "web_form" }, consent_at: ago(15 * DAY), last_inbound_at: ago(12 * DAY), assigned_agent_id: lagosAgent },
      msgs: [["in", "lead", "Booked for 7 nights, see you.", 12 * DAY]],
    },
    {
      lead: { phone: "+2348066667777", name: "Segun Afolabi", stage: "lost", score: 35, temperature: "cold", needs: { purpose: "rent", areas: ["Ikoyi"], bedrooms_min: 3, budget_max: 4_000_000, period: "year" }, source: { channel: "whatsapp" }, flag_reason: "Budget below area", consent_at: ago(9 * DAY), last_inbound_at: ago(8 * DAY), assigned_agent_id: lagosAgent },
      msgs: [["in", "lead", "Too expensive for me, thanks.", 8 * DAY]],
    },
  ];

  const leadIds: Record<string, string> = {};
  for (const sd of seeded) {
    const [lead] = await db.insert(s.leads).values({ ...sd.lead, org_id: org.id }).returning();
    leadIds[lead.name ?? lead.phone] = lead.id;
    if (sd.msgs.length) {
      await db.insert(s.messages).values(sd.msgs.map(([direction, author, body, a], i) => ({
        org_id: org.id, lead_id: lead.id, direction, author, body, type: direction === "event" ? "event" : "text",
        status: direction === "in" ? "received" : direction === "out" ? "delivered" : "logged",
        wa_message_id: direction === "event" ? null : `seed.${lead.id.slice(0, 8)}.${i}`,
        created_at: ago(a),
      })));
    }
    if (sd.lead.ctx?.shortlist) {
      await db.insert(s.matches).values(sd.lead.ctx.shortlist.map((listing_id, i) => ({
        org_id: org.id, lead_id: lead.id, listing_id, rank: i + 1, score: 94 - i * 6,
        reason: i === 0 ? "Best fit for budget and area" : "Also fits the stated needs", sent_at: ago(6.9 * HOUR),
      })));
    }
  }

  // Viewings this week
  const nextDow = (dow: number, hh: number, mm: number) => {
    const d = new Date(t0);
    const lagos = new Date(d.getTime() + HOUR); // UTC+1
    let add = (dow - lagos.getUTCDay() + 7) % 7;
    if (add === 0) add = 7;
    const day = new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate() + add, hh - 1, mm));
    return day;
  };
  const v1 = nextDow(6, 11, 30);
  const v2 = nextDow(1, 10, 0);
  await db.insert(s.viewings).values([
    { org_id: org.id, lead_id: leadIds["Chiamaka Eze"], listing_id: L("LST-1042").id, agent_id: tunde.id, start_at: v1, end_at: new Date(v1.getTime() + 45 * 60_000) },
    { org_id: org.id, lead_id: leadIds["Ibrahim Musa"], listing_id: L("LST-1048").id, agent_id: halima.id, start_at: v2, end_at: new Date(v2.getTime() + 45 * 60_000) },
    { org_id: org.id, lead_id: leadIds["Amaka Nwosu"], listing_id: L("LST-1049").id, agent_id: tunde.id, start_at: ago(2 * DAY), end_at: ago(2 * DAY - 45 * 60_000), status: "attended" },
    { org_id: org.id, lead_id: leadIds["Yusuf Bello"], listing_id: L("LST-1043").id, agent_id: tunde.id, start_at: ago(14 * DAY), end_at: ago(14 * DAY - 45 * 60_000), status: "attended" },
  ]);
  for (const [lead, v] of [["Chiamaka Eze", v1], ["Ibrahim Musa", v2]] as const) {
    for (const [kind, before] of [["reminder_24h", DAY], ["reminder_2h", 2 * HOUR]] as const) {
      const run = new Date(v.getTime() - before);
      if (run > t0) {
        await db.insert(s.jobs).values({ org_id: org.id, type: kind, run_at: run, payload: { lead_id: leadIds[lead] }, dedupe_key: `${kind}:${leadIds[lead]}:${v.toISOString()}` });
      }
    }
  }

  // A pending follow-up draft (Femi went quiet 26 hours ago)
  await db.insert(s.drafts).values({
    org_id: org.id, lead_id: leadIds["Femi Adeyemi"], trigger: "silent_24h", expires_at: new Date(t0.getTime() + 48 * HOUR),
    body: "Hi Femi, Adaeze here. Did you get a chance to look at the Sangotedo terrace? It is ₦120,000,000 with a 12-month payment plan, which may suit the mortgage route you mentioned. I can hold a viewing slot for you this week. Shall I?\n\nReply STOP to opt out.",
    original_body: "Hi Femi, Adaeze here. Did you get a chance to look at the Sangotedo terrace? It is ₦120,000,000 with a 12-month payment plan, which may suit the mortgage route you mentioned. I can hold a viewing slot for you this week. Shall I?\n\nReply STOP to opt out.",
  });
  await db.update(s.leads).set({ ctx: { followup_touches: 1, shortlist: [L("LST-1045").id, L("LST-1053").id] } }).where(sql`id = ${leadIds["Femi Adeyemi"]}`);

  await db.insert(s.alerts).values([
    { org_id: org.id, lead_id: leadIds["Kunle Ade"], kind: "human_requested", body: "Kunle Ade asked for a person." },
    { org_id: org.id, lead_id: leadIds["+2348091112210"], kind: "spam", body: "Scam signals on +234 809 ··· 2210. AI paused." },
  ]);

  // ---- Second org (for tenancy demos) ----
  const [other] = await db.insert(s.organisations).values({
    name: "Ikoyi Keys", public_key: "pk_demo_ikoyikeys", areas_served: ["Ikoyi"], onboarding_step: 4,
    consent_message: "You're chatting with Ikoyi Keys' assistant. Reply STOP at any time.",
  }).returning();
  const [otherOwner] = await db.insert(s.users).values({ email: "owner@ikoyikeys.ile", name: "Bola Ade", password_hash: pw }).returning();
  await db.insert(s.memberships).values({ user_id: otherOwner.id, org_id: other.id, role: "owner" });
  await db.insert(s.whatsappAccounts).values({ org_id: other.id, phone_number_id: DEMO.otherOrgPhoneNumberId, display_number: "+234 802 000 0000", display_name: "Ikoyi Keys" });
  await db.insert(s.listings).values(OTHER_ORG_LISTINGS.map((l) => listingRow(other.id, l, otherOwner.id)));
  await db.insert(s.availability).values([1, 2, 3, 4, 5].map((wd) => ({ org_id: other.id, agent_id: otherOwner.id, weekday: wd, start_time: "10:00", end_time: "16:00" })));
  await db.insert(s.leads).values({ org_id: other.id, phone: "+2348100000000", name: "Private Lead", stage: "qualifying", needs: { purpose: "rent" } });

  return { orgId: org.id, otherOrgId: other.id, ownerId: adaeze.id, agentIds: [tunde.id, halima.id], publicKey: org.public_key };
}
