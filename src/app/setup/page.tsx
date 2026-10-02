import Link from "next/link";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { getOrg, orgAgents } from "@/lib/repo";
import { Logo, IconCheck } from "@/components/icons";
import { SetupForm } from "./step-form";
import { CsvUpload } from "../(app)/listings/forms";
import { HoursForm } from "../(app)/settings/forms";

export const metadata = { title: "Set up" };
export const dynamic = "force-dynamic";

const STEPS = [
  ["Connect WhatsApp", "Your number, your name"],
  ["Add listings", "Links, photos or a sheet"],
  ["Viewing hours", "Hours, travel, reminders"],
  ["Agent rules", "Tone, areas, approvals"],
];

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const sess = await requireSession();
  const { step: st } = await searchParams;
  const org = (await getOrg(sess.orgId))!;
  const step = Math.min(4, Math.max(1, Number(st) || org.onboarding_step + 1 || 1));
  const db = await getDb();
  const [acct] = await db.select().from(s.whatsappAccounts).where(eq(s.whatsappAccounts.org_id, sess.orgId));
  const listings = await db.select({ id: s.listings.id }).from(s.listings).where(eq(s.listings.org_id, sess.orgId));
  const rules = await db.select().from(s.availability).where(eq(s.availability.org_id, sess.orgId));
  const agents = await orgAgents(sess.orgId);
  return (
    <div className="min-h-screen px-4 py-6 md:px-10">
      <div className="mb-8 flex items-center justify-between">
        <Logo />
        <span className="label-mono">Step {step} of 4</span>
        <Link href="/inbox" className="text-green underline">Save and finish later</Link>
      </div>
      <div className="grid gap-8 lg:grid-cols-[300px_1fr_360px]">
        <ol className="space-y-2">
          {STEPS.map(([t, d], i) => (
            <li key={t}>
              <Link href={`/setup?step=${i + 1}`} className={`flex items-start gap-4 rounded-2xl px-4 py-4 ${step === i + 1 ? "bg-panel shadow-sm" : ""}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${step === i + 1 ? "border-ink bg-ink text-white" : i + 1 < step ? "border-green bg-green text-white" : "border-line text-ink-2"}`}>{i + 1 < step ? <IconCheck size={16} /> : i + 1}</span>
                <span><span className="block text-lg font-semibold">{t}</span><span className="text-ink-2">{d}</span></span>
              </Link>
            </li>
          ))}
        </ol>
        <div className="card p-6 md:p-10">
          {step === 1 && (
            <>
              <h1 className="text-3xl font-bold">Connect your WhatsApp Business number</h1>
              <p className="mt-2 text-ink-2">Leads keep messaging the number they already know. ilé answers on it through the WhatsApp Business Platform.</p>
              <SetupForm step={1}>
                <label className="block"><span className="mb-1 block">Business number</span><input name="display_number" defaultValue={acct?.display_number} className="input font-mono" /></label>
                <div className="flex flex-wrap gap-2">
                  <span className="chip bg-green-soft font-semibold text-green"><IconCheck size={14} /> {acct ? "Connected (mock mode)" : "Not connected"}</span>
                  <span className="chip bg-green-soft font-semibold text-green">Display name: {acct?.display_name || org.name}</span>
                </div>
                <label className="block"><span className="mb-1 block">First message to every new lead (consent, NDPA 2023)</span><textarea name="consent_message" rows={3} defaultValue={org.consent_message} className="input" /></label>
                <p className="text-sm text-ink-2">Live numbers are connected in Settings → WhatsApp with your Meta phone number ID and token.</p>
              </SetupForm>
            </>
          )}
          {step === 2 && (
            <>
              <h1 className="text-3xl font-bold">Add your listings</h1>
              <p className="mt-2 text-ink-2">The Matchmaker only offers homes from this list, and only quotes prices you enter. You have {listings.length} listing{listings.length === 1 ? "" : "s"}.</p>
              <div className="my-6 flex flex-wrap items-center gap-3"><CsvUpload /><a href="/api/listings/template.csv" className="text-green underline">Download the CSV template</a><Link href="/listings" className="text-green underline">Paste a post or use the form</Link></div>
              <SetupForm step={2}><span /></SetupForm>
            </>
          )}
          {step === 3 && (
            <>
              <h1 className="mb-2 text-3xl font-bold">Set your viewing hours</h1>
              <p className="mb-6 text-ink-2">A 45-minute travel buffer is held before each viewing (Lagos traffic). Reminders go out 24 hours and 2 hours before.</p>
              <HoursForm agents={agents} rules={rules} />
              <SetupForm step={3}><span /></SetupForm>
            </>
          )}
          {step === 4 && (
            <>
              <h1 className="text-3xl font-bold">Agent rules</h1>
              <p className="mt-2 text-ink-2">English and Nigerian Pidgin are answered by the AI. Other languages are handed to you. Follow-ups always wait for your approval in the beta.</p>
              <SetupForm step={4}>
                <label className="block"><span className="mb-1 block">Areas you serve</span><input name="areas_served" defaultValue={org.areas_served.join(", ")} className="input" placeholder="Lekki Phase 1, Ikate, Ajah" /></label>
                <label className="block"><span className="mb-1 block">Tone notes</span><textarea name="tone_notes" rows={2} defaultValue={org.tone_notes} className="input" placeholder="Warm but brief." /></label>
                <label className="block"><span className="mb-1 block">Fees policy</span><textarea name="fees_policy" rows={2} defaultValue={org.fees_policy} className="input" placeholder="Agency and legal fees are confirmed by an agent before any payment." /></label>
              </SetupForm>
            </>
          )}
        </div>
        <div>
          <div className="label-mono mb-3">What a lead sees</div>
          <div className="rounded-[36px] border-[10px] border-ink bg-panel">
            <div className="flex items-center gap-3 border-b border-line px-4 py-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">{org.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span><div><div className="font-semibold">{org.name}</div><div className="text-xs text-ink-2">Business account</div></div></div>
            <div className="space-y-3 p-4 text-[14px]">
              <div className="ml-auto max-w-[85%] rounded-xl bg-green-soft px-3 py-2">Hi, is the Ikate 3-bed still available?</div>
              <div className="max-w-[90%] rounded-xl bg-white px-3 py-2">Good evening. Yes, it is. {org.consent_message || "We'll save your details to help with your search, and you can reply STOP at any time."} Is this to rent or to buy?</div>
              <div className="flex flex-wrap gap-2">{["Rent", "Buy", "Short-let"].map((x) => <span key={x} className="rounded-full border border-green px-3 py-1 text-green">{x}</span>)}</div>
            </div>
          </div>
          <p className="mt-3 text-ink-2">Replies in under 10 seconds, at 2 a.m. too.</p>
        </div>
      </div>
    </div>
  );
}
