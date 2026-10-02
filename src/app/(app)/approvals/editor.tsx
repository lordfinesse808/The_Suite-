"use client";
import { useActionState, useState, useTransition } from "react";
import { approveDraftAction, rejectDraftAction } from "@/app/actions";
import { FormMessage, Submit } from "@/components/client";
import { IconCheck } from "@/components/icons";

export function DraftEditor({ draftId, body, orgName, checks, window }: { draftId: string; body: string; orgName: string; checks: { label: string; ok: boolean }[]; window: boolean }) {
  const [state, action] = useActionState(approveDraftAction.bind(null, draftId), null);
  const [text, setText] = useState(body);
  const [pending, start] = useTransition();
  return (
    <form action={action}>
      <div className="mb-2 text-[15px] text-ink-2">WhatsApp message · sends as {orgName} · {window ? "inside the 24-hour window (free text)" : "outside the 24-hour window: sends as the follow_up_checkin template"}</div>
      <textarea name="body" value={text} onChange={(e) => setText(e.target.value)} rows={7} className="input !rounded-2xl !p-5 text-[16px] leading-relaxed" />
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[15px]">
        {checks.map((c) => (
          <li key={c.label} className={`flex items-center gap-1.5 ${c.ok ? "text-ink-2" : "text-red"}`}>{c.ok ? <IconCheck size={16} className="text-green" /> : "!"} {c.label}</li>
        ))}
      </ul>
      <div className="mt-5 flex flex-col-reverse gap-3 border-t border-line pt-5 md:flex-row md:items-center md:justify-end">
        <button type="button" className="btn btn-line !py-3" disabled={pending} onClick={() => start(() => rejectDraftAction(draftId))}>Skip</button>
        <Submit className="btn btn-green !px-7 !py-3 text-[16px]" pendingText="Sending…">Approve and send</Submit>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
