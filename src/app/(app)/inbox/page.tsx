import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { inbox, headlineMetrics } from "@/lib/queries";
import { nairaShort, relTime } from "@/lib/format";
import { now } from "@/lib/clock";
import { Avatar, PageHeader, RelayBars, ScoreBadge, Empty } from "@/components/ui";
import { AutoRefresh } from "@/components/client";
import { IconSearch } from "@/components/icons";
import type { InboxRow } from "@/lib/queries";

export const metadata = { title: "Inbox" };

const FILTERS = [
  ["all", "All"],
  ["waiting", "Waiting on you"],
  ["hot", "Hot"],
  ["ai", "AI handling"],
  ["viewing", "Viewing booked"],
] as const;

function lookingFor(r: InboxRow) {
  const n = r.needs;
  if (!n.purpose && !n.areas?.length && !n.budget_max) return { line: r.lastIn.slice(0, 60) || "New enquiry", sub: "No budget given" };
  const purpose = n.purpose === "sale" ? "Buy" : n.purpose === "shortlet" ? "Short-let" : n.purpose === "rent" ? "Rent" : "";
  const home = n.property_type === "land" ? "land" : [n.bedrooms_min !== undefined ? `${n.bedrooms_min}-bed` : "", n.property_type ?? ""].filter(Boolean).join(" ");
  const line = [purpose, home, n.areas?.slice(0, 2).join(", ")].filter(Boolean).join(" · ");
  const sub = [n.budget_max ? nairaShort(n.budget_max, n.period) : "no budget yet", n.nights ? `${n.nights} nights` : n.move_in_text ? n.move_in_text.toLowerCase() : n.financing ?? ""].filter(Boolean).join(" · ");
  return { line, sub };
}

function channel(r: InboxRow) {
  if (r.source.referral) return "WhatsApp ad";
  if (r.source.channel === "web_form") return "Website form";
  return r.needs.areas?.some((a) => ["Maitama", "Wuse 2", "Gwarinpa", "Jabi", "Asokoro"].includes(a)) ? "WhatsApp · Abuja" : "WhatsApp";
}

function flag(r: InboxRow) {
  if (r.spam) return <span className="font-semibold text-red">Scam signals</span>;
  if (r.opted_out_at) return <span className="text-muted">Opted out</span>;
  if (r.needs_human) return <span className="font-semibold text-amber">{r.flag_reason === "Asked for a person" ? "Wants a human" : r.flag_reason}</span>;
  if (r.pendingDraft) return <span className="font-semibold text-amber">Approve draft</span>;
  if (r.ai_paused) return <span className="font-semibold text-ink-2">You have it</span>;
  return null;
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const sess = await requireSession();
  const { f = "all", q = "" } = await searchParams;
  const { rows, counts } = await inbox(sess.orgId, f, q);
  const m = await headlineMetrics(sess.orgId);
  const ref = now();
  const median = m.medianFirstReplyS;
  return (
    <>
      <AutoRefresh />
      <PageHeader
        title="Inbox"
        subtitle={`${counts.all} open leads. The AI is replying to ${counts.ai}; ${counts.waiting} ${counts.waiting === 1 ? "is" : "are"} waiting on you.`}
        actions={
          <form className="relative w-full md:w-[360px]">
            <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={q} placeholder="Name, area, budget…" className="input !rounded-2xl !py-3.5 !pl-11" />
            <input type="hidden" name="f" value={f} />
          </form>
        }
      />
      <div className="mb-6 grid grid-cols-2 divide-line border-y border-line md:grid-cols-4 md:divide-x">
        <div className="py-4 md:pr-5">
          <div className="text-[15px] text-ink-2">Median first reply</div>
          <div className="mt-1 flex items-baseline gap-3"><span className="font-mono text-4xl">{median == null ? "–" : `${Math.floor(median / 60)}:${String(Math.round(median % 60)).padStart(2, "0")}`}</span><span className="text-sm text-green">target under 0:15</span></div>
        </div>
        <div className="py-4 md:px-5"><div className="text-[15px] text-ink-2">Qualified without you</div><div className="mt-1 font-mono text-4xl">{m.qualifiedWithoutHumanPct ?? "–"}{m.qualifiedWithoutHumanPct != null && "%"}</div></div>
        <div className="py-4 md:px-5"><div className="text-[15px] text-ink-2">Waiting on you</div><div className="mt-1 font-mono text-4xl text-amber">{counts.waiting}</div></div>
        <div className="py-4 md:pl-5"><div className="text-[15px] text-ink-2">Viewings booked this week</div><div className="mt-1 font-mono text-4xl">{m.viewingsThisWeek}</div></div>
      </div>
      <div className="scroll-thin -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {FILTERS.map(([key, label]) => {
          const n = counts[key as keyof typeof counts];
          const on = f === key;
          return (
            <Link key={key} href={`/inbox?f=${key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`chip shrink-0 border !px-5 !py-2.5 !text-[16px] ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"}`}>
              {label} <span className={`font-mono text-sm ${on ? "text-white/70" : "text-muted"}`}>{n}</span>
            </Link>
          );
        })}
      </div>
      {rows.length === 0 ? (
        <Empty>No leads here. Open the simulator and send a message as a lead.</Empty>
      ) : (
        <div>
          <div className="label-mono hidden grid-cols-[1.4fr_2fr_1.5fr_0.8fr_0.8fr] gap-4 px-4 pb-3 md:grid">
            <span>Lead</span><span>Looking for</span><span>Relay</span><span>Score</span><span className="text-right">Last</span>
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {rows.map((r) => {
              const lf = lookingFor(r);
              return (
                <li key={r.id}>
                  <Link href={`/leads/${r.id}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 px-2 py-4 transition hover:bg-white/60 md:grid-cols-[1.4fr_2fr_1.5fr_0.8fr_0.8fr] md:px-4">
                    <div className="flex items-center gap-3 md:col-auto">
                      <Avatar name={r.name} phone={r.phone} />
                      <div className="hidden min-w-0 md:block">
                        <div className="truncate text-[18px] font-semibold">{r.name ?? r.phone.replace(/(\+\d{3})(\d{3})\d+(\d{4})/, "$1 $2 ··· $3")}</div>
                        <div className="text-[15px] text-ink-2">{channel(r)}</div>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold md:hidden">{r.name ?? r.phone}</div>
                      <div className="truncate text-[16px]">{lf.line}</div>
                      <div className="truncate font-mono text-[13px] text-ink-2">{lf.sub}</div>
                    </div>
                    <div className="hidden md:block">
                      <RelayBars step={r.relay.step} />
                      <div className="mt-1.5 text-[15px] text-ink-2">{r.relay.agent} · {r.relay.label}</div>
                    </div>
                    <div className="row-span-2 md:row-span-1"><ScoreBadge score={r.score} temperature={r.temperature} /></div>
                    <div className="col-span-2 flex gap-3 text-sm md:col-span-1 md:flex-col md:items-end md:gap-0.5 md:text-right">
                      <span className="font-mono text-ink-2">{relTime(r.lastAt, ref)}</span>
                      {flag(r)}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
