import type { PricePeriod } from "./db/schema";

export const TZ = "Africa/Lagos";
const PERIOD_SHORT: Record<PricePeriod, string> = { year: "yr", month: "mo", night: "night", total: "" };

/** Exact price, as stored: ₦5,500,000 / yr */
export function naira(amount: number, period?: PricePeriod | null): string {
  const base = "₦" + Math.round(amount).toLocaleString("en-NG");
  if (!period || period === "total") return base;
  return `${base} / ${PERIOD_SHORT[period]}`;
}

/** Compact price for tables: ₦5.5M, ₦85k */
export function nairaShort(amount: number, period?: PricePeriod | null): string {
  let s: string;
  if (amount >= 1_000_000_000) s = `₦${trim(amount / 1_000_000_000)}B`;
  else if (amount >= 1_000_000) s = `₦${trim(amount / 1_000_000)}M`;
  else if (amount >= 1_000) s = `₦${trim(amount / 1_000)}k`;
  else s = `₦${amount}`;
  if (!period || period === "total") return s;
  return `${s} / ${PERIOD_SHORT[period]}`;
}

function trim(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

export function fmtTime(d: Date | string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d));
}

export function fmtDay(d: Date | string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(d));
}

export function fmtDayLong(d: Date | string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "short" }).format(new Date(d));
}

export function fmtSlot(d: Date | string) {
  return `${fmtDay(d)}, ${fmtTime(d)}`;
}

export function fmtDate(d: Date | string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(new Date(d));
}

export function relTime(d: Date | string | null | undefined, ref: Date) {
  if (!d) return "";
  const t = new Date(d);
  const diff = ref.getTime() - t.getTime();
  if (diff < 24 * 3600_000 && fmtDay(t) === fmtDay(ref)) return fmtTime(t);
  if (diff < 48 * 3600_000) return "Yesterday";
  if (diff < 7 * 24 * 3600_000) return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" }).format(t);
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" }).format(t);
}

export function initials(name: string | null | undefined, phone?: string) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return phone ? "+" + phone.replace(/\D/g, "").slice(0, 1) : "?";
}

export function maskPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length < 8) return phone;
  return `+${d.slice(0, 3)} ${d.slice(3, 6)} ··· ${d.slice(-4)}`;
}

/** Normalise a Nigerian phone number to E.164 (+234...). */
export function toE164(raw: string): string {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return "+" + d.slice(1).replace(/\D/g, "");
  d = d.replace(/\D/g, "");
  if (d.startsWith("234")) return "+" + d;
  if (d.startsWith("0") && d.length === 11) return "+234" + d.slice(1);
  if (d.length === 10) return "+234" + d;
  return "+" + d;
}

export const STAGE_LABEL: Record<string, string> = {
  new: "New",
  qualifying: "Qualifying",
  qualified: "Qualified",
  shortlisted: "Shortlisted",
  viewing_booked: "Viewing booked",
  viewed: "Viewed",
  won: "Closed won",
  lost: "Lost",
};
