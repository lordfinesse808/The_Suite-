import type { ReactNode } from "react";
import { initials } from "@/lib/format";
import type { Temperature } from "@/lib/db/schema";

const AVATAR_TONES = ["bg-green-soft", "bg-sand", "bg-amber-soft", "bg-cold", "bg-sage", "bg-red-soft"];

export function Avatar({ name, phone, size = 44, tone }: { name?: string | null; phone?: string; size?: number; tone?: number }) {
  const t = tone ?? [...(name ?? phone ?? "")].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length;
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-ink-2 ${AVATAR_TONES[t]}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(name, phone)}
    </span>
  );
}

export function ScoreBadge({ score, temperature, large }: { score: number; temperature: Temperature; large?: boolean }) {
  const cls = temperature === "hot" ? "bg-amber-soft text-amber" : temperature === "warm" ? "bg-soft text-ink-2" : "bg-cold text-ink-2";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${large ? "px-3.5 py-1.5 text-base" : "px-3 py-1 text-sm"} ${cls}`}>
      <span className="font-mono">{score}</span>
      <span className="capitalize">{temperature}</span>
    </span>
  );
}

export function RelayBars({ step, total = 4 }: { step: number; total?: number }) {
  return (
    <span className="flex gap-1.5" aria-label={`Relay step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-[5px] w-9 rounded-full ${i < step ? "bg-green" : "bg-line"}`} />
      ))}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-3xl font-bold md:text-[40px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] text-ink-2 md:text-[17px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: "amber" | "green" }) {
  return (
    <div className="px-0 py-4 md:px-5">
      <div className="text-[15px] text-ink-2">{label}</div>
      <div className="mt-1 flex items-baseline gap-3">
        <span className={`font-mono text-4xl ${tone === "amber" ? "text-amber" : ""}`}>{value}</span>
        {note && <span className="text-sm text-green">{note}</span>}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-muted">{children}</div>;
}

const PHOTO_TONES = ["#cfdcd3", "#e6dfcf", "#d9dee3", "#dfe1dc", "#e5ded3", "#d4dad6"];

export function PhotoTile({ refCode, photo, label = "PHOTO", className = "", badge }: { refCode: string; photo?: string; label?: string; className?: string; badge?: ReactNode }) {
  const tone = PHOTO_TONES[Number(refCode.replace(/\D/g, "")) % PHOTO_TONES.length];
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: tone }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo && <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      {badge && <div className="absolute left-3 top-3">{badge}</div>}
      {!photo && <div className="label-mono absolute bottom-3 left-4 text-ink-2/70">{label}</div>}
    </div>
  );
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="rounded-full bg-green-soft/90 px-3 py-1 text-sm font-semibold text-green">Verified</span>
  ) : (
    <span className="rounded-full bg-amber-soft px-3 py-1 text-sm font-semibold text-amber">Unverified</span>
  );
}
