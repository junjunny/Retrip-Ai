/**
 * features/replan/experienceHighlights — pure presentation helper (STEP 21):
 * which of a real `ExperienceProfile`'s axes actually matter enough to show
 * as "원래 여행에서 지키고 싶은 경험" in Re:Plan Preview.
 *
 * Reuses PREFERENCE_KEYS/PREFERENCE_LABELS/PREFERENCE_NEUTRAL exactly as
 * scoring already does (features/scoring/scoring.ts) — this is a NEW view
 * over an EXISTING value, never a new preference model. No fallback/default
 * profile is ever invented here: the caller passes `null` when a trip has
 * no real Trip Preference, and this returns `[]` — the UI hides the section
 * entirely rather than presenting a fabricated "what you care about".
 */
import { PREFERENCE_KEYS, PREFERENCE_LABELS, PREFERENCE_NEUTRAL } from "@/features/participant/participant";
import type { ExperienceProfile, PreferenceKey } from "@/types";

export interface ExperienceHighlight {
  key: PreferenceKey;
  label: string;
}

/**
 * The axes rated ABOVE neutral, highest first, capped at `max` — the exact
 * same "above neutral counts as a real preference" rule
 * `selectSearchContentTypeIds`/`computeExperiencePreservation` already use,
 * so this view can never disagree with what scoring actually preserved.
 * `null`/all-neutral profile -> `[]` (nothing distinctive to show).
 */
export function topExperienceHighlights(
  profile: ExperienceProfile | null,
  max = 3,
): ExperienceHighlight[] {
  if (!profile) return [];
  return PREFERENCE_KEYS.filter((k) => profile[k] > PREFERENCE_NEUTRAL)
    .sort((a, b) => profile[b] - profile[a])
    .slice(0, max)
    .map((key) => ({ key, label: PREFERENCE_LABELS[key] }));
}
