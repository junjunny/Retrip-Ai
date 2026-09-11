/**
 * Minimal cooldown-based rate limiting (STEP 13 §16) for routes that trigger
 * real cost — external API calls and/or an LLM call. Not a queue, not a
 * token bucket: just "don't let the same key fire again within `cooldownMs`".
 *
 * ponytail: a single process-local `Map`, so this only limits per-instance —
 * on a multi-instance deployment a client could get one fresh cooldown per
 * instance it happens to hit. Fine for this project's traffic (a small demo
 * audience, not a public API), and it still stops the case that matters (a
 * user's own browser double-firing a paid action). Upgrade to a shared store
 * (Redis / Firestore doc with a TTL) only if real abuse shows up.
 */
const lastHitAt = new Map<string, number>();

/**
 * Returns `true` (and records the hit) if `key` may fire now; `false` if it's
 * still within `cooldownMs` of its last allowed hit. Pure side effect on the
 * module-local map only — no I/O.
 */
export function allowRequest(key: string, cooldownMs: number): boolean {
  const now = Date.now();
  const last = lastHitAt.get(key);
  if (last !== undefined && now - last < cooldownMs) return false;
  lastHitAt.set(key, now);
  return true;
}

/**
 * Request coalescing (STEP 14 bug fix): two callers for the same `key`
 * arriving while the first is still in flight share ONE underlying call
 * instead of the second being rejected by `allowRequest`'s cooldown.
 *
 * This is a real bug, not a hypothetical: React Strict Mode (dev only) double
 * -invokes an effect on mount, so a component that fetches once on mount can
 * genuinely issue two near-simultaneous requests for the same resource — the
 * second used to be silently rate-limited to an empty result even on a
 * user's very first page load. Coalescing fixes the root cause (duplicate
 * concurrent work) rather than loosening the cooldown, which wouldn't help
 * (two requests microseconds apart are within any nonzero cooldown).
 */
const inFlight = new Map<string, Promise<unknown>>();

export async function singleFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = run().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
