"use client";
import { useActionState } from "react";
import Link from "next/link";
import { setupStep } from "../actions";
import { FormMessage, Submit } from "@/components/client";

export function SetupForm({ step, children }: { step: number; children: React.ReactNode }) {
  const [state, action] = useActionState(setupStep.bind(null, step), null);
  return (
    <form action={action} className="mt-6 space-y-5">
      {children}
      <div className="flex justify-between border-t border-line pt-6">
        {step > 1 ? <Link href={`/setup?step=${step - 1}`} className="btn btn-line">Back</Link> : <span />}
        <Submit className="btn btn-dark !px-8 !py-3">{step === 4 ? "Finish" : "Continue"}</Submit>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
