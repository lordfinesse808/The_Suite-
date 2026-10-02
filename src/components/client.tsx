"use client";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";

/** Live updates: re-fetch server components on an interval (pauses when the tab is hidden). */
export function AutoRefresh({ ms = 4000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, ms);
    return () => clearInterval(id);
  }, [router, ms]);
  return null;
}

export function Submit({ children, className = "btn btn-dark", pendingText }: { children: ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-line !py-1.5 !px-3 text-sm"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function ActionButton({ action, children, className = "btn btn-line", confirm }: { action: () => Promise<unknown>; children: ReactNode; className?: string; confirm?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          await action();
        });
      }}
    >
      {children}
    </button>
  );
}

export function FormMessage({ state }: { state: { error?: string; ok?: string } | null }) {
  if (!state) return null;
  if (state.error) return <p className="mt-2 text-sm text-red" role="alert">{state.error}</p>;
  if (state.ok) return <p className="mt-2 text-sm text-green" role="status">{state.ok}</p>;
  return null;
}

export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator && location.hostname !== "localhost") navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
