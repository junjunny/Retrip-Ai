/**
 * features/miniGuide/miniGuideFacts — pure: turns a trip's `ExperienceProfile`
 * (STEP 12's `tripPreference`) into the minimal facts an LLM (or the
 * deterministic fallback) may describe. No numbers are exposed here — only
 * WHICH axes stand out, as their Korean labels — so nothing downstream can
 * leak a 1..10 score into prose even by accident. No fetch, no LLM, no clock,
 * no random.
 */
import { PREFERENCE_KEYS, PREFERENCE_LABELS } from "@/features/participant/participant";
import type { ExperienceProfile } from "@/types";

/** An axis at/above this (1..10 scale) counts as something this trip is distinctly about. */
export const MINI_GUIDE_TOP_THRESHOLD = 8;
/** An axis at/above this (but below TOP) counts as a secondary interest. */
export const MINI_GUIDE_SECONDARY_THRESHOLD = 6;

export interface MiniGuideFacts {
  /** Korean labels, highest value first (ties broken by PREFERENCE_KEYS' canonical order — deterministic). */
  topPreferenceLabels: string[];
  secondaryPreferenceLabels: string[];
  /** true when nothing cleared even the secondary threshold — a deliberately neutral trip. */
  isBalanced: boolean;
}

/** Deterministic: same profile always produces the same facts, in the same order. */
export function buildMiniGuideFacts(profile: ExperienceProfile): MiniGuideFacts {
  const rank = new Map(PREFERENCE_KEYS.map((k, i) => [k, i]));
  const sorted = [...PREFERENCE_KEYS].sort(
    (a, b) => profile[b] - profile[a] || rank.get(a)! - rank.get(b)!,
  );
  const top = sorted.filter((k) => profile[k] >= MINI_GUIDE_TOP_THRESHOLD);
  const secondary = sorted.filter(
    (k) => profile[k] >= MINI_GUIDE_SECONDARY_THRESHOLD && profile[k] < MINI_GUIDE_TOP_THRESHOLD,
  );
  return {
    topPreferenceLabels: top.map((k) => PREFERENCE_LABELS[k]),
    secondaryPreferenceLabels: secondary.map((k) => PREFERENCE_LABELS[k]),
    isBalanced: top.length === 0 && secondary.length === 0,
  };
}
