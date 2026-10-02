import { and, eq, gte } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { STAGES } from "@/lib/db/schema";
import { STAGE_LABEL, nairaShort, fmtSlot } from "@/lib/format";
import { now } from "@/lib/clock";
import { PageHeader } from "@/components/ui";
import { AutoRefresh } from "@/components/client";
import { Board, type Column } from "./board";

export const metadata = { title: "Pipeline" };

const HINT: Record<string, string> = {
  new: "Qualifier is talking", qualifying: "Qualifier is asking", qualified: "Matchmaker is ranking", shortlisted: "Follow-ups running",
  viewing_booked: "Scheduler sends reminders", viewed: "You negotiate", won: "Closed", lost: "Kept for re-matching",
};
const COLOR: Record<string, string> = { new: "#cfd0c9", qualifying: "#cfd0c9", qualified: "#8db3a0", shortlisted: "#4b8a6f", viewing_booked: "#1f5b45", viewed: "#a8561a", won: "#141a16", lost: "#dedfd8" };

export default async function PipelinePage() {
  const sess = await requireSession();
  const db = await getDb();
  const leads = await db.select().from(s.leads).where(eq(s.leads.org_id, sess.orgId));
  const vs = await db.select().from(s.viewings).where(and(eq(s.viewings.org_id, sess.orgId), eq(s.viewings.status, "confirmed"), gte(s.viewings.start_at, now())));
  const drafts = await db.select({ lead: s.drafts.lead_id }).from(s.drafts).where(and(eq(s.drafts.org_id, sess.orgId), eq(s.drafts.status, "pending")));
  const draftSet = new Set(drafts.map((d) => d.lead));
  const users = await db.select({ id: s.users.id, name: s.users.name }).from(s.users);
  const uname = (id: string | null) => users.find((u) => u.id === id)?.name.split(" ")[0] ?? "";
  const columns: Column[] = STAGES.map((st) => ({
    key: st,
    label: STAGE_LABEL[st],
    hint: HINT[st],
    color: COLOR[st],
    cards: leads
      .filter((l) => l.stage === st)
      .sort((a, b) => b.score - a.score)
      .map((l) => {
        const n = l.needs;
        const v = vs.find((x) => x.lead_id === l.id);
        const purpose = n.purpose === "sale" ? "Buy" : n.purpose === "shortlet" ? "Short-let" : n.purpose === "rent" ? "Rent" : "";
        const line = [purpose, n.property_type === "land" ? "land" : n.bedrooms_min !== undefined ? `${n.bedrooms_min}-bed` : n.property_type, n.areas?.[0]].filter(Boolean).join(" · ") || (l.source.referral ? "Facebook lead ad" : "New enquiry");
        const sub = v ? `${fmtSlot(v.start_at)} · ${uname(v.agent_id)}`.toUpperCase() : n.budget_max ? nairaShort(n.budget_max, n.period) : "";
        const flag = l.spam ? { text: "Scam signals · paused", tone: "red" as const }
          : l.needs_human ? { text: l.flag_reason === "Asked for a person" ? "Wants a human" : (l.flag_reason ?? "Needs you"), tone: "amber" as const }
          : draftSet.has(l.id) ? { text: "Draft to approve", tone: "amber" as const }
          : l.stage === "lost" && l.flag_reason ? { text: l.flag_reason, tone: "green" as const } : undefined;
        return { id: l.id, name: l.name ?? l.phone.replace(/(\+\d{3})(\d{3})\d+(\d{4})/, "$1 $2 ··· $3"), score: l.score, line, sub, flag, stage: l.stage };
      }),
  }));
  return (
    <>
      <AutoRefresh ms={8000} />
      <PageHeader title="Pipeline" subtitle="The relay moves leads through the first stages on its own. You take it from the viewing. Drag a card to move it." />
      <Board columns={columns} />
    </>
  );
}
