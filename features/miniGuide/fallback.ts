/**
 * features/miniGuide/fallback — the deterministic guide used whenever the
 * LLM is unavailable, slow, wrong, or ungrounded. Pure: no I/O, no LLM, no
 * clock, no random — the same facts always produce the same guide. This is
 * NOT a second interpreter of the profile — `buildMiniGuideFacts` already
 * decided which axes matter; this only turns that into canned Korean text.
 */
import type { MiniGuideFacts } from "./miniGuideFacts";
import type { MiniGuide } from "./miniGuideSchema";

/** One practical, non-place-specific tip per Korean preference label — never a venue name. */
const TIP_BY_LABEL: Record<string, string> = {
  자연: "풍경을 즐길 시간을 넉넉히 확보해보세요.",
  문화: "전시나 공연 일정을 여유 있게 잡아보세요.",
  맛집: "다음 식사까지 이동 시간을 여유 있게 잡아보세요.",
  카페: "중간중간 쉬어갈 카페 타임을 남겨두세요.",
  쇼핑: "쇼핑 시간을 넉넉히 남겨두면 덜 서두르게 돼요.",
  액티비티: "활동 사이에 체력을 회복할 휴식 시간을 넣어보세요.",
  사진: "빛이 좋은 시간대에 여유를 두고 움직여보세요.",
  휴식: "이동을 너무 촘촘하게 잡지 않는 게 좋아요.",
};

const BALANCED_TIPS = [
  "이동을 너무 촘촘하게 잡지 않기",
  "그날그날 마음 가는 대로 유연하게 즐기기",
];

export function buildFallbackMiniGuide(facts: MiniGuideFacts): MiniGuide {
  if (facts.isBalanced) {
    return {
      headline: "이번 여행, 마음 가는 대로 즐겨보세요",
      tips: BALANCED_TIPS,
    };
  }

  const labels = [...facts.topPreferenceLabels, ...facts.secondaryPreferenceLabels];
  const headlineLabels = facts.topPreferenceLabels.length > 0 ? facts.topPreferenceLabels : labels;
  const tips = labels
    .map((label) => TIP_BY_LABEL[label])
    .filter((t): t is string => Boolean(t))
    .slice(0, 3);

  return {
    headline: `${headlineLabels.slice(0, 2).join("·")} 중심으로 즐겨보세요`,
    tips,
  };
}
