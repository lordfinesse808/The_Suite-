import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { toE164 } from "@/lib/format";
import { devOnly } from "../guard";
import { orgForPhoneNumberId } from "@/lib/inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;
  const u = new URL(req.url);
  const phone = toE164(u.searchParams.get("phone") ?? "");
  const orgId = await orgForPhoneNumberId(u.searchParams.get("pnid") ?? "");
  if (!orgId) return Response.json({ messages: [], lead: null });
  const db = await getDb();
  const [lead] = await db.select().from(s.leads).where(and(eq(s.leads.org_id, orgId), eq(s.leads.phone, phone)));
  if (!lead) return Response.json({ messages: [], lead: null });
  const msgs = await db
    .select({ id: s.messages.id, direction: s.messages.direction, type: s.messages.type, body: s.messages.body, payload: s.messages.payload, author: s.messages.author, created_at: s.messages.created_at })
    .from(s.messages)
    .where(and(eq(s.messages.lead_id, lead.id)))
    .orderBy(asc(s.messages.seq));
  return Response.json({
    lead: { id: lead.id, stage: lead.stage, score: lead.score, temperature: lead.temperature, ai_paused: lead.ai_paused, opted_out: !!lead.opted_out_at, language: lead.language },
    messages: msgs.filter((m) => m.direction !== "event").map((m) => ({ ...m, payload: { ...m.payload, understanding: undefined } })),
  });
}
