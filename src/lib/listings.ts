// Listing import: "paste a listing" parser and CSV import.
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "./db/client";
import * as s from "./db/schema";
import { extractAmounts, understandRules } from "./agents/understand";
import { extractAreas, findArea } from "./agents/areas";
import { now } from "./clock";

export async function nextRefCode(orgId: string): Promise<string> {
  const db = await getDb();
  const [r] = await db
    .select({ max: sql<number>`coalesce(max(nullif(regexp_replace(${s.listings.ref_code}, '\\D', '', 'g'), '')::int), 1000)` })
    .from(s.listings)
    .where(eq(s.listings.org_id, orgId));
  return `LST-${Number(r?.max ?? 1000) + 1}`;
}

export interface ParsedListing {
  title: string;
  purpose: s.Purpose | "";
  property_type: string;
  bedrooms: number | "";
  price_amount: number | "";
  price_period: s.PricePeriod | "";
  service_charge: number | "";
  area: string;
  city: "Lagos" | "Abuja" | "";
  features: string;
  description: string;
  missing: string[];
}

/** Turn pasted text (an Instagram caption, a WhatsApp broadcast, a URL slug) into listing fields for review. */
export function parseListingText(text: string): ParsedListing {
  const clean = text.replace(/https?:\/\/\S+/g, (u) => u.replace(/[/_-]+/g, " ")).trim();
  const u = understandRules(clean, { ref: now() });
  const n = u.needs;
  const areas = extractAreas(clean);
  const area = areas[0] ?? "";
  const city = area ? (findArea(area)?.city ?? "") : /abuja/i.test(clean) ? "Abuja" : /lagos/i.test(clean) ? "Lagos" : "";
  const amounts = extractAmounts(clean);
  const sc = clean.match(/service charge[^\d₦]*(₦?\s?[\d.,]+\s?(k|m|million)?)/i);
  const serviceCharge = sc ? extractAmounts(sc[1].startsWith("₦") ? sc[1] : `₦${sc[1]}`)[0] : undefined;
  const price = amounts.find((a) => a !== serviceCharge);
  const purpose = n.purpose ?? (/to let|for rent|rent/i.test(clean) ? "rent" : "");
  const type = n.property_type ?? "";
  const beds = n.bedrooms_min ?? "";
  const period: s.PricePeriod | "" = n.period ?? (purpose === "sale" ? "total" : purpose === "rent" ? "year" : purpose === "shortlet" ? "night" : "");
  const title = [beds !== "" && type !== "land" ? `${beds}-bed` : "", type || "home", area ? `, ${area}` : ""].join(" ").replace(/\s+,/, ",").replace(/\s+/g, " ").trim();
  const parsed: ParsedListing = {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    purpose, property_type: type, bedrooms: beds, price_amount: price ?? "", price_period: period, service_charge: serviceCharge ?? "",
    area, city: city as ParsedListing["city"], features: (n.must_haves ?? []).join(", "), description: text.slice(0, 600), missing: [],
  };
  for (const k of ["purpose", "property_type", "price_amount", "area", "service_charge"] as const) if (parsed[k] === "") parsed.missing.push(k);
  return parsed;
}

const CSV_COLUMNS = ["ref_code", "title", "purpose", "property_type", "bedrooms", "price_amount", "price_period", "service_charge", "area", "city", "address", "features", "description", "status"];
export const CSV_TEMPLATE = CSV_COLUMNS.join(",") + "\nLST-2001,3-bed flat Ikate,rent,flat,3,5500000,year,,Ikate,Lagos,12 Example Close,\"BQ;24h power\",Spacious flat,available\n";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

export async function importListingsCsv(orgId: string, text: string, agentId: string) {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (!rows.length) return { created: 0, errors: ["The file is empty."] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (k: string) => header.indexOf(k);
  for (const req of ["title", "purpose", "price_amount", "area"]) if (idx(req) === -1) errors.push(`Missing column "${req}".`);
  if (errors.length) return { created: 0, errors };
  const db = await getDb();
  let created = 0;
  for (const [n, r] of rows.slice(1).entries()) {
    const get = (k: string) => (idx(k) >= 0 ? (r[idx(k)] ?? "").trim() : "");
    const purpose = get("purpose").toLowerCase().replace("short-let", "shortlet") as s.Purpose;
    const price = Number(get("price_amount").replace(/[^\d.]/g, ""));
    if (!["rent", "sale", "shortlet"].includes(purpose) || !price || !get("title") || !get("area")) {
      errors.push(`Row ${n + 2}: needs title, purpose (rent/sale/shortlet), price_amount and area.`);
      continue;
    }
    const a = findArea(get("area")) ?? findArea(extractAreas(get("area"))[0] ?? "");
    const ref = (get("ref_code") || (await nextRefCode(orgId))).toUpperCase();
    const period = (get("price_period") || (purpose === "sale" ? "total" : purpose === "rent" ? "year" : "night")) as s.PricePeriod;
    const values = {
      org_id: orgId, ref_code: ref, title: get("title"), purpose, property_type: get("property_type") || "flat", bedrooms: Number(get("bedrooms") || 0),
      bathrooms: Math.max(1, Number(get("bedrooms") || 1)), price_amount: Math.round(price), price_period: period,
      service_charge: get("service_charge") ? Number(get("service_charge").replace(/[^\d.]/g, "")) : null,
      area: a?.name ?? get("area"), city: get("city") || a?.city || "Lagos", address: get("address"), lat: a?.lat ?? null, lng: a?.lng ?? null,
      features: get("features").split(/[;|]/).map((x) => x.trim()).filter(Boolean), description: get("description"),
      status: (get("status") === "taken" ? "taken" : "available") as "taken" | "available", agent_id: agentId, updated_at: now(),
    };
    const [existing] = await db.select({ id: s.listings.id }).from(s.listings).where(and(eq(s.listings.org_id, orgId), eq(s.listings.ref_code, ref)));
    if (existing) await db.update(s.listings).set(values).where(eq(s.listings.id, existing.id));
    else await db.insert(s.listings).values(values);
    created++;
  }
  return { created, errors };
}
