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
