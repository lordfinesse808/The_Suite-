"use client";
import { useActionState, useTransition } from "react";
import { sendAgentMessage, setAiPaused, setStage, deleteLead } from "@/app/actions";
import { FormMessage, Submit } from "@/components/client";
import { IconSend } from "@/components/icons";
import { STAGE_LABEL } from "@/lib/format";

export function TakeoverButton({ leadId, paused }: { leadId: string; paused: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button className={`btn ${paused ? "btn-green" : "btn-line"} !border-ink !border-[1.5px]`} disabled={pending} onClick={() => start(() => setAiPaused(leadId, !paused))}>
      {paused ? "Resume AI" : "Take over"}
    </button>
  );
}

export function Composer({ leadId, paused, optedOut }: { leadId: string; paused: boolean; optedOut: boolean }) {
  const [state, action] = useActionState(sendAgentMessage.bind(null, leadId), null);
  const disabled = !paused || optedOut;
  return (
    <form action={action} className="border-t border-line p-4">
      <div className="flex gap-3">
        <input
          name="body"
          disabled={disabled}
          placeholder={optedOut ? "This lead opted out. Nothing can be sent." : paused ? "Type a message as yourself…" : "AI is handling replies. Take over to type."}
          className="input !rounded-2xl !bg-soft !py-3.5 disabled:text-muted"
          autoComplete="off"
        />
        <Submit className={`btn !rounded-2xl !px-5 ${disabled ? "bg-muted/60 text-white" : "btn-green"}`}>
          <IconSend />
        </Submit>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function StageSelect({ leadId, stage }: { leadId: string; stage: string }) {
  const [pending, start] = useTransition();
  return (
    <label className="btn btn-line !py-3 relative">
      <span className="text-[16px] font-normal">Stage:</span>
      <select
        className="appearance-none bg-transparent pr-5 text-[16px] font-normal outline-none"
        defaultValue={stage}
        disabled={pending}
        onChange={(e) => start(() => setStage(leadId, e.target.value))}
      >
        {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <span className="pointer-events-none absolute right-4">⌄</span>
    </label>
  );
}

export function DeleteLead({ leadId }: { leadId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="text-sm font-semibold text-red underline disabled:opacity-50"
      disabled={pending}
      onClick={() => {
        if (window.confirm("Delete this lead and all their messages, matches, viewings and drafts? This cannot be undone.")) start(() => deleteLead(leadId));
      }}
    >
      Delete lead and data
    </button>
  );
}
