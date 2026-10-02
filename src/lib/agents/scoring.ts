// Deterministic lead score (0-100). The model supplies inputs; code computes the score.
// Rubric (full spec 9.2): budget realistic 25, timeline <=60 days 20, area+type 15,
// financing ready or cash 15, contact name 5, engaged replies 10, came from a listing 10.
import type { Needs, ScoreItem, Temperature } from "../db/schema";

export interface ScoreInput {
  needs: Needs;
  name?: string | null;
  inboundCount: number;
  fromListing: boolean;
  /** Number of available listings that fit the budget in the wanted areas. */
  fittingListings: number;
  spam?: boolean;
  ref: Date;
}

export function scoreLead(i: ScoreInput): { score: number; temperature: Temperature; breakdown: ScoreItem[] } {
  const n = i.needs;
  const items: ScoreItem[] = [];
  const budgetOk = !!n.budget_max && i.fittingListings > 0;
  items.push({
    label: n.budget_max ? (budgetOk ? `Budget fits ${i.fittingListings} of your listings` : "Budget stated, below what is listed") : "No budget yet",
    points: budgetOk ? 25 : n.budget_max ? 10 : 0, max: 25, ok: budgetOk,
  });
  let days: number | null = null;
  if (n.move_in_by) days = (new Date(n.move_in_by).getTime() - i.ref.getTime()) / 86400_000;
  const soon = n.purpose === "shortlet" || (days !== null && days <= 60);
  const timeline = days !== null && days <= 120;
  items.push({
    label: soon ? "Moving within 60 days" : timeline ? "Moving within 120 days" : n.move_in_text ? `Timeline: ${n.move_in_text}` : "No timeline yet",
    points: soon ? 20 : timeline ? 12 : n.move_in_text ? 4 : 0, max: 20, ok: soon,
  });
  const areaType = !!n.areas?.length && (!!n.property_type || n.bedrooms_min !== undefined);
  items.push({ label: areaType ? "Specific area and home type" : "Area or type still open", points: areaType ? 15 : n.areas?.length ? 7 : 0, max: 15, ok: areaType });
  const fin = n.financing === "cash" || n.financing === "mortgage" || n.purpose === "rent" || n.purpose === "shortlet";
  items.push({ label: n.financing ? `Financing: ${n.financing}` : fin ? "Pays rent upfront" : "Financing not discussed", points: fin ? 15 : n.financing ? 8 : 0, max: 15, ok: fin });
  items.push({ label: i.name ? "Shared their name" : "Name not shared", points: i.name ? 5 : 0, max: 5, ok: !!i.name });
  const engaged = i.inboundCount >= 2;
  items.push({ label: engaged ? "Engaged replies" : "Single message so far", points: engaged ? 10 : 5, max: 10, ok: engaged });
  items.push({ label: i.fromListing ? "Came from a specific listing" : "General enquiry", points: i.fromListing ? 10 : 0, max: 10, ok: i.fromListing });
  if (i.spam) items.push({ label: "Scam or abuse signals", points: -60, max: 0, ok: false });
  else items.push({ label: "No scam or abuse signals", points: 0, max: 0, ok: true });
  const score = Math.max(0, Math.min(100, items.reduce((a, b) => a + b.points, 0)));
  return { score, temperature: temperatureOf(score), breakdown: items };
}

export function temperatureOf(score: number): Temperature {
  return score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
}

/** Fields still needed before handing off to the Matchmaker, in asking order. */
export function missingFields(n: Needs): ("purpose" | "budget" | "area" | "type_bedrooms" | "move_in")[] {
  const m: ("purpose" | "budget" | "area" | "type_bedrooms" | "move_in")[] = [];
  if (!n.purpose) m.push("purpose");
  if (!n.areas?.length) m.push("area");
  if (!n.budget_max) m.push("budget");
  if (!n.property_type && n.bedrooms_min === undefined) m.push("type_bedrooms");
  if (!n.move_in_by && !n.move_in_text && n.purpose !== "shortlet") m.push("move_in");
  return m;
}

export function isQualified(n: Needs): boolean {
  return !!n.purpose && !!n.budget_max && !!n.areas?.length && (!!n.property_type || n.bedrooms_min !== undefined);
}
