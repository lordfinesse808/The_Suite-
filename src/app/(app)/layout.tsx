import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getOrg } from "@/lib/repo";
import { sidebarCounts } from "@/lib/queries";
import { spentToday, dailyCap } from "@/lib/llm/budget";
import { env } from "@/lib/env";
import { Logo } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { SideNav, BottomNav } from "@/components/nav";
import { RegisterSW } from "@/components/client";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sess = await requireSession();
  const org = await getOrg(sess.orgId);
  const counts = await sidebarCounts(sess.orgId);
  const spent = await spentToday(null);
  const cap = await dailyCap(sess.orgId);
  const live = env().LLM_MODE === "live";
  const relay = [
    { name: "Qualifier", state: "live" },
    { name: "Matchmaker", state: "live" },
    { name: "Follow-up", state: "you approve" },
    { name: "Scheduler", state: "live" },
  ];
  const paused = live && spent >= cap;
  return (
    <div className="md:flex md:min-h-screen">
      <RegisterSW />
      <aside className="hidden w-[300px] shrink-0 flex-col px-5 py-6 md:flex">
        <Link href="/inbox" className="mb-6 px-2"><Logo /></Link>
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-line bg-panel/70 px-3.5 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink font-semibold text-white">{org?.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
          <div className="min-w-0">
            <div className="truncate font-semibold">{org?.name}</div>
            <div className="text-sm text-muted">{org?.founding_member ? "Founding member" : "Pro"} · {org?.areas_served.some((a) => ["Maitama", "Wuse 2", "Gwarinpa"].includes(a)) ? "Lagos & Abuja" : "Lagos"}</div>
          </div>
        </div>
        <SideNav counts={counts} />
        <div className="mt-auto space-y-4 pt-8">
          <div className="rounded-2xl bg-panel/70 p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="label-mono">AI relay</span>
              <Link href="/settings#ai" className="text-sm text-green underline">Rules</Link>
            </div>
            <ul className="space-y-1.5 text-[15px]">
              {relay.map((r) => (
                <li key={r.name} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${paused ? "bg-red" : r.state === "live" ? "bg-green" : "bg-amber"}`} />
                  <span className="flex-1">{r.name}</span>
                  <span className="font-mono text-xs text-muted">{paused ? "paused" : r.state}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center justify-between px-2 text-[15px]">
            <span className="text-ink-2">AI spend today</span>
            <span className="font-mono">{live ? `$${spent.toFixed(3)} / $${cap.toFixed(2)}` : "mock · $0"}</span>
          </div>
          <div className="flex items-center gap-3 border-t border-line px-2 pt-4">
            <Avatar name={sess.name} size={40} tone={0} />
            <div className="min-w-0 flex-1">
              <div className="truncate">{sess.name}</div>
              <div className="text-sm capitalize text-muted">{sess.role}</div>
            </div>
            <form action={logoutAction}><button className="text-sm text-muted hover:text-ink">Sign out</button></form>
          </div>
        </div>
      </aside>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bg/95 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/inbox"><Logo size={22} /></Link>
        <span className="text-sm text-ink-2">{org?.name}</span>
      </header>
      <main className="min-w-0 flex-1 pb-24 md:py-4 md:pr-4 md:pb-4">
        <div className="min-h-[calc(100vh-2rem)] bg-panel px-4 py-6 md:rounded-[28px] md:border md:border-line md:px-12 md:py-10">
          {env().MOCK_WHATSAPP && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-green/40 bg-green-soft/40 px-4 py-2.5 text-sm text-ink-2">
              <span>Mock mode: no real WhatsApp messages are sent{env().LLM_MODE === "mock" ? " and the AI runs on fixtures (free)" : ""}.</span>
              <a href="/dev/simulator" target="_blank" className="font-semibold text-green underline">Open the WhatsApp simulator</a>
            </div>
          )}
          {children}
        </div>
      </main>
      <BottomNav counts={counts} />
    </div>
  );
}
