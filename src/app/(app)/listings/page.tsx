import { and, desc, eq, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { naira } from "@/lib/format";
import { PageHeader, PhotoTile, VerifiedBadge } from "@/components/ui";
import { ActionButton, CopyButton } from "@/components/client";
import { IconEyeOff, IconPin } from "@/components/icons";
import { toggleListing } from "@/app/actions";
import { AddByForm, CsvUpload, PasteReader } from "./forms";

export const metadata = { title: "Listings" };

export default async function ListingsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const sess = await requireSession();
  const { show = "all" } = await searchParams;
  const db = await getDb();
  const rows = await db.select().from(s.listings).where(eq(s.listings.org_id, sess.orgId)).orderBy(desc(s.listings.pinned), s.listings.ref_code);
  const counts = await db.select({ listing: s.matches.listing_id, n: sql<number>`count(distinct ${s.matches.lead_id})::int` }).from(s.matches).where(eq(s.matches.org_id, sess.orgId)).groupBy(s.matches.listing_id);
  const matched = new Map(counts.map((c) => [c.listing, c.n]));
  const [wa] = await db.select().from(s.whatsappAccounts).where(and(eq(s.whatsappAccounts.org_id, sess.orgId)));
  const waNum = (wa?.display_number ?? "").replace(/\D/g, "");
  const list = rows.filter((l) => (show === "hidden" ? l.hidden : show === "taken" ? l.status === "taken" : !l.hidden));
  return (
    <>
      <PageHeader title="Listings" subtitle="What the Matchmaker can offer. Answers about price and terms come only from here." actions={<><CsvUpload /><AddByForm /></>} />
      <PasteReader />
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="text-lg font-semibold">{rows.filter((l) => !l.hidden).length} listings · {rows.filter((l) => l.verified && !l.hidden).length} verified</div>
        <div className="flex items-center gap-3 text-sm text-ink-2">
          <span className="hidden md:inline">Pinned homes are offered first. Hidden homes are never offered.</span>
          {["all", "taken", "hidden"].map((k) => <a key={k} href={`/listings?show=${k}`} className={`chip border ${show === k ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{k}</a>)}
          <a href="/api/listings/template.csv" className="underline">CSV template</a>
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {list.map((l) => {
          const link = `https://wa.me/${waNum}?text=${encodeURIComponent(`Hi, I'm interested in ${l.ref_code}`)}`;
          return (
            <div key={l.id} className={`card overflow-hidden ${l.status === "taken" ? "opacity-60" : ""}`}>
              <PhotoTile refCode={l.ref_code} photo={l.photos[0]} className="h-44" badge={<VerifiedBadge verified={l.verified} />} />
              <div className="p-5">
                <div className="font-mono text-xs text-muted">{l.ref_code}</div>
                <h3 className="text-[18px] font-semibold leading-snug">{l.title}</h3>
                <div className="mt-1 font-mono text-[15px]">{naira(l.price_amount, l.price_period)}</div>
                <div className="mt-1 line-clamp-2 text-[14px] text-ink-2">{l.features.join(" · ") || "No features listed"}{l.status === "taken" ? " · TAKEN" : ""}</div>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                  <span className="text-[15px] text-green">Matched to {matched.get(l.id) ?? 0} lead{matched.get(l.id) === 1 ? "" : "s"}</span>
                  <div className="flex gap-1.5">
                    <ActionButton action={toggleListing.bind(null, l.id, "pinned")} className={`btn !h-10 !w-10 !p-0 ${l.pinned ? "btn-green" : "btn-line"}`}><IconPin size={16} /></ActionButton>
                    <ActionButton action={toggleListing.bind(null, l.id, "hidden")} className={`btn !h-10 !w-10 !p-0 ${l.hidden ? "btn-dark" : "btn-line"}`}><IconEyeOff size={16} /></ActionButton>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <CopyButton text={link} label="Copy wa.me link" />
                  <ActionButton action={toggleListing.bind(null, l.id, "taken")} className="text-ink-2 underline">{l.status === "taken" ? "Mark available" : "Mark taken"}</ActionButton>
                  <ActionButton action={toggleListing.bind(null, l.id, "verified")} className="text-ink-2 underline">{l.verified ? "Unverify" : "Verify"}</ActionButton>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
