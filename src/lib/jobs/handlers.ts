import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import * as s from "../db/schema";
import type { Job } from "../db/schema";
import { processInboundMessage } from "../agents/orchestrator";
import { writeFor } from "../agents/orchestrator";
import { alert, getLead, getListing, getOrg, getUserName, logEvent } from "../repo";
import { insideWindow, sendMessage } from "../messaging/send";
import { renderTemplate } from "../channels/whatsapp/templates";
import { fmtSlot, fmtTime } from "../format";

type Handler = (job: Job) => Promise<void>;

async function reminder(job: Job, hours: 24 | 2) {
  const orgId = job.org_id!;
  const p = job.payload as { lead_id: string; viewing_id?: string };
  const db = await getDb();
  const [v] = p.viewing_id
    ? await db.select().from(s.viewings).where(and(eq(s.viewings.org_id, orgId), eq(s.viewings.id, p.viewing_id)))
    : await db.select().from(s.viewings).where(and(eq(s.viewings.org_id, orgId), eq(s.viewings.lead_id, p.lead_id), eq(s.viewings.status, "confirmed"))).limit(1);
  if (!v || v.status !== "confirmed") return;
  const tag = hours === 24 ? "24h" : "2h";
  if (v.reminders_sent.includes(tag)) return;
  const lead = await getLead(orgId, v.lead_id);
  const l = await getListing(orgId, v.listing_id);
  const org = await getOrg(orgId);
  if (!lead || !l || !org || lead.opted_out_at) return;
  const agent = ((await getUserName(v.agent_id)) ?? "our agent").split(" ")[0];
  const title = l.title.replace(/, (Abuja|Lagos)$/, "");
  const when = hours === 24 ? fmtSlot(v.start_at) : fmtTime(v.start_at);
  let res;
  if (insideWindow(lead.last_inbound_at)) {
    const { text } = await writeFor(orgId, lead.id, "scheduler", [{ k: "reminder", hours, when, agent, title }], []);
    res = await sendMessage(orgId, lead.id, {
      type: "buttons", body: text,
      buttons: [{ id: "rem:confirm", title: lead.language === "pcm" ? "I dey come" : "Confirm" }, { id: "rem:reschedule", title: lead.language === "pcm" ? "Change time" : "Reschedule" }],
    }, { author: "ai:scheduler", reason: `reminder_${tag}` });
  } else {
    const vars = [lead.name?.split(" ")[0] ?? "there", title, fmtSlot(v.start_at), agent];
    res = await sendMessage(orgId, lead.id, { type: "template", name: "viewing_reminder", language: "en", variables: vars, preview: renderTemplate("viewing_reminder", vars) }, { author: "ai:scheduler", reason: `reminder_${tag}` });
  }
  if (res.ok) {
    await db.update(s.viewings).set({ reminders_sent: [...v.reminders_sent, tag] }).where(eq(s.viewings.id, v.id));
    await logEvent(orgId, lead.id, `Scheduler · ${tag} reminder sent`);
  }
}

export const handlers: Record<string, Handler> = {
  process_inbound: async (job) => {
    const p = job.payload as { lead_id: string; message_id: string };
    await processInboundMessage(job.org_id!, p.lead_id, p.message_id);
  },
  reminder_24h: (job) => reminder(job, 24),
  reminder_2h: (job) => reminder(job, 2),
  viewing_followup: async (job) => {
    const p = job.payload as { lead_id: string; viewing_id: string };
    const db = await getDb();
    const [v] = await db.select().from(s.viewings).where(eq(s.viewings.id, p.viewing_id));
    if (!v || v.status !== "confirmed") return;
    const lead = await getLead(job.org_id!, p.lead_id);
    await alert(job.org_id!, p.lead_id, "mark_viewing", `Did ${lead?.name ?? lead?.phone ?? "the lead"} attend the viewing at ${fmtSlot(v.start_at)}? Mark it attended or no-show.`);
  },
};
