/**
 * features/journey/narrativeFacts — pure: the minimal, already-grounded
 * facts the "다음 장소" narrative LLM (STEP 19) is allowed to describe. No
 * fetch, no Firestore, no LLM call. Mirrors
 * features/replan/explanation/explanationFacts.ts's shape/spirit exactly —
 * a second grounded-narrative feature, not a second architecture.
 */
export interface NarrativeFacts {
  placeName: string;
  address?: string;
  /** TourAPI detailCommon2 overview, truncated — the ONLY source of any place characteristic the LLM may mention. */
  overviewSnippet?: string;
  /** whether a real festival/event at this place is running RIGHT NOW — decided deterministically (reused from explanationFacts.isEventOngoing), never by the LLM. */
  eventOngoing?: boolean;
  eventStartDate?: string;
  eventEndDate?: string;
  /** the place the traveler is arriving FROM — for narrative flow ("방금 둘러본 ○○에서 이어서") only, never a claim needing its own grounding. */
  previousPlaceName?: string;
  /** only present when a real Kakao Mobility route was computed for this exact transition. */
  travelDurationMinutes?: number;
  travelDistanceMeters?: number;
}

export const NARRATIVE_OVERVIEW_MAX_LENGTH = 220;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildNarrativeFacts(input: {
  placeName: string;
  address: string | null;
  detail: { overview: string | null; event: { startDate: string; endDate: string } | null } | null;
  nowDate: string;
  previousPlaceName: string | null;
  route: { durationSeconds: number; distanceMeters: number } | null;
}): NarrativeFacts {
  const ongoing =
    input.detail?.event != null &&
    input.detail.event.startDate <= input.nowDate.replaceAll("-", "") &&
    input.nowDate.replaceAll("-", "") <= input.detail.event.endDate;

  return {
    placeName: input.placeName,
    ...(input.address ? { address: input.address } : {}),
    ...(input.detail?.overview
      ? { overviewSnippet: input.detail.overview.slice(0, NARRATIVE_OVERVIEW_MAX_LENGTH) }
      : {}),
    ...(ongoing && input.detail?.event
      ? { eventOngoing: true, eventStartDate: input.detail.event.startDate, eventEndDate: input.detail.event.endDate }
      : {}),
    ...(input.previousPlaceName ? { previousPlaceName: input.previousPlaceName } : {}),
    ...(input.route
      ? {
          travelDurationMinutes: round1(input.route.durationSeconds / 60),
          travelDistanceMeters: input.route.distanceMeters,
        }
      : {}),
  };
}
