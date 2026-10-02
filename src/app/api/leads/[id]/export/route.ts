// NDPA 2023 data export: everything held about one lead, as JSON.
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { audit } from "@/lib/repo";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const sess = await getSession();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const db = await getDb();
  const [lead] = await db.select().from(s.leads).where(and(eq(s.leads.org_id, sess.orgId), eq(s.leads.id, id)));
  if (!lead) return new Response("Not found", { status: 404 });
  const where = (t: typeof s.messages | typeof s.matches | typeof s.viewings | typeof s.drafts) => and(eq(t.org_id, sess.orgId), eq(t.lead_id, id));
  const data = {
    exported_at: new Date().toISOString(),
    lead,
    messages: await db.select().from(s.messages).where(where(s.messages)),
    matches: await db.select().from(s.matches).where(where(s.matches)),
    viewings: await db.select().from(s.viewings).where(where(s.viewings)),
    drafts: await db.select().from(s.drafts).where(where(s.drafts)),
  };
  await audit(sess.orgId, `user:${sess.userId}`, "lead.exported", "lead", id, {}, id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="lead-${id}.json"` },
  });
}
