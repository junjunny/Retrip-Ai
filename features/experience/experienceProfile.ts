/**
 * features/experience — group Experience Profile (STEP 6).
 *
 * Pure, deterministic aggregation: individual `PreferenceVector`s → one group
 * `ExperienceProfile`, every participant weighted equally. No I/O, no time, no
 * random, no LLM. Reusable by later steps (STEP 8 candidates, STEP 9 scoring).
 *
 * This is an intermediate representation, NOT a recommendation. It deliberately
 * does not compute a "travel style", a top/priority axis, conflict/variance,
 * or minimum-satisfaction protection — those belong to STEP 9.
 */
import {
  PREFERENCE_KEYS,
  coercePreferenceVector,
} from "@/features/participant/participant";
import type { ExperienceProfile, PreferenceKey, PreferenceVector } from "@/types";

/** 2-dp so floating-point noise (1/3, 2/3, …) doesn't leak, without losing signal. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Aggregate the group's preference vectors into one Experience Profile.
 *
 * - `[]` → `null`. No average is defined for an empty group; callers show
 *   "아직 여행 취향을 입력한 사람이 없어요" rather than a fabricated vector.
 * - 1 participant → their own (normalized) vector.
 * - n participants → per-axis arithmetic mean, `sum / n`, rounded to 2 dp.
 *
 * Deterministic and order-independent: `buildExperienceProfile([a, b])` equals
 * `buildExperienceProfile([b, a])`.
 */
export function buildExperienceProfile(
  preferences: readonly (Partial<PreferenceVector> | null | undefined)[],
): ExperienceProfile | null {
  if (preferences.length === 0) return null;

  const vectors = preferences.map(coercePreferenceVector);
  const n = vectors.length;

  return Object.fromEntries(
    PREFERENCE_KEYS.map((key: PreferenceKey) => [
      key,
      round2(vectors.reduce((sum, v) => sum + v[key], 0) / n),
    ]),
  ) as ExperienceProfile;
}
