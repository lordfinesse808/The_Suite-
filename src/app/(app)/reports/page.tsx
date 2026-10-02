import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { headlineMetrics, bySource, teamStats } from "@/lib/queries";
import { spentTotal } from "@/lib/llm/budget";
import { PageHeader } from "@/components/ui";
import { IconCheck } from "@/components/icons";

export const metadata = { title: "Reports" };

function Kpi({ label, value, target, ok }: { label: string; value: string; target: string; ok: boolean | null }) {
  return (
    <div className="card p-5">
      <div className="text-[15px] text-ink-2">{label}</div>
      <div className="mt-2 font-mono text-4xl">{value}</div>
      <div className={`mt-2 flex items-center gap-1.5 text-sm ${ok === false ? "text-amber" : "text-green"}`}>{ok === false ? "!" : <IconCheck size={14} />} {ok === false ? `Below ${target}` : `Target ${target}`}</div>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const sess = await requireSession();
  const { d = "30" } = await searchParams;
  const days = Number(d) || 30;
  const m = await headlineMetrics(sess.orgId, days);
  const src = await bySource(sess.orgId);
  const team = await teamStats(sess.orgId);
  const ai = await spentTotal(sess.orgId);
  const max = Math.max(1, ...src.map((r) => r.leads));
  const pct = (v: number | null) => (v == null ? "–" : `${v}%`);
  const median = m.medianFirstReplyS;
  const best = [...src].filter((r) => r.leads >= 1).sort((a, b) => b.viewings / b.leads - a.viewings / a.leads)[0];
  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`Last ${days} days · all agents · ${m.leadCount} leads`}
        actions={<div className="flex rounded-2xl bg-soft p-1">{[["7", "7 days"], ["30", "30 days"], ["90", "Quarter"]].map(([k, l]) => <Link key={k} href={`/reports?d=${k}`} className={`rounded-xl px-4 py-2 ${d === k ? "bg-white shadow-sm" : ""}`}>{l}</Link>)}</div>}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Median first reply" value={median == null ? "–" : `${Math.floor(median / 60)}:${String(Math.round(median % 60)).padStart(2, "0")}`} target="under 0:15" ok={median == null ? null : median <= 15} />
        <Kpi label="Qualified without a human" value={pct(m.qualifiedWithoutHumanPct)} target="60%+" ok={m.qualifiedWithoutHumanPct == null ? null : m.qualifiedWithoutHumanPct >= 60} />
        <Kpi label="Qualified to viewing" value={pct(m.qualifiedToViewingPct)} target="25%+" ok={m.qualifiedToViewingPct == null ? null : m.qualifiedToViewingPct >= 25} />
        <Kpi label="Viewing show rate" value={pct(m.showRatePct)} target="80%+" ok={m.showRatePct == null ? null : m.showRatePct >= 80} />
        <Kpi label="Drafts sent unedited" value={pct(m.draftsUneditedPct)} target="70%+" ok={m.draftsUneditedPct == null ? null : m.draftsUneditedPct >= 70} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-6">
          <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold">Viewings booked, by where the lead came from</h2><span className="text-sm text-ink-2">Leads · viewings · won</span></div>
          <ul className="space-y-4">
            {src.map((r) => (
              <li key={r.source} className="grid grid-cols-[150px_1fr_auto] items-center gap-4 md:grid-cols-[200px_1fr_auto]">
                <span>{r.source}</span>
                <span className="h-4 rounded-md bg-green" style={{ width: `${Math.max(6, (r.leads / max) * 100)}%` }} />
                <span className="font-mono text-ink-2">{r.leads} · {r.viewings} · {r.won}</span>
              </li>
            ))}
          </ul>
          {best && <p className="mt-6 border-t border-line pt-4 text-ink-2">{best.source} converts best right now: {best.viewings} viewing{best.viewings === 1 ? "" : "s"} from {best.leads} lead{best.leads === 1 ? "" : "s"}.</p>}
        </div>
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="mb-4 text-xl font-semibold">Your team</h2>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-5 gap-y-3 text-[15px]">
              <span className="text-ink-2">Agent</span><span className="text-ink-2">Open</span><span className="text-ink-2">Upcoming</span><span className="text-ink-2">Won</span>
              {team.map((t) => (
                <div key={t.id} className="contents"><span>{t.name}</span><span className="font-mono">{t.open}</span><span className="font-mono">{t.upcoming}</span><span className="font-mono">{t.won}</span></div>
              ))}
            </div>
          </div>
          <div className="card p-6">
            <h2 className="mb-3 text-xl font-semibold">AI usage</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-[15px]">
              <dt className="text-ink-2">Spent to date</dt><dd className="font-mono">${ai.usd.toFixed(4)}</dd>
              <dt className="text-ink-2">Model calls</dt><dd className="font-mono">{ai.runs}</dd>
              <dt className="text-ink-2">Cost per qualified lead</dt><dd className="font-mono">{m.qualifiedCount ? `$${(ai.usd / m.qualifiedCount).toFixed(4)}` : "–"}</dd>
              <dt className="text-ink-2">Cache reads</dt><dd className="font-mono">{ai.cacheRead.toLocaleString()} tokens</dd>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
