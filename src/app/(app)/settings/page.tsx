import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { getOrg, orgAgents } from "@/lib/repo";
import { env } from "@/lib/env";
import { spentToday, spentTotal, dailyCap } from "@/lib/llm/budget";
import { TEMPLATES } from "@/lib/channels/whatsapp/templates";
import { recentAlerts } from "@/lib/queries";
import { relTime } from "@/lib/format";
import { now } from "@/lib/clock";
import { PageHeader } from "@/components/ui";
import { CopyButton, ActionButton } from "@/components/client";
import { markAlertsRead } from "@/app/actions";
import { HoursForm, InviteForm, OrgForm, WhatsappForm } from "./forms";

export const metadata = { title: "Settings" };

function Section({ id, title, desc, children }: { id: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-6 p-6 md:p-8">
      <h2 className="text-xl font-semibold">{title}</h2>
      {desc && <p className="mb-5 mt-1 text-ink-2">{desc}</p>}
      {!desc && <div className="mb-4" />}
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  const sess = await requireSession();
  const org = (await getOrg(sess.orgId))!;
  const db = await getDb();
  const [acct] = await db.select().from(s.whatsappAccounts).where(eq(s.whatsappAccounts.org_id, sess.orgId));
  const agents = await orgAgents(sess.orgId);
  const rules = await db.select().from(s.availability).where(eq(s.availability.org_id, sess.orgId));
  const listings = await db.select({ ref: s.listings.ref_code, title: s.listings.title }).from(s.listings).where(eq(s.listings.org_id, sess.orgId)).limit(6);
  const today = await spentToday(null);
  const total = await spentTotal(sess.orgId);
  const cap = await dailyCap(sess.orgId);
  const alerts = await recentAlerts(sess.orgId, 10);
  const e = env();
  const waNum = (acct?.display_number ?? "").replace(/\D/g, "");
  const formSnippet = `<form action="${e.APP_URL}/api/public/leads" method="post">
  <input type="hidden" name="key" value="${org.public_key}">
  <input type="hidden" name="listing_ref" value="LST-1042">
  <input name="name" placeholder="Your name" required>
  <input name="phone" placeholder="WhatsApp number" required>
  <textarea name="message" placeholder="What are you looking for?"></textarea>
  <label><input type="checkbox" name="consent" value="true" required>
    I agree that ${org.name} may save my details and contact me on WhatsApp. I can reply STOP at any time.</label>
  <button type="submit">Chat on WhatsApp</button>
</form>`;
  const owner = sess.role === "owner";
  return (
    <>
      <PageHeader title="Settings" subtitle="Your number, your rules. Owners can change everything; agents can set their own viewing hours." />
      <nav className="scroll-thin -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 text-sm md:mx-0 md:px-0">
        {[["alerts", "Alerts"], ["org", "Agency and AI"], ["whatsapp", "WhatsApp"], ["hours", "Viewing hours"], ["website", "Website"], ["ai", "AI spend"], ["team", "Team"], ["privacy", "Data and privacy"]].map(([id, l]) => <a key={id} href={`#${id}`} className="chip shrink-0 border border-line bg-white">{l}</a>)}
      </nav>
      <div className="space-y-6">
        <Section id="alerts" title="Alerts" desc="In-app alerts from the AI relay: hot leads, hand-offs, drafts, bookings and budget.">
          <ul className="divide-y divide-line">
            {alerts.length === 0 && <li className="py-2 text-ink-2">No alerts yet.</li>}
            {alerts.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-4 py-2.5">
                <span className={a.read_at ? "text-ink-2" : ""}>{!a.read_at && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-amber" />}{a.body}</span>
                <span className="shrink-0 font-mono text-xs text-muted">{relTime(a.created_at, now())}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3"><ActionButton action={markAlertsRead}>Mark all read</ActionButton></div>
        </Section>
        <Section id="org" title="Agency and AI behaviour">{owner ? <OrgForm org={org} /> : <p className="text-ink-2">Only the owner can change these.</p>}</Section>
        <Section id="whatsapp" title="WhatsApp connection" desc={e.MOCK_WHATSAPP ? "Mock mode is on: messages stay in the simulator. Enter your Meta test-number details here when you switch MOCK_WHATSAPP=false." : `Webhook URL: ${e.APP_URL}/api/webhooks/whatsapp`}>
          {owner ? <WhatsappForm mock={e.MOCK_WHATSAPP} acct={acct ? { phone_number_id: acct.phone_number_id, waba_id: acct.waba_id, display_number: acct.display_number, display_name: acct.display_name, has_token: !!acct.access_token_encrypted } : null} /> : <p className="text-ink-2">Connected: {acct?.display_number}</p>}
          <div className="mt-6">
            <div className="label-mono mb-2">Templates to submit in WhatsApp Manager (category: Utility)</div>
            <ul className="space-y-2 text-sm">
              {Object.entries(TEMPLATES).map(([name, t]) => <li key={name} className="rounded-xl bg-soft p-3"><b className="font-mono">{name}</b> · {t.description}<div className="mt-1 text-ink-2">{t.body}</div></li>)}
            </ul>
          </div>
        </Section>
        <Section id="hours" title="Viewing hours" desc="The Scheduler offers 3 free slots from these hours, minus booked viewings and the travel buffer.">
          <HoursForm agents={owner ? agents : agents.filter((a) => a.id === sess.userId)} rules={rules} />
        </Section>
        <Section id="website" title="Website" desc="Zero-cost integrations: a Chat on WhatsApp link per listing, and a lead form that starts the WhatsApp conversation.">
          <div className="label-mono mb-2">Chat on WhatsApp links</div>
          <ul className="mb-6 space-y-2">
            {listings.map((l) => {
              const link = `https://wa.me/${waNum}?text=${encodeURIComponent(`Hi, I'm interested in ${l.ref}`)}`;
              const btn = `<a href="${link}" style="display:inline-block;background:#1f5b45;color:#fff;padding:12px 18px;border-radius:12px;font-weight:600;text-decoration:none">Chat on WhatsApp</a>`;
              return (
                <li key={l.ref} className="flex flex-col gap-2 rounded-xl bg-soft p-3 md:flex-row md:items-center">
                  <span className="flex-1"><b className="font-mono">{l.ref}</b> · {l.title}</span>
                  <div className="flex gap-2"><CopyButton text={link} label="Copy link" /><CopyButton text={btn} label="Copy HTML button" /></div>
                </li>
              );
            })}
          </ul>
          <div className="label-mono mb-2">Lead form (paste into any website)</div>
          <p className="mb-2 text-sm text-ink-2">Public key <span className="font-mono">{org.public_key}</span> · allowed origins: {org.allowed_origins.join(", ") || "any (set them above)"}. See docs/website.md for WordPress.</p>
          <pre className="scroll-thin overflow-x-auto rounded-xl bg-ink p-4 text-xs text-white">{formSnippet}</pre>
          <div className="mt-2"><CopyButton text={formSnippet} label="Copy form HTML" /></div>
        </Section>
        <Section id="ai" title="AI spend" desc={`Mode: ${e.LLM_MODE === "live" ? `live (${e.CLAUDE_MODEL_FAST})` : "mock (fixtures, free)"}. When the daily cap is reached the AI pauses, new messages get a short holding reply, and you are alerted.`}>
          <dl className="grid max-w-md grid-cols-[1fr_auto] gap-y-2">
            <dt className="text-ink-2">Spent today (all orgs)</dt><dd className="font-mono">${today.toFixed(4)} / ${cap.toFixed(2)}</dd>
            <dt className="text-ink-2">Spent so far</dt><dd className="font-mono">${total.usd.toFixed(4)}</dd>
            <dt className="text-ink-2">Model calls</dt><dd className="font-mono">{total.runs}</dd>
            <dt className="text-ink-2">Input / output tokens</dt><dd className="font-mono">{total.inputTokens.toLocaleString()} / {total.outputTokens.toLocaleString()}</dd>
          </dl>
        </Section>
        <Section id="team" title="Team" desc="Roles: Owner (everything) and Agent (leads, approvals, own hours).">
          <ul className="mb-4 divide-y divide-line">
            {agents.map((a) => <li key={a.id} className="flex justify-between py-2"><span>{a.name} <span className="text-ink-2">· {a.email}</span></span><span className="capitalize text-ink-2">{a.role}</span></li>)}
          </ul>
          {owner && <InviteForm />}
        </Section>
        <Section id="privacy" title="Data and privacy (NDPA 2023)" desc="Consent notice on the first reply, STOP opt-out on every message, export and deletion per lead from the lead page. Every action on leads and settings is in the audit log.">
          <a href="/privacy" className="text-green underline">Privacy notice template</a>
        </Section>
      </div>
    </>
  );
}
