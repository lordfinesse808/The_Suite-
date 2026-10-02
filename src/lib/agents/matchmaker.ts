// Agent 2: Matchmaker. Hard SQL filters, then a deterministic ranking with a
// one-line reason per home. (Vector matching comes later; see docs/going-live.md.)
import { and, eq, inArray, lte, gte, sql, notInArray } from "drizzle-orm";
import { getDb } from "../db/client";
import * as s from "../db/schema";
import { withNeighbours, isNeighbour } from "./areas";
import { nairaShort } from "../format";
import type { Needs, Listing } from "../db/schema";

export interface Ranked {
  listing: Listing;
  score: number;
  reason: string;
  exactArea: boolean;
}

export interface SearchOpts {
  exclude?: string[];
  maxPrice?: number;
  limit?: number;
  /** Relax the area filter (used for "no exact match" alternatives). */
  relaxed?: boolean;
}

export async function searchListings(orgId: string, needs: Needs, opts: SearchOpts = {}): Promise<Ranked[]> {
  const db = await getDb();
  const conds = [eq(s.listings.org_id, orgId), eq(s.listings.status, "available"), eq(s.listings.hidden, false)];
  if (needs.purpose) conds.push(eq(s.listings.purpose, needs.purpose));
  const cap = opts.maxPrice ?? (needs.budget_max ? Math.round(needs.budget_max * (opts.relaxed ? 1.25 : 1.1)) : undefined);
  if (cap) conds.push(lte(s.listings.price_amount, cap));
  if (needs.bedrooms_min !== undefined && needs.property_type !== "land") {
    conds.push(gte(s.listings.bedrooms, Math.max(0, needs.bedrooms_min - (opts.relaxed ? 1 : 0))));
  }
  if (needs.property_type === "land") conds.push(eq(s.listings.property_type, "land"));
  const wanted = needs.areas ?? [];
  if (wanted.length && !opts.relaxed) conds.push(inArray(s.listings.area, withNeighbours(wanted)));
  if (opts.exclude?.length) conds.push(notInArray(s.listings.id, opts.exclude));
  const rows = await db.select().from(s.listings).where(and(...conds)).orderBy(sql`${s.listings.pinned} desc`, s.listings.price_amount).limit(60);
  return rows
    .map((l) => rank(l, needs))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 15);
}

export function rank(l: Listing, n: Needs): Ranked {
  let score = 50;
  const reasons: string[] = [];
  const wanted = n.areas ?? [];
  const exactArea = wanted.includes(l.area);
  if (exactArea) score += 20;
  else if (isNeighbour(l.area, wanted)) {
    score += 10;
    reasons.push(`near ${wanted.find((w) => isNeighbour(l.area, [w])) ?? wanted[0]}`);
  }
  if (n.budget_max) {
    const diff = n.budget_max - l.price_amount;
    if (diff >= 0) {
      score += 15 - Math.min(10, Math.round((diff / n.budget_max) * 20));
      if (diff / n.budget_max >= 0.05) reasons.unshift(`${nairaShort(diff)} under budget`);
      else reasons.unshift("on budget");
    } else {
      score -= 8;
      reasons.unshift("slightly above budget");
    }
  }
  if (n.bedrooms_min !== undefined) {
    if (l.bedrooms === n.bedrooms_min) score += 8;
    else if (l.bedrooms > n.bedrooms_min) {
      score += 3;
      reasons.push(`${l.bedrooms} bedrooms`);
    }
  }
  if (n.property_type && l.property_type === n.property_type) score += 5;
  const musts = (n.must_haves ?? []).map((m) => m.toLowerCase());
  const has = l.features.filter((f) => musts.some((m) => f.toLowerCase().includes(m)));
  score += has.length * 6;
  if (has.length) reasons.push(has.join(" and "));
  else {
    const top = l.features.filter((f) => !/on file|min\.|caution/i.test(f)).slice(0, 2);
    if (top.length) reasons.push(top.join(" and "));
  }
  if (l.verified) {
    score += 4;
    reasons.push("verified");
  }
  if (l.pinned) score += 6;
  return { listing: l, score: Math.max(0, Math.min(99, score)), reason: cap(reasons.slice(0, 3).join(" · ")) || "Fits your search", exactArea };
}

function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Number of available listings that fit the budget in the wanted areas (for scoring). */
export async function countFitting(orgId: string, n: Needs): Promise<number> {
  if (!n.budget_max) return 0;
  return (await searchListings(orgId, { purpose: n.purpose, budget_max: n.budget_max, areas: n.areas }, { limit: 50 })).length;
}

export function needsSummary(n: Needs, lang: "en-NG" | "pcm" = "en-NG"): string {
  const parts: string[] = [];
  if (n.bedrooms_min !== undefined && n.property_type !== "land") parts.push(n.bedrooms_min === 0 ? "a studio" : `a ${n.bedrooms_min}-bed${n.property_type && !["flat", "mini flat", "self contain"].includes(n.property_type) ? " " + n.property_type : ""}`);
  else if (n.property_type) parts.push(n.property_type === "land" ? "land" : `a ${n.property_type}`);
  if (n.purpose === "shortlet") parts.push("short-let");
  if (n.areas?.length) parts.push(`in ${n.areas.slice(0, 2).join(lang === "pcm" ? " or " : " or ")}`);
  if (n.budget_max) {
    const per = n.period === "year" ? (lang === "pcm" ? " every year" : " a year") : n.period === "night" ? (lang === "pcm" ? " per night" : " a night") : n.period === "month" ? " a month" : "";
    parts.push(`${lang === "pcm" ? "for" : "around"} ₦${n.budget_max.toLocaleString("en-NG")}${per}`);
  }
  if (!parts.length) return lang === "pcm" ? "wetin you want" : "your search";
  if (n.purpose === "rent" && parts.length && !parts[0].startsWith("a ")) parts.unshift("to rent");
  return parts.join(" ");
}
