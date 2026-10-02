"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconApprovals, IconCalendar, IconHome, IconInbox, IconPipeline, IconReports, IconSettings } from "./icons";

const ITEMS = [
  { href: "/inbox", label: "Inbox", Icon: IconInbox, key: "open" },
  { href: "/pipeline", label: "Pipeline", Icon: IconPipeline },
  { href: "/listings", label: "Listings", Icon: IconHome, key: "listings" },
  { href: "/approvals", label: "Approvals", Icon: IconApprovals, key: "approvals" },
  { href: "/viewings", label: "Viewings", Icon: IconCalendar },
  { href: "/reports", label: "Reports", Icon: IconReports },
  { href: "/settings", label: "Settings", Icon: IconSettings },
] as const;

function active(path: string, href: string) {
  return path === href || path.startsWith(href + "/") || (href === "/inbox" && path.startsWith("/leads"));
}

export function SideNav({ counts }: { counts: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map(({ href, label, Icon, ...rest }) => {
        const on = active(path, href);
        const n = "key" in rest ? counts[rest.key] : undefined;
        return (
          <Link key={href} href={href} className={`flex items-center gap-3.5 rounded-xl px-4 py-3 text-[17px] transition ${on ? "bg-panel font-medium text-ink shadow-[0_1px_0_#dedfd8]" : "text-ink-2 hover:bg-panel/60"}`}>
            <Icon size={20} />
            <span className="flex-1">{label}</span>
            {n ? <span className="font-mono text-sm text-muted">{n}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ counts }: { counts: Record<string, number> }) {
  const path = usePathname();
  const items = [ITEMS[0], ITEMS[3], ITEMS[4], ITEMS[2], ITEMS[6]];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {items.map(({ href, label, Icon, ...rest }) => {
        const on = active(path, href);
        const n = "key" in rest && rest.key === "approvals" ? counts.approvals : 0;
        return (
          <Link key={href} href={href} className={`relative flex flex-col items-center gap-1 py-2.5 text-[12px] ${on ? "font-semibold text-green" : "text-ink-2"}`}>
            <Icon size={22} />
            {label === "Settings" ? "More" : label}
            {n ? <span className="absolute right-[22%] top-1.5 rounded-full bg-amber px-1.5 text-[10px] text-white">{n}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
