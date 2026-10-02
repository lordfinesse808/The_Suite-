// A shiftable clock so reminders and follow-ups can be tested by "time travel"
// (simulator control and tests). In production the offset is always 0.
const g = globalThis as unknown as { __ileClockOffsetMs?: number };

export function now(): Date {
  return new Date(Date.now() + (g.__ileClockOffsetMs ?? 0));
}

export function advanceClock(ms: number) {
  g.__ileClockOffsetMs = (g.__ileClockOffsetMs ?? 0) + ms;
}

export function resetClock() {
  g.__ileClockOffsetMs = 0;
}

export function clockOffsetMs() {
  return g.__ileClockOffsetMs ?? 0;
}

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;
