/**
 * features/replan/explanation/fallback — the deterministic explanation used
 * whenever the LLM is unavailable, slow, wrong, or ungrounded (see
 * explanationService.ts). This is NOT a second decision-maker — it only
 * restates the score breakdown STEP 9 already computed, in canned Korean
 * sentences gated by named thresholds. Pure: no I/O, no LLM, no clock, no
 * random — same facts always produce the same explanation.
 */
import type { ExplanationFacts, SlotFact } from "./explanationFacts";
import type { ReplanExplanation } from "./explanationSchema";

/** A component counts as "high" for fallback wording at/above this (0..100 scale) — same spirit as STEP 9's own component scale, kept separate as its own named constant since this is prose-selection, not scoring. */
export const FALLBACK_HIGH_THRESHOLD = 70;
/** travelBurden counts as "low" at/below this. */
export const FALLBACK_LOW_BURDEN_THRESHOLD = 30;

function slotReasonsFor(fact: SlotFact): string[] {
  const reasons: string[] = [];
  if (fact.groupSatisfaction !== undefined && fact.groupSatisfaction >= FALLBACK_HIGH_THRESHOLD) {
    reasons.push("일행 전체의 선호와 잘 맞는 대안으로 평가되었습니다.");
  }
  if (fact.experiencePreservation !== undefined && fact.experiencePreservation >= FALLBACK_HIGH_THRESHOLD) {
    reasons.push("기존 여행 경험을 유지하는 데 유리한 대안입니다.");
  }
  if (fact.situationFitness >= FALLBACK_HIGH_THRESHOLD) {
    reasons.push("현재 여행 상황에서 더 적합한 대안으로 평가되었습니다.");
  }
  if (fact.travelBurden !== undefined && fact.travelBurden <= FALLBACK_LOW_BURDEN_THRESHOLD) {
    reasons.push("이동 부담이 비교적 낮습니다.");
  }
  // a near-zero penalty on the WINNING option, with a real group to protect, means
  // no one was meaningfully sacrificed for the group average — a fairness note,
  // never naming who preferred what.
  if (fact.groupSatisfaction !== undefined && fact.minimumSatisfactionPenalty === 0) {
    reasons.push("한 사람의 선호가 크게 희생되지 않도록 일행 전체의 만족도를 균형 있게 고려했습니다.");
  }
  return reasons;
}

/** Pure, deterministic, threshold-driven — never invents a fact `facts` doesn't already carry. */
export function buildFallbackExplanation(facts: ExplanationFacts): ReplanExplanation {
  const changed = facts.slots.filter((s) => s.action === "REPLACE");

  if (changed.length === 0) {
    return {
      title: "기존 일정을 유지하는 편이 좋아요",
      summary:
        "현재 후보들과 비교했을 때 기존 일정이 여행 경험과 상황 적합성 측면에서 더 안정적인 선택으로 평가되었습니다.",
      reasons: [],
      cautions: [],
      slotReasons: [],
    };
  }

  const primary = changed[0];
  const reasons = slotReasonsFor(primary).slice(0, 3);

  return {
    title: `${changed.length}개 일정을 다시 계획할 수 있어요`,
    summary:
      "현재 여행 상황과 일행의 선호를 반영했을 때, 기존 일정의 경험을 비교적 잘 유지하면서 더 적합한 대안으로 평가된 일정이 있습니다.",
    reasons,
    cautions: [],
    slotReasons: changed.map((s) => ({
      itineraryOrder: s.itineraryOrder,
      reason: slotReasonsFor(s)[0] ?? "현재보다 더 적합한 대안으로 평가되었습니다.",
    })),
  };
}
