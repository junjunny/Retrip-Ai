/**
 * features/travel-state/situationMessage — turns Travel State's real
 * `weatherRisk`/`trafficBurden` classifications (plus, when a real number
 * exists, `scheduleDelayMinutes`) into a short context->impact pair for
 * Trip Detail's "현재 상황" banner (STEP 18 §19, restructured in STEP 19
 * into "상황"/"영향", and given real intervention tiers in STEP 20).
 *
 * STEP 20's core rule: not every real signal deserves the user's attention.
 * Internal Travel State keeps computing everything, all the time — this
 * module is the ONE place that decides how loudly (if at all) that surfaces:
 *
 *   "low"/"unknown"  -> tier "quiet"   -> `null`, nothing shown at all.
 *   "medium"         -> tier "gentle"  -> one soft line, no impact, no
 *                                         action prompt — never nags.
 *   "high"           -> tier "notable" -> the full 상황->영향->선택 triple,
 *                                         but STILL never auto-anything;
 *                                         the caller decides whether to
 *                                         show a Re:Plan prompt alongside it.
 *
 * Pure, no I/O. Deliberately separate from `travelState.ts`: that file's
 * `weatherRiskReason`/`trafficBurdenReason` are internal debug strings
 * ("실내 일정 — 기상 심각도(high)를 한 단계 완화") never meant for an end user —
 * this is the ONLY place that turns a real risk LEVEL (+ a real delay
 * number, when one exists) into user-facing copy, and it never touches the
 * level/delay computation itself (unchanged Travel State inputs). Never
 * exposes the internal level name (no "high"/"WATCH"/NORMAL/score) and
 * never a countdown ("12분 남았습니다") or command ("지금 변경하세요").
 */
import type { RiskLevel } from "@/types";

export type SituationTier = "gentle" | "notable";
/**
 * Which signal this message is about — lets a caller pick a matching icon
 * without re-deriving it from the line's text (STEP 21). `buildSituationMessage`
 * (real Travel State) only ever produces "weather"/"traffic"/"mixed" — "crowd"
 * exists solely for a scripted Demo scenario (e.g. 대전's 인파 혼잡), which has
 * no real visitor-count signal wired into Travel State (see
 * features/demo/demoScenarios.ts's verification notes) and is never
 * presented as if it were.
 */
export type SituationKind = "weather" | "traffic" | "mixed" | "crowd";

export interface SituationMessage {
  tier: SituationTier;
  kind: SituationKind;
  /** "상황" — what changed, in calm, non-alarming language. */
  line: string;
  /** "영향" — where it actually bites, in THIS trip. Only present for "notable": a "gentle" tier is deliberately just the one soft line, nothing more. Uses a real number (scheduleDelayMinutes) when one exists; otherwise a qualitative-but-honest line, never a fabricated figure. */
  impact?: string;
}

/**
 * `weatherRisk` takes priority — a real, already-present weather event ("it
 * is raining on you right now") is more concrete to a traveler than a
 * general traffic burden. `null` when both are "low"/"unknown" — nothing
 * worth surfacing (STEP 20 tier "quiet"). Never a running weather/traffic
 * dashboard.
 */
export function buildSituationMessage(
  weatherRisk: RiskLevel,
  trafficBurden: RiskLevel,
  scheduleDelayMinutes: number | null,
): SituationMessage | null {
  if (weatherRisk === "high") {
    return {
      tier: "notable",
      kind: trafficBurden === "high" ? "mixed" : "weather",
      line: "여행에 비가 찾아왔어요.",
      impact: "다음 장소를 실내에서 이어가도 좋아요.",
    };
  }
  if (trafficBurden === "high") {
    const delay = scheduleDelayMinutes != null && scheduleDelayMinutes > 0 ? Math.round(scheduleDelayMinutes) : null;
    return {
      tier: "notable",
      kind: "traffic",
      line: "이동 시간이 조금 길어졌어요.",
      impact:
        delay !== null
          ? `지금 속도라면 다음 일정까지 여유가 약 ${delay}분 줄어들 수 있어요.`
          : "가까운 곳에서 여행을 이어가는 방법도 있어요.",
    };
  }
  if (weatherRisk === "medium" || trafficBurden === "medium") {
    return { tier: "gentle", kind: weatherRisk === "medium" ? "weather" : "traffic", line: "여행 흐름이 조금 달라졌어요." };
  }
  return null;
}
