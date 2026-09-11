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
  /** STEP 12 — only present when a real TourAPI detail record was fetched for the winning candidate. */
  placeAddress?: string;
  placeOverviewSnippet?: string;
  /**
   * Whether a real festival/event is running RIGHT NOW — decided by
   * `isEventOngoing` (deterministic date comparison), never by the LLM. Absent
   * entirely (not `false`) when there's no real event data to judge at all.
   */
  eventOngoing?: boolean;
  eventStartDate?: string;
  eventEndDate?: string;
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

/** Raw TourAPI detail data for one REPLACE slot's winning candidate (STEP 12) — see features/replan/explanation/explanationService.ts for where this is fetched. */
export interface SlotPlaceDetail {
  itineraryOrder: number;
  address: string | null;
  /** TourAPI overview — free text, possibly long; truncated into the fact (see OVERVIEW_SNIPPET_MAX_LENGTH). */
  overview: string | null;
  /** raw "YYYYMMDD" dates from TourAPI detailIntro2 (festival content only) — "ongoing" is decided separately, by `isEventOngoing`. */
  event: { startDate: string; endDate: string } | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
export const OVERVIEW_SNIPPET_MAX_LENGTH = 220;

/**
 * Deterministic "지금 진행 중" check — the LLM never decides this (AGENTS-spec
 * §17). `event` dates and `nowDate` are compared as plain "YYYYMMDD" strings
 * (lexical order = chronological order for this format); `nowDate` is
 * "YYYY-MM-DD" (the app's usual convention) and is normalized here. `null`
 * event, or a missing date, is never treated as "ongoing".
 */
export function isEventOngoing(
  event: { startDate: string; endDate: string } | null,
  nowDate: string,
): boolean {
  if (!event || !event.startDate || !event.endDate) return false;
  const now = nowDate.replaceAll("-", "");
  return event.startDate <= now && now <= event.endDate;
}

function buildSlotFact(
  slot: ReplanPreview["slots"][number],
  nowDate: string,
  placeDetail: SlotPlaceDetail | undefined,
): SlotFact {
  const b = slot.score.breakdown;
  const route = slot.score.route;
  const ongoing = placeDetail ? isEventOngoing(placeDetail.event, nowDate) : false;
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
    ...(placeDetail?.address ? { placeAddress: placeDetail.address } : {}),
    ...(placeDetail?.overview
      ? { placeOverviewSnippet: placeDetail.overview.slice(0, OVERVIEW_SNIPPET_MAX_LENGTH) }
      : {}),
    ...(ongoing && placeDetail?.event
      ? { eventOngoing: true, eventStartDate: placeDetail.event.startDate, eventEndDate: placeDetail.event.endDate }
      : {}),
  };
}

export function buildExplanationFacts(
  preview: ReplanPreview,
  travelStateContext: { weatherRisk: RiskLevel; trafficBurden: RiskLevel },
  nowDate: string,
  placeDetails: readonly SlotPlaceDetail[] = [],
): ExplanationFacts {
  const detailByOrder = new Map(placeDetails.map((d) => [d.itineraryOrder, d]));
  return {
    tripId: preview.tripId,
    weatherRisk: travelStateContext.weatherRisk,
    trafficBurden: travelStateContext.trafficBurden,
    changedCount: preview.slots.filter((s) => s.action === "REPLACE").length,
    keptCount: preview.slots.filter((s) => s.action === "KEEP").length,
    slots: preview.slots.map((s) => buildSlotFact(s, nowDate, detailByOrder.get(s.itineraryOrder))),
  };
}
