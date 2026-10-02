// End-to-end agent flows in mock mode, through signed webhooks.
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { getDb } from "@/lib/db/client";
import { advanceClock, resetClock, HOUR } from "@/lib/clock";
import { tick } from "@/lib/jobs/queue";
import { approveDraft } from "@/lib/agents/followup";
import { checkReply, hasConsent } from "@/lib/agents/guardrails";
import { POST as publicLeads } from "@/app/api/public/leads/route";
import { setup, chat } from "./helpers";

let ids: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ids = await setup();
});
beforeEach(() => resetClock());

let n = 0;
const phone = () => `+23480700000${String(++n).padStart(2, "0")}`;
const texts = (out: s.Message[]) => out.map((m) => m.body).join(" | ");

describe("Qualifier → Matchmaker → Scheduler", () => {
  test("English lead is qualified, matched and booked; reminders fire", async () => {
    const p = phone();
    const r1 = await chat(p, { text: "Good evening. I saw the 3-bed in Lekki on your Instagram. Is it still available?" }, { name: "Chiamaka" });
    expect(r1.out).toHaveLength(1);
    expect(hasConsent(r1.out[0].body)).toBe(true);
    expect(r1.lead!.stage).toBe("qualifying");

    const r2 = await chat(p, { text: "Rent. My budget is around 6m a year, Lekki Phase 1 or Ikate. I want to move by December. My name is Chiamaka Eze" });
    expect(r2.lead!.stage).toBe("shortlisted");
    expect(r2.lead!.name).toBe("Chiamaka Eze");
    expect(r2.lead!.temperature).toBe("hot");
    const images = r2.out.filter((m) => m.type === "image");
    expect(images.length).toBeGreaterThanOrEqual(3);
    expect(images.length).toBeLessThanOrEqual(5);
    expect(images[0].body).toContain("₦");
    expect(r2.out.at(-1)!.type).toBe("list");

    const r3 = await chat(p, { text: "The Ikate one. Can I see it this weekend?" });
    expect(r3.out[0].type).toBe("buttons");
    const buttons = (r3.out[0].payload as { buttons: { id: string }[] }).buttons;
    expect(buttons).toHaveLength(3);

    const r4 = await chat(p, { reply: "slot:1", title: "first" });
    expect(r4.lead!.stage).toBe("viewing_booked");
    expect(r4.out.map((m) => m.type)).toEqual(["text", "location"]);
    const db = await getDb();
    const [v] = await db.select().from(s.viewings).where(eq(s.viewings.lead_id, r4.lead!.id));
    expect(v.status).toBe("confirmed");

    // A 24h reminder is only scheduled when the viewing is more than 24 hours away.
    const expected = v.start_at.getTime() - Date.now() > 24 * HOUR ? ["24h", "2h"] : ["2h"];
    // Time-shifted: jump to just inside 2 hours before the viewing; due reminders fire.
    advanceClock(v.start_at.getTime() - Date.now() - 2 * HOUR + 60_000);
    await tick();
    const [after] = await db.select().from(s.viewings).where(eq(s.viewings.id, v.id));
    expect(after.reminders_sent.sort()).toEqual(expected);
    const out = await db.select().from(s.messages).where(and(eq(s.messages.lead_id, v.lead_id), eq(s.messages.direction, "out")));
    expect(out.filter((m) => String((m.payload as { reason?: string }).reason).startsWith("reminder")).length).toBe(expected.length);
  });

  test("Pidgin lead gets Pidgin replies and cheaper options", async () => {
    const p = phone();
    const r1 = await chat(p, { text: "How far, abeg I dey find mini flat for Yaba. My budget na 1.8m every year" });
    expect(r1.lead!.language).toBe("pcm");
    expect(texts(r1.out)).toMatch(/STOP/);
    expect(texts(r1.out)).toMatch(/\b(wan|dey|go|fit|na)\b/);
    const r2 = await chat(p, { text: "I wan move January" });
    // purpose was not stated: still qualifying, or matched once qualified
    const r3 = r2.lead!.stage === "qualifying" ? await chat(p, { text: "Na rent" }) : r2;
    expect(r3.lead!.stage).toBe("shortlisted");
    expect(texts(r3.out)).not.toMatch(/Here are|Is this to rent/); // stays in Pidgin
    const r4 = await chat(p, { text: "Abeg una get the one wey cheap pass?" });
    // Nothing cheaper exists in Yaba: the Matchmaker says so honestly instead of inventing options.
    expect(r4.out[0].author).toBe("ai:matchmaker");
    expect(r4.out[0].body).toMatch(/no get|Nothing|See the ones/);
  });

  test("lead from a wa.me listing link is attached to that listing", async () => {
    const p = phone();
    const r = await chat(p, { text: "Hi, I'm interested in LST-1042" });
    expect(r.lead!.source.listing_ref).toBe("LST-1042");
    expect(r.out[0].body).toMatch(/3-bed flat, Ikate/);
    expect(r.lead!.needs).toMatchObject({ purpose: "rent", areas: ["Ikate"], bedrooms_min: 3 });
  });

  test("reschedule and cancel by chat", async () => {
    const p = phone();
    await chat(p, { text: "I'm interested in LST-1043. I want to view it." });
    const r = await chat(p, { reply: "slot:2", title: "second" });
    expect(r.lead!.stage).toBe("viewing_booked");
    const r2 = await chat(p, { text: "Something came up, can we reschedule?" });
    expect(r2.out.at(-1)!.type).toBe("buttons");
    const db = await getDb();
    const vs = await db.select().from(s.viewings).where(eq(s.viewings.lead_id, r.lead!.id));
    expect(vs.map((v) => v.status)).toContain("cancelled");
    await chat(p, { reply: "slot:1", title: "first" });
    const r4 = await chat(p, { text: "Please cancel the viewing" });
    expect(r4.lead!.stage).toBe("shortlisted");
    const vs2 = await db.select().from(s.viewings).where(eq(s.viewings.lead_id, r.lead!.id));
    expect(vs2.every((v) => v.status === "cancelled")).toBe(true);
  });
});

describe("consent, opt-out, takeover and hand-offs", () => {
  test("STOP blocks everything; START re-subscribes", async () => {
    const p = phone();
    await chat(p, { text: "Hello, looking for a flat in Yaba" });
    const r = await chat(p, { text: "STOP" });
    expect(r.lead!.opted_out_at).not.toBeNull();
    expect(r.out).toHaveLength(1);
    const r2 = await chat(p, { text: "Hello?" });
    expect(r2.out).toHaveLength(0);
    const r3 = await chat(p, { text: "START" });
    expect(r3.lead!.opted_out_at).toBeNull();
    expect(r3.out).toHaveLength(1);
  });

  test("human takeover silences the AI", async () => {
    const p = phone();
    const r = await chat(p, { text: "Hello" });
    const db = await getDb();
    await db.update(s.leads).set({ ai_paused: true }).where(eq(s.leads.id, r.lead!.id));
    const r2 = await chat(p, { text: "Rent in Yaba, 2m, 2 bedrooms" });
    expect(r2.out).toHaveLength(0);
    expect(r2.lead!.needs).toMatchObject({ purpose: "rent", areas: ["Yaba"] }); // still extracted for the agent
  });

  test("Yoruba is handed to a human", async () => {
    const r = await chat(phone(), { text: "Ẹ kú àárọ̀. Mo fẹ́ ilé ní Lekki, ẹ jọ̀wọ́" });
    expect(r.lead!.needs_human).toBe(true);
    expect(r.lead!.ai_paused).toBe(true);
    expect(r.out[0].body).toMatch(/colleague/i);
    expect(hasConsent(r.out[0].body)).toBe(true);
  });

  test("scam attempt pauses the AI and never asks for money", async () => {
    const r = await chat(phone(), { text: "I am abroad. Send me your account number first so I can pay the deposit before viewing" });
    expect(r.lead!.spam).toBe(true);
    expect(r.lead!.ai_paused).toBe(true);
    expect(r.lead!.temperature).toBe("cold");
    expect(r.out[0].body).toMatch(/never|do not collect/i);
  });

  test("voice notes get a text request", async () => {
    const r = await chat(phone(), { audio: true });
    expect(r.out[0].body).toMatch(/voice note/i);
  });

  test("asking for a person", async () => {
    const p = phone();
    await chat(p, { text: "Hi, 3 bed in Lekki" });
    const r = await chat(p, { text: "Can I talk to a real person please" });
    expect(r.lead!.needs_human).toBe(true);
    expect(r.out[0].body).toMatch(/shortly/);
  });
});

describe("Follow-up writer", () => {
  test("quiet lead gets a draft; approval sends it (template outside the window)", async () => {
    const p = phone();
    await chat(p, { text: "Rent, 3 bed in Ikate, 6m per year, moving in December" });
    advanceClock(25 * HOUR);
    const t = await tick({ scan: true });
    expect(t.drafts).toBeGreaterThanOrEqual(1);
    const db = await getDb();
    const [lead] = await db.select().from(s.leads).where(eq(s.leads.phone, p));
    const [d] = await db.select().from(s.drafts).where(and(eq(s.drafts.lead_id, lead.id), eq(s.drafts.status, "pending")));
    expect(d.body).toMatch(/STOP/);
    expect(checkReply(d.body.replace(/\n/g, " "), { allowedAmounts: [5_500_000, 6_000_000, 4_800_000, 4_500_000], previousAi: [], requireConsent: false }).problems.filter((x) => x.startsWith("invented"))).toEqual([]);
    const res = await approveDraft(ids.orgId, d.id, ids.ownerId);
    expect(res).toMatchObject({ ok: true, via: "template" });
    const [sent] = await db.select().from(s.drafts).where(eq(s.drafts.id, d.id));
    expect(sent.status).toBe("sent");
    // second touch only after 72h, never more than 2
    advanceClock(48 * HOUR);
    await tick({ scan: true });
    advanceClock(72 * HOUR);
    await tick({ scan: true });
    const all = await db.select().from(s.drafts).where(eq(s.drafts.lead_id, lead.id));
    expect(all.length).toBe(2);
  });

  test("inside the window the approved draft goes as free text", async () => {
    const db = await getDb();
    const [femi] = await db.select().from(s.leads).where(eq(s.leads.name, "Femi Adeyemi"));
    await db.update(s.leads).set({ last_inbound_at: new Date() }).where(eq(s.leads.id, femi.id));
    const [d] = await db.select().from(s.drafts).where(and(eq(s.drafts.lead_id, femi.id), eq(s.drafts.status, "pending")));
    const res = await approveDraft(ids.orgId, d.id, ids.ownerId, d.body + " Edited.");
    expect(res).toMatchObject({ ok: true, via: "text" });
  });
});

describe("website lead form", () => {
  const req = (body: Record<string, unknown>, origin = "https://adaezehomes.example") =>
    new Request("http://localhost/api/public/leads", { method: "POST", headers: { "content-type": "application/json", origin, "x-forwarded-for": `10.0.0.${++n}` }, body: JSON.stringify(body) });

  test("creates the lead and starts WhatsApp with the template", async () => {
    const res = await publicLeads(req({ key: "pk_demo_adaeze", name: "Bola Ade", phone: "0803 555 1234", listing_ref: "LST-1046", consent: true }));
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.whatsapp).toBe("sent");
    const db = await getDb();
    const [lead] = await db.select().from(s.leads).where(eq(s.leads.id, j.lead_id));
    expect(lead.phone).toBe("+2348035551234");
    expect(lead.source.listing_ref).toBe("LST-1046");
  });
  test("rejects bad keys and foreign origins", async () => {
    expect((await publicLeads(req({ key: "nope", phone: "08030000000" }))).status).toBe(401);
    expect((await publicLeads(req({ key: "pk_demo_adaeze", phone: "08030000000" }, "https://evil.example"))).status).toBe(403);
    expect((await publicLeads(req({ key: "pk_demo_adaeze" }))).status).toBe(400);
  });
  test("no consent, no message", async () => {
    const j = await (await publicLeads(req({ key: "pk_demo_adaeze", phone: "08035559999" }))).json();
    expect(j.whatsapp).toBe("skipped");
  });
});

describe("Scheduler slots", () => {
  test("slots respect hours, travel buffer, 2-hour lead time and existing viewings", async () => {
    const { freeSlots } = await import("@/lib/agents/scheduler");
    const db = await getDb();
    const [tunde] = await db.select().from(s.users).where(eq(s.users.email, "tunde@demo.ile"));
    const from = new Date("2026-10-05T07:00:00Z"); // Monday 08:00 Lagos
    const slots = await freeSlots(ids.orgId, tunde.id, { from, count: 3 });
    expect(slots).toHaveLength(3);
    for (const sl of slots) {
      const lagosH = (sl.getUTCHours() + 1) % 24;
      expect(lagosH).toBeGreaterThanOrEqual(9);
      expect(lagosH).toBeLessThan(17);
      expect(sl.getTime() - from.getTime()).toBeGreaterThanOrEqual(2 * HOUR);
      expect(new Date(sl.getTime() + HOUR).getUTCDay()).not.toBe(5); // Tunde's Friday is an office day
    }
    // Book the first slot; the next offer keeps the buffer around it.
    await db.insert(s.viewings).values({ org_id: ids.orgId, lead_id: (await db.select().from(s.leads).limit(1))[0].id, listing_id: (await db.select().from(s.listings).limit(1))[0].id, agent_id: tunde.id, start_at: slots[0], end_at: new Date(slots[0].getTime() + 45 * 60_000) });
    const again = await freeSlots(ids.orgId, tunde.id, { from, count: 6 });
    expect(again.every((x) => Math.abs(x.getTime() - slots[0].getTime()) >= 90 * 60_000)).toBe(true);
  });
});
