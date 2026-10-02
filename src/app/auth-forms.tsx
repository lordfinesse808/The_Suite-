"use client";
import { useActionState } from "react";
import { loginAction, signupAction } from "./actions";
import { FormMessage, Submit } from "@/components/client";

export function LoginForm({ demo }: { demo: boolean }) {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-2">Email</span>
        <input name="email" type="email" required className="input" defaultValue={demo ? "adaeze@demo.ile" : ""} autoComplete="email" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-2">Password</span>
        <input name="password" type="password" required className="input" defaultValue={demo ? "demo1234" : ""} autoComplete="current-password" />
      </label>
      <FormMessage state={state} />
      <Submit className="btn btn-dark w-full !py-3">Sign in</Submit>
    </form>
  );
}

export function SignupForm() {
  const [state, action] = useActionState(signupAction, null);
  return (
    <form action={action} className="space-y-4">
      <input name="name" required placeholder="Your name" className="input" />
      <input name="orgName" required placeholder="Agency name (e.g. Adaeze Homes)" className="input" />
      <input name="email" type="email" required placeholder="Email" className="input" />
      <input name="password" type="password" required minLength={8} placeholder="Password (8+ characters)" className="input" />
      <FormMessage state={state} />
      <Submit className="btn btn-dark w-full !py-3">Create my agency</Submit>
      <p className="text-xs text-muted">Founding members use ilé free during the beta.</p>
    </form>
  );
}
