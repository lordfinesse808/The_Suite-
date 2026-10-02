// Time travel for testing reminders and follow-ups (mock mode only).
import { advanceClock, clockOffsetMs, now, resetClock } from "@/lib/clock";
import { tick } from "@/lib/jobs/queue";
import { devOnly } from "../guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const blocked = devOnly();
  if (blocked) return blocked;
  return Response.json({ now: now().toISOString(), offsetHours: clockOffsetMs() / 3600_000 });
}

export async function POST(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;
  const { hours, reset } = (await req.json()) as { hours?: number; reset?: boolean };
  if (reset) resetClock();
  else if (hours) advanceClock(hours * 3600_000);
  const r = await tick({ scan: true });
  return Response.json({ now: now().toISOString(), offsetHours: clockOffsetMs() / 3600_000, ...r });
}
