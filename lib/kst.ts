/**
 * Asia/Seoul wall-clock helpers. Framework-agnostic (browser or Node, no
 * `server-only`) — used both server-side (features/travel-state/travelStateService)
 * and client-side (features/demo, which builds a demo trip's itinerary from
 * "right now" before calling the ordinary client `createTrip`).
 */

/** The real current instant, expressed as the app's usual "YYYY-MM-DD"/"HH:mm" KST strings. */
export function nowKst(now: Date = new Date()): { date: string; time: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** "YYYY-MM-DD" -> the same date `days` later (or earlier, if negative). Pure string-date arithmetic, no timezone conversion. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "HH:mm" -> minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** minutes since midnight (may be >= 1440 or negative) -> "HH:mm", wrapped into a single day. */
export function minutesToTime(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
