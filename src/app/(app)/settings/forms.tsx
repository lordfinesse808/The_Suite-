"use client";
import { useActionState } from "react";
import { saveAvailability, saveOrgSettings, saveWhatsapp, inviteAgent } from "@/app/actions";
import { FormMessage, Submit } from "@/components/client";
import type { Org } from "@/lib/db/schema";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function OrgForm({ org }: { org: Org }) {
  const [state, action] = useActionState(saveOrgSettings, null);
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <label className="block"><span className="mb-1 block text-sm text-ink-2">Agency name</span><input name="name" defaultValue={org.name} className="input" /></label>
      <label className="block"><span className="mb-1 block text-sm text-ink-2">Office hours</span><input name="office_hours" defaultValue={org.office_hours} className="input" /></label>
      <label className="block md:col-span-2"><span className="mb-1 block text-sm text-ink-2">Areas served (comma separated)</span><input name="areas_served" defaultValue={org.areas_served.join(", ")} className="input" /></label>
      <label className="block md:col-span-2"><span className="mb-1 block text-sm text-ink-2">Tone notes for the AI</span><textarea name="tone_notes" defaultValue={org.tone_notes} rows={2} className="input" /></label>
      <label className="block md:col-span-2"><span className="mb-1 block text-sm text-ink-2">Fees policy (the AI quotes this word for word, or says an agent will confirm)</span><textarea name="fees_policy" defaultValue={org.fees_policy} rows={2} className="input" /></label>
      <label className="block md:col-span-2"><span className="mb-1 block text-sm text-ink-2">Consent notice (NDPA 2023). The first reply always covers saving details and STOP.</span><textarea name="consent_message" defaultValue={org.consent_message} rows={2} className="input" /></label>
      <label className="block"><span className="mb-1 block text-sm text-ink-2">Website origins allowed to post leads (one per line)</span><textarea name="allowed_origins" defaultValue={org.allowed_origins.join("\n")} rows={2} className="input font-mono text-sm" /></label>
      <label className="block"><span className="mb-1 block text-sm text-ink-2">AI daily budget (USD, blank = default)</span><input name="ai_daily_budget_usd" type="number" step="0.01" defaultValue={org.ai_daily_budget_usd ?? ""} className="input font-mono" /></label>
      <div className="md:col-span-2"><Submit>Save settings</Submit><FormMessage state={state} /></div>
    </form>
  );
}

export function WhatsappForm({ acct, mock }: { acct: { phone_number_id: string; waba_id: string; display_number: string; display_name: string; has_token: boolean } | null; mock: boolean }) {
  const [state, action] = useActionState(saveWhatsapp, null);
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      <label className="block"><span className="mb-1 block text-sm text-ink-2">Display number</span><input name="display_number" defaultValue={acct?.display_number} className="input font-mono" placeholder="+234 803 555 0142" /></label>
      <label className="block"><span className="mb-1 block text-sm text-ink-2">Display name</span><input name="display_name" defaultValue={acct?.display_name} className="input" /></label>
      <label className="block"><span className="mb-1 block text-sm text-ink-2">Phone number ID (Meta)</span><input name="phone_number_id" defaultValue={acct?.phone_number_id} className="input font-mono" /></label>
      <label className="block"><span className="mb-1 block text-sm text-ink-2">WhatsApp Business Account ID</span><input name="waba_id" defaultValue={acct?.waba_id} className="input font-mono" /></label>
      <label className="block md:col-span-2"><span className="mb-1 block text-sm text-ink-2">Permanent access token {acct?.has_token ? "(stored encrypted; leave blank to keep)" : ""}</span><input name="access_token" type="password" className="input font-mono" placeholder={mock ? "Not needed in mock mode" : "EAAG…"} /></label>
      <div className="md:col-span-2"><Submit>Save connection</Submit><FormMessage state={state} /></div>
    </form>
  );
}

export function HoursForm({ agents, rules }: { agents: { id: string; name: string }[]; rules: { agent_id: string; weekday: number; start_time: string; end_time: string; buffer_minutes: number; max_per_day: number }[] }) {
  const [state, action] = useActionState(saveAvailability, null);
  return (
    <div className="space-y-6">
      {agents.map((a) => {
        const r = rules.filter((x) => x.agent_id === a.id);
        const first = r[0];
        return (
          <form key={a.id} action={action} className="rounded-2xl border border-line p-4">
            <input type="hidden" name="agent_id" value={a.id} />
            <div className="mb-3 font-semibold">{a.name}</div>
            <div className="mb-3 flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <label key={d} className="chip cursor-pointer border border-line bg-white has-[:checked]:border-green has-[:checked]:bg-green-soft">
                  <input type="checkbox" name="weekday" value={i} defaultChecked={r.some((x) => x.weekday === i)} className="hidden" /> {d}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <label className="text-sm text-ink-2">From<input name="start_time" type="time" defaultValue={first?.start_time ?? "09:00"} className="input mt-1" /></label>
              <label className="text-sm text-ink-2">To<input name="end_time" type="time" defaultValue={first?.end_time ?? "17:00"} className="input mt-1" /></label>
              <label className="text-sm text-ink-2">Travel buffer (min)<input name="buffer_minutes" type="number" defaultValue={first?.buffer_minutes ?? 45} className="input mt-1" /></label>
              <label className="text-sm text-ink-2">Max a day<input name="max_per_day" type="number" defaultValue={first?.max_per_day ?? 4} className="input mt-1" /></label>
            </div>
            <div className="mt-3"><Submit className="btn btn-line">Save hours</Submit></div>
          </form>
        );
      })}
      <FormMessage state={state} />
    </div>
  );
}

export function InviteForm() {
  const [state, action] = useActionState(inviteAgent, null);
  return (
    <form action={action} className="flex flex-col gap-2 md:flex-row">
      <input name="name" placeholder="Name" className="input" />
      <input name="email" type="email" placeholder="Email" className="input" />
      <Submit className="btn btn-dark shrink-0">Add agent</Submit>
      <FormMessage state={state} />
    </form>
  );
}
