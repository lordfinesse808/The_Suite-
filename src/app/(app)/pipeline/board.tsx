"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { setStage } from "@/app/actions";

export type Card = { id: string; name: string; score: number; line: string; sub: string; flag?: { text: string; tone: "amber" | "red" | "green" }; stage: string };
export type Column = { key: string; label: string; hint: string; color: string; cards: Card[] };

export function Board({ columns }: { columns: Column[] }) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [, start] = useTransition();
  return (
    <div className="scroll-thin -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
      {columns.map((c) => (
        <div
          key={c.key}
          className={`w-[215px] shrink-0 rounded-2xl transition ${over === c.key ? "bg-green-soft/40" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(c.key); }}
          onDragLeave={() => setOver(null)}
          onDrop={() => {
            setOver(null);
            if (drag) start(() => setStage(drag, c.key));
            setDrag(null);
          }}
        >
          <div className="mb-3 border-t-[3px] pt-2" style={{ borderColor: c.color }}>
            <div className="flex justify-between"><span className="text-lg font-semibold">{c.label}</span><span className="font-mono text-sm text-ink-2">{c.cards.length}</span></div>
            <div className="text-sm text-ink-2">{c.hint}</div>
          </div>
          <div className="space-y-3">
            {c.cards.map((k) => (
              <div key={k.id} draggable onDragStart={() => setDrag(k.id)} className={`card cursor-grab p-4 active:cursor-grabbing ${c.key === "lost" ? "border-dashed bg-transparent" : c.key === "won" ? "bg-soft" : ""}`}>
                <Link href={`/leads/${k.id}`} className="block">
                  <div className="flex items-start justify-between gap-2"><span className="font-semibold leading-tight">{k.name}</span><span className={`font-mono text-sm ${k.score >= 70 ? "text-amber" : "text-ink-2"}`}>{k.score}</span></div>
                  <div className="mt-1.5 text-[15px] text-ink-2">{k.line}</div>
                  {k.sub && <div className="mt-1 font-mono text-[12px] text-ink-2">{k.sub}</div>}
                  {k.flag && <div className={`mt-1.5 text-sm font-semibold ${k.flag.tone === "red" ? "text-red" : k.flag.tone === "green" ? "text-green" : "text-amber"}`}>{k.flag.text}</div>}
                </Link>
                <select aria-label="Move to stage" className="mt-2 w-full rounded-md border border-line bg-white/70 px-1 py-0.5 text-xs text-ink-2 md:hidden" defaultValue={k.stage} onChange={(e) => start(() => setStage(k.id, e.target.value))}>
                  {columns.map((col) => <option key={col.key} value={col.key}>{col.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
