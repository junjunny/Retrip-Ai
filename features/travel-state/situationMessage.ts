/**
 * features/travel-state/situationMessage — turns Travel State's real
 * `weatherRisk`/`trafficBurden` classifications into ONE short,
 * traveler-voiced line for Trip Detail's "현재 상황" banner (STEP 18 §19).
 *
 * Pure, no I/O. Deliberately separate from `travelState.ts`: that file's
 * `weatherRiskReason`/`trafficBurdenReason` are internal debug strings
 * ("실내 일정 — 기상 심각도(high)를 한 단계 완화") never meant for an end user —
 * this is the ONLY place that turns a real risk LEVEL into user-facing copy,
 * and it never touches the level computation itself (unchanged scoring
 * input). "low"/"medium"/"unknown" never produce a banner — Re:Trip
 * surfaces a situation only when it would actually change what a traveler
 * does, never a running weather/traffic dashboard (STEP 18 §19/§37).
 */
import type { RiskLevel } from "@/types";

export interface SituationMessage {
  line: string;
}

/**
 * `weatherRisk` takes priority — a real, already-present weather event ("it
 * is raining on you right now") is more concrete to a traveler than a
 * general traffic burden. `null` when neither is "high": nothing worth
 * surfacing. Never exposes the level itself (no "high"/"WATCH"/score) — only
 * this fixed, pre-written sentence per real condition.
 */
export function buildSituationMessage(
  weatherRisk: RiskLevel,
  trafficBurden: RiskLevel,
): SituationMessage | null {
  if (weatherRisk === "high") {
    return { line: "갑작스러운 날씨 변화로 지금 일정의 경험이 달라질 수 있어요." };
  }
  if (trafficBurden === "high") {
    return { line: "현재 이동 경로에 교통이 혼잡해 이동 부담이 커졌어요." };
  }
  return null;
}
