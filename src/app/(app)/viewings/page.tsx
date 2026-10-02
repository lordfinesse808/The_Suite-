import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { weekViewings } from "@/lib/queries";
import { now, DAY } from "@/lib/clock";
import { fmtTime } from "@/lib/format";
import { googleCalendarLink } from "@/lib/agents/scheduler";
import { PageHeader } from "@/components/ui";
import { ActionButton, AutoRefresh } from "@/components/client";
import { IconBack, IconNext } from "@/components/icons";
import { markViewing } from "@/app/actions";

export const metadata = { title: "Viewings" };

const START_H = 8;
const END_H = 18;
const PX_PER_MIN = 1.1;

function mondayOf(d: Date) {
  const lagos = new Date(d.getTime() + 3600_000);
  const wd = (lagos.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate() - wd) - 3600_000);
}

export default async function ViewingsPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const sess = await requireSession();
  const { w = "0" } = await searchParams;
  const offset = Number(w) || 0;
  const weekStart = new Date(mondayOf(now()).getTime() + offset * 7 * DAY);
  const rows = await weekViewings(sess.orgId, weekStart);
  const db = await getDb();
  const rules = await db.select().from(s.availability).where(eq(s.availability.org_id, sess.orgId));
  const myRules = rules.filter((r) => r.agent_id === sess.userId);
  const shown = myRules.length ? myRules : rules;
  const buffer = shown[0]?.buffer_minutes ?? 45;
  const maxDay = shown[0]?.max_per_day ?? 4;
  const days = Array.from({ length: 6 }, (_, i) => new Date(weekStart.getTime() + i * DAY));
  const dayFmt = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short" }).format(d).toUpperCase();
  const dateFmt = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric" }).format(d);
  const range = `${new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric" }).format(days[0])} – ${new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" }).format(days[5])}`;
  const minsOf = (d: Date) => { const l = new Date(d.getTime() + 3600_000); return l.getUTCHours() * 60 + l.getUTCMinutes(); };
  const sameDay = (a: Date, b: Date) => new Date(a.getTime() + 3600_000).toISOString().slice(0, 10) === new Date(b.getTime() + 3600_000).toISOString().slice(0, 10);
  const pendingConfirm = await db.select().from(s.leads).where(and(eq(s.leads.org_id, sess.orgId), eq(s.leads.stage, "shortlisted")));
  const awaiting = pendingConfirm.filter((l) => l.ctx.offered_slots?.length);
  const fmtHours = shown.length ? `${[...new Set(shown.map((r) => r.weekday))].sort().map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")} · ${shown[0].start_time}–${shown[0].end_time}` : "Not set";
  return (
    <>
      <AutoRefresh ms={10000} />
      <PageHeader
        title="Viewings"
        subtitle="The Scheduler books into your free viewing hours, with travel time held before each one."
        actions={
          <div className="flex items-center gap-3">
            <Link href={`/viewings?w=${offset - 1}`} className="btn btn-line !h-12 !w-12 !p-0"><IconBack /></Link>
            <span className="text-lg font-semibold">{range}</span>
            <Link href={`/viewings?w=${offset + 1}`} className="btn btn-line !h-12 !w-12 !p-0"><IconNext /></Link>
          </div>
        }
      />
      <div className="grid gap-6 2xl:grid-cols-[1fr_340px]">
        <div className="card scroll-thin overflow-x-auto">
          <div className="grid min-w-[720px] grid-cols-[56px_repeat(6,1fr)]">
            <div className="border-b border-line" />
            {days.map((d) => (
              <div key={d.toISOString()} className={`border-b border-l border-line px-3 py-3 ${sameDay(d, now()) ? "bg-green-soft/40" : ""}`}>
                <div className="font-mono text-xs text-ink-2">{dayFmt(d)}</div>
                <div className="text-xl font-semibold">{dateFmt(d)}</div>
              </div>
            ))}
            <div className="relative" style={{ height: (END_H - START_H) * 60 * PX_PER_MIN }}>
              {Array.from({ length: END_H - START_H }, (_, i) => (
                <div key={i} className="absolute right-2 font-mono text-xs text-ink-2" style={{ top: i * 60 * PX_PER_MIN + 4 }}>{String(START_H + i).padStart(2, "0")}:00</div>
              ))}
            </div>
            {days.map((d) => {
              const wd = new Date(d.getTime() + 3600_000).getUTCDay();
              const open = shown.some((r) => r.weekday === wd);
              const items = rows.filter((r) => sameDay(r.v.start_at, d));
              return (
                <div key={d.toISOString()} className={`relative border-l border-line ${open ? "" : "bg-soft/60"}`} style={{ height: (END_H - START_H) * 60 * PX_PER_MIN }}>
                  {Array.from({ length: END_H - START_H }, (_, i) => <div key={i} className="absolute inset-x-0 border-t border-line/60" style={{ top: i * 60 * PX_PER_MIN }} />)}
                  {!open && <div className="absolute inset-3 flex items-center justify-center rounded-xl border border-dashed border-line text-center text-sm text-ink-2">No viewing hours set</div>}
                  {items.map(({ v, lead, listing, agent }) => {
                    const top = (minsOf(v.start_at) - START_H * 60) * PX_PER_MIN;
                    const h = Math.max(42, (v.end_at.getTime() - v.start_at.getTime()) / 60000 * PX_PER_MIN);
                    const done = v.status === "attended" || v.status === "no_show";
                    return (
                      <div key={v.id}>
                        <div className="hatch absolute inset-x-1.5 rounded-md px-2 font-mono text-[11px] text-ink-2" style={{ top: top - buffer * PX_PER_MIN, height: buffer * PX_PER_MIN - 2 }}>{buffer}m travel</div>
                        <div className={`group absolute inset-x-1.5 overflow-hidden rounded-lg px-2 py-1.5 text-[13px] ${done ? "bg-soft text-ink-2" : listing.purpose === "shortlet" ? "bg-cold" : "bg-green text-white"}`} style={{ top, minHeight: h }}>
                          <Link href={`/leads/${lead.id}`} className="block font-semibold leading-tight">{lead.name ?? lead.phone}</Link>
                          <div className="leading-tight opacity-90">{fmtTime(v.start_at)} · {listing.area} · {agent?.split(" ")[0]}</div>
                          {v.status === "confirmed" ? (
                            <div className="mt-1 hidden flex-wrap gap-1 group-hover:flex">
                              <ActionButton action={markViewing.bind(null, v.id, "attended")} className="rounded bg-white/90 px-1.5 text-[11px] text-ink">Attended</ActionButton>
                              <ActionButton action={markViewing.bind(null, v.id, "no_show")} className="rounded bg-white/90 px-1.5 text-[11px] text-ink">No-show</ActionButton>
                              <a target="_blank" href={googleCalendarLink({ title: `Viewing: ${listing.title}`, start: v.start_at, end: v.end_at, details: `${lead.name ?? ""} ${lead.phone} · ${listing.ref}`, location: listing.address })} className="rounded bg-white/90 px-1.5 text-[11px] text-ink">+ Calendar</a>
                            </div>
                          ) : <div className="text-[11px] capitalize">{v.status.replace("_", "-")}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-5 border-t border-line px-5 py-3 text-sm text-ink-2">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-green" /> Confirmed</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-cold" /> Short-let check-in</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-soft" /> Done</span>
            <span className="flex items-center gap-1.5"><span className="hatch h-3 w-3 rounded" /> Travel buffer</span>
            <span>Hover a viewing to mark it attended or no-show.</span>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-1 2xl:content-start">
          {awaiting[0] && (
            <div className="rounded-3xl bg-ink p-6 text-white">
              <div className="label-mono !text-green-soft">Needs a nudge</div>
              <p className="mt-3 text-lg leading-snug">{awaiting[0].name ?? awaiting[0].phone} has been offered viewing times and hasn&apos;t picked one yet.</p>
              <Link href={`/leads/${awaiting[0].id}`} className="mt-4 inline-block rounded-xl border border-white/30 px-4 py-2.5">Message them now</Link>
            </div>
          )}
          <div className="card p-6">
            <div className="mb-3 flex justify-between"><h2 className="text-xl font-semibold">Scheduler rules</h2><Link href="/settings#hours" className="text-green underline">Edit</Link></div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[15px]">
              <dt className="text-ink-2">Hours</dt><dd>{fmtHours}</dd>
              <dt className="text-ink-2">Travel buffer</dt><dd>{buffer} min</dd>
              <dt className="text-ink-2">Max a day</dt><dd>{maxDay} viewings</dd>
              <dt className="text-ink-2">Reminders</dt><dd>24h and 2h before</dd>
              <dt className="text-ink-2">On confirm</dt><dd>Send location pin</dd>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
