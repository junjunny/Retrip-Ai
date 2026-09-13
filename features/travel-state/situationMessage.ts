/**
 * features/travel-state/situationMessage — turns Travel State's real
 * `weatherRisk`/`trafficBurden` classifications (plus, when a real number
 * exists, `scheduleDelayMinutes`) into a short context->impact pair for
 * Trip Detail's "현재 상황" banner (STEP 18 §19, restructured in STEP 19 §19
 * into "상황"/"영향" so a judge or traveler sees not just WHAT changed but
 * WHERE it actually bites — the "그래서 어쩌라고?" 구조).
 *
 * Pure, no I/O. Deliberately separate from `travelState.ts`: that file's
 * `weatherRiskReason`/`trafficBurdenReason` are internal debug strings
 * ("실내 일정 — 기상 심각도(high)를 한 단계 완화") never meant for an end user —
 * this is the ONLY place that turns a real risk LEVEL (+ a real delay
 * number, when one exists) into user-facing copy, and it never touches the
 * level/delay computation itself (unchanged Travel State inputs).
 * "low"/"medium"/"unknown" never produce a banner — Re:Trip surfaces a
 * situation only when it would actually change what a traveler does, never
 * a running weather/traffic dashboard (STEP 18/19 §19/§37).
 */
import type { RiskLevel } from "@/types";

export interface SituationMessage {
  /** "상황" — what happened. */
  line: string;
  /** "영향" — where it actually bites, in THIS trip. Uses a real number (scheduleDelayMinutes) when one exists; otherwise a qualitative-but-honest line, never a fabricated figure. */
  impact: string;
}

/**
 * `weatherRisk` takes priority — a real, already-present weather event ("it
 * is raining on you right now") is more concrete to a traveler than a
 * general traffic burden. `null` when neither is "high": nothing worth
 * surfacing. Never exposes the level itself (no "high"/"WATCH"/score) — only
 * fixed, pre-written sentences per real condition, with the ONE real number
 * this module is allowed to use (`scheduleDelayMinutes`, already computed by
 * Travel State — STEP 7, unchanged) folded in verbatim when present.
 */
export function buildSituationMessage(
  weatherRisk: RiskLevel,
  trafficBurden: RiskLevel,
  scheduleDelayMinutes: number | null,
): SituationMessage | null {
  if (weatherRisk === "high") {
    return {
      line: "갑작스러운 날씨 변화로 지금 일정의 경험이 달라질 수 있어요.",
      impact: "지금 계획대로 진행하면 원래 기대했던 경험과 달라질 수 있어요.",
    };
  }
  if (trafficBurden === "high") {
    const delay = scheduleDelayMinutes != null && scheduleDelayMinutes > 0 ? Math.round(scheduleDelayMinutes) : null;
    return {
      line: "현재 이동 경로에 교통이 혼잡해 이동 부담이 커졌어요.",
      impact:
        delay !== null
          ? `지금 속도라면 다음 일정이 약 ${delay}분 늦어질 수 있어요.`
          : "지금 일정대로 이동하면 남은 여유 시간이 줄어들 수 있어요.",
    };
  }
  return null;
}
