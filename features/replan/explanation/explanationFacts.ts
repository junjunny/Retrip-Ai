/**
 * features/replan/explanation/explanationFacts — pure: turns a `ReplanPreview`
 * (already-decided, STEP 9/10 output) into the minimal, already-grounded
 * `ExplanationFacts` an LLM (or the deterministic fallback) is allowed to
 * describe. No fetch, no Firestore, no LLM call, no clock, no random.
 *
 * Deliberately excludes anything privacy-sensitive: no participant name, id,
 * secret, nickname, or per-participant score array — only the WINNING
 * option's already-aggregated numbers (the same ones STEP 9 computed), which
 * carry no identity. See explanationService.ts for where these facts are
 * actually sent to the LLM.
 */
import type { ReplanPreview, ReplanSlotAction } from "../replan";
import type { RiskLevel } from "@/types";

export interface SlotFact {
  itineraryOrder: number;
  action: ReplanSlotAction;
  currentPlaceName: string;
  proposedPlaceName: string | null;
  /** every field below is OMITTED (not present) when its source was null — never a fabricated placeholder value. */
  groupSatisfaction?: number;
  experiencePreservation?: number;
  situationFitness: number;
  timeFitness: number;
  travelBurden?: number;
  minimumSatisfactionPenalty: number;
  /** only present when a real Kakao Mobility route existed for the winning option. */
  travelDurationMinutes?: number;
  travelDistanceMeters?: number;
}

export interface ExplanationFacts {
  tripId: string;
  /** from STEP 7 Travel State — the SAME snapshot every slot in this preview was scored against. */
  weatherRisk: RiskLevel;
  trafficBurden: RiskLevel;
  changedCount: number;
  keptCount: number;
  slots: SlotFact[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function buildSlotFact(slot: ReplanPreview["slots"][number]): SlotFact {
  const b = slot.score.breakdown;
  const route = slot.score.route;
  return {
    itineraryOrder: slot.itineraryOrder,
    action: slot.action,
    currentPlaceName: slot.current.placeName,
    proposedPlaceName: slot.proposed?.placeName ?? null,
    ...(b.groupSatisfaction !== null ? { groupSatisfaction: b.groupSatisfaction } : {}),
    ...(b.experiencePreservation !== null ? { experiencePreservation: b.experiencePreservation } : {}),
    situationFitness: b.situationFitness,
    timeFitness: b.timeFitness,
    ...(b.travelBurden !== null ? { travelBurden: b.travelBurden } : {}),
    minimumSatisfactionPenalty: b.minimumSatisfactionPenalty,
    ...(route
      ? { travelDurationMinutes: round1(route.durationSeconds / 60), travelDistanceMeters: route.distanceMeters }
      : {}),
  };
}

export function buildExplanationFacts(
  preview: ReplanPreview,
  travelStateContext: { weatherRisk: RiskLevel; trafficBurden: RiskLevel },
): ExplanationFacts {
  return {
    tripId: preview.tripId,
    weatherRisk: travelStateContext.weatherRisk,
    trafficBurden: travelStateContext.trafficBurden,
    changedCount: preview.slots.filter((s) => s.action === "REPLACE").length,
    keptCount: preview.slots.filter((s) => s.action === "KEEP").length,
    slots: preview.slots.map(buildSlotFact),
  };
}
