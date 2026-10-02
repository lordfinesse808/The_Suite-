// Agent 4: Scheduler. Free slots = availability rules minus booked viewings,
// with a travel buffer before each one and a daily maximum.
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { getDb } from "../db/client";
import * as s from "../db/schema";
import { HOUR } from "../clock";

const LAGOS_OFFSET_MIN = 60; // Africa/Lagos is UTC+1 all year (no DST)
export const VIEWING_MINUTES = 45;

function lagosParts(d: Date) {
  const l = new Date(d.getTime() + LAGOS_OFFSET_MIN * 60_000);
  return { y: l.getUTCFullYear(), m: l.getUTCMonth(), d: l.getUTCDate(), wd: l.getUTCDay(), hh: l.getUTCHours(), mm: l.getUTCMinutes() };
}

export function lagosTime(y: number, m: number, d: number, hhmm: string) {
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, m, d, hh, mm) - LAGOS_OFFSET_MIN * 60_000);
}

export async function freeSlots(orgId: string, agentId: string, opts: { from: Date; days?: number; count?: number; weekendFirst?: boolean }): Promise<Date[]> {
  const db = await getDb();
  const rules = await db.select().from(s.availability).where(and(eq(s.availability.org_id, orgId), eq(s.availability.agent_id, agentId)));
  if (!rules.length) return [];
  const until = new Date(opts.from.getTime() + (opts.days ?? 7) * 24 * HOUR);
  const booked = await db
    .select()
    .from(s.viewings)
    .where(and(eq(s.viewings.org_id, orgId), eq(s.viewings.agent_id, agentId), ne(s.viewings.status, "cancelled"), gte(s.viewings.start_at, new Date(opts.from.getTime() - 24 * HOUR)), lte(s.viewings.start_at, until)));
  const earliest = new Date(opts.from.getTime() + 2 * HOUR); // never offer a slot less than 2 hours away
  const slots: Date[] = [];
  const base = lagosParts(opts.from);
  for (let i = 0; i <= (opts.days ?? 7); i++) {
    const day = new Date(Date.UTC(base.y, base.m, base.d + i));
    const wd = day.getUTCDay();
    for (const r of rules.filter((x) => x.weekday === wd)) {
      const dayStart = lagosTime(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), r.start_time);
      const dayEnd = lagosTime(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), r.end_time);
      const sameDay = booked.filter((b) => b.start_at >= dayStart && b.start_at < dayEnd);
      if (sameDay.length >= r.max_per_day) continue;
      const step = 30 * 60_000;
      const gap = (r.buffer_minutes + VIEWING_MINUTES) * 60_000;
      // First viewing of the day starts after the travel buffer.
      for (let t = dayStart.getTime() + r.buffer_minutes * 60_000; t + VIEWING_MINUTES * 60_000 <= dayEnd.getTime(); t += step) {
        if (t < earliest.getTime()) continue;
        const clash = sameDay.some((b) => Math.abs(b.start_at.getTime() - t) < gap);
        if (clash) continue;
        slots.push(new Date(t));
      }
    }
  }
  // Spread the offer: at most one slot per half-day, earliest first (weekend first if asked).
  const seen = new Set<string>();
  const spread: Date[] = [];
  const ordered = opts.weekendFirst
    ? [...slots].sort((a, b) => Number([0, 6].includes(lagosParts(b).wd)) - Number([0, 6].includes(lagosParts(a).wd)) || a.getTime() - b.getTime())
    : slots;
  for (const sl of ordered) {
    const p = lagosParts(sl);
    const key = `${p.y}-${p.m}-${p.d}-${p.hh < 13 ? "am" : "pm"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    spread.push(sl);
    if (spread.length >= (opts.count ?? 3)) break;
  }
  return spread.sort((a, b) => a.getTime() - b.getTime());
}

/** "Add to Google Calendar" link (no OAuth needed). */
export function googleCalendarLink(v: { title: string; start: Date; end: Date; details: string; location: string }) {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({ action: "TEMPLATE", text: v.title, dates: `${f(v.start)}/${f(v.end)}`, details: v.details, location: v.location, ctz: "Africa/Lagos" });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
