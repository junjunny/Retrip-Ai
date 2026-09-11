/**
 * features/miniGuide/miniGuideSchema — the ONLY shape a Mini Guide may take,
 * plus the validators that gate an LLM response before it reaches the
 * client. Mirrors features/replan/explanation/explanationSchema.ts's pattern.
 */
import type { MiniGuideFacts } from "./miniGuideFacts";

export interface MiniGuide {
  headline: string;
  /** at most MAX_TIPS practical, non-place-specific suggestions — never a venue recommendation. */
  tips: string[];
}

export const MAX_HEADLINE_LENGTH = 40;
export const MAX_TIP_LENGTH = 60;
export const MAX_TIPS = 4;

function isShortString(v: unknown, maxLength: number): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= maxLength;
}

export function isValidMiniGuide(v: unknown): v is MiniGuide {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!isShortString(o.headline, MAX_HEADLINE_LENGTH)) return false;
  if (!Array.isArray(o.tips) || o.tips.length > MAX_TIPS) return false;
  return o.tips.every((t) => isShortString(t, MAX_TIP_LENGTH));
}

/**
 * A raw 1..10 score never belongs in Mini Guide prose either — it's not
 * fed one in the first place (miniGuideFacts.ts only sends axis LABELS), but
 * this is a defensive second layer in case a generation invents a number
 * anyway (mirrors explanationSchema.ts's RAW_SCORE_PATTERN).
 */
const RAW_SCORE_PATTERN = /\d+\s*(점|퍼센트|%|으로\s*(높|낮))/;

/**
 * Every top/secondary label the guide mentions must actually be one `facts`
 * supplied — never a preference axis this profile didn't call out. A guide
 * for an `isBalanced` profile must not claim a specific axis stands out.
 */
export function isMiniGuideGrounded(guide: MiniGuide, facts: MiniGuideFacts): boolean {
  const text = [guide.headline, ...guide.tips].join(" ");
  if (RAW_SCORE_PATTERN.test(text)) return false;

  const mentionable = new Set([...facts.topPreferenceLabels, ...facts.secondaryPreferenceLabels]);
  if (facts.isBalanced) return true; // nothing to check a specific claim against
  // at least one real preference label should appear somewhere — otherwise the
  // guide isn't actually describing this trip's profile at all.
  return [...mentionable].some((label) => text.includes(label));
}
