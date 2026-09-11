/**
 * Shared domain types for Re:Trip AI.
 *
 * PHASE 0: intentionally minimal. These are placeholders that mark the shape of
 * the domain so later phases have a stable import path (`@/types`). Fields will
 * be filled in phase by phase — do not over-specify them now.
 */
import type { Timestamp } from "firebase/firestore";

import type { RoutePolylinePoint } from "./external";

/** External-source domain models (TourAPI / KMA / Kakao) — see types/external.ts. */
export * from "./external";

/** FIXED items are never re-planned; FLEXIBLE ones are Re:Plan's targets. */
export type ScheduleType = "fixed" | "flexible";
/** "completed" items are frozen during Re:Plan (progress-point protection). */
export type ItineraryItemStatus = "planned" | "completed";

/**
 * One stop in a trip's plan. `order` is system-managed (see features/trip).
 *
 * Legacy docs (Phase 1/2) only had `{ order, time, placeName }`; on read the
 * service fills `date` (← trip.startDate), `scheduleType` ("flexible"),
 * `status` ("planned"), `placeConfirmed` (false), and the place fields (null)
 * — see `coerceItinerary`.
 */
export interface ItineraryItem {
  order: number;
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:mm", 24-hour. */
  time: string;
  /** stable place ref once resolved ("kakao:{id}" | "tour:{contentId}"); null until then. */
  placeId: string | null;
  placeName: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  scheduleType: ScheduleType;
  status: ItineraryItemStatus;
  /** the USER confirmed / picked this place — NOT the same as an API's
   *  `NormalizedPlace.verificationStatus`. Legacy items default to `false`. */
  placeConfirmed: boolean;
}

/** A planned trip (Phase 1). One Firestore document under `trips/{tripId}`. */
export interface Trip {
  tripId: string;
  title: string;
  destination: string;
  /** "YYYY-MM-DD" — stored as a plain string, no timezone conversion. */
  startDate: string;
  /** "YYYY-MM-DD" — stored as a plain string, no timezone conversion. */
  endDate: string;
  itinerary: ItineraryItem[];
  createdAt: Timestamp;
  status: "active" | "completed";
  /**
   * "이번 여행"의 취향 (STEP 12) — NOT any participant's usual travel taste.
   * Same 8 axes / 1..10 scale as a participant `PreferenceVector`, but a
   * conceptually different thing: this is what THIS trip's group decided to
   * prioritize, set once at trip creation. Feeds Experience Preservation and
   * the Mini Guide (features/miniGuide) — never Group Satisfaction, which
   * stays sourced from individual participant preferences (STEP 5/6).
   * `null` when a trip predates STEP 12 (the field is simply absent) OR
   * (STEP 13) when the creator never opened/used the "이번 여행은 어떤
   * 여행인가요?" step — the two are indistinguishable and that's intentional,
   * since both mean the same thing downstream: fall back to the
   * participant-averaged Experience Profile (STEP 6), and skip the Mini
   * Guide (nothing to guide with). A vector is stored ONLY when the creator
   * actually interacted with that step (see components/trip/TripCreateForm's
   * `tripPreferenceTouched` — even an all-neutral vector they explicitly left
   * unchanged after opening the step counts as "used"). See
   * features/trip/trip.ts's `coerceTripPreference`.
   */
  tripPreference: ExperienceProfile | null;
}

/** Survey status for a participant (Phase 2). */
export type PreferenceStatus = "not_started" | "completed";

/**
 * A member of the traveling group (Phase 2). Stored at
 * `trips/{tripId}/participants/{participantId}`. Written/read only via the
 * Admin SDK in server Route Handlers — never from the browser.
 *
 * `secretHash` (sha256 of the participant's opaque secret) is NOT part of this
 * type: it never leaves the server.
 */
export interface Participant {
  participantId: string;
  tripId: string;
  nickname: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  preferenceStatus: PreferenceStatus;
}

/**
 * Fixed preference axes — a per-participant integer vector, 1..10
 * (see PREFERENCE_MIN/MAX; 5 = 보통). STEP 6 aggregates these into a group
 * Experience Profile — STEP 5 only stores the raw per-participant values.
 */
export type PreferenceKey =
  | "nature"
  | "culture"
  | "food"
  | "cafe"
  | "shopping"
  | "activity"
  | "photo"
  | "relax";

export type PreferenceVector = Record<PreferenceKey, number>;

export type TravelPace = "slow" | "normal" | "fast";
export type IndoorOutdoor = "indoor" | "outdoor" | "balanced";

/**
 * A participant's structured preferences (Phase 2). Stored at
 * `trips/{tripId}/preferences/{participantId}`. Deterministic values only — no
 * free text — so Phase 3 can compare preference vectors across the group.
 */
export interface Preference {
  participantId: string;
  tripId: string;
  preferences: PreferenceVector;
  pace: TravelPace;
  indoorOutdoor: IndoorOutdoor;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * A place resolved by cross-checking TourAPI (관광 콘텐츠) against Kakao Local
 * (장소/좌표). Deterministic confidence — never a blind `results[0]`.
 * `verificationStatus: "unresolved"` and `null` coordinates are valid states
 * ("모른다" is allowed). See `lib/place`.
 */
export type PlaceConfidence = "high" | "medium" | "low";
export type PlaceVerificationStatus = "verified" | "candidate" | "unresolved";
export type PlaceSource = "tour-korservice" | "kakao";

export interface PlaceCandidate {
  source: PlaceSource;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** "kakao:{id}" | "tour:{contentId}" | null — lets the client pick this one. */
  placeId: string | null;
  /** 0..1 — normalized-name similarity to the query. */
  nameSimilarity: number;
  /** metres from the cross-source reference, or null when coords are missing. */
  distanceMeters: number | null;
}

export interface NormalizedPlace {
  /** the itinerary place name / search query this was resolved from. */
  query: string;
  /** best display name — a verified source name, else the query. */
  placeName: string;
  /** "kakao:{id}" | "tour:{contentId}" | null. */
  placeId: string | null;
  address: string | null;
  roadAddress: string | null;
  latitude: number | null;
  longitude: number | null;

  tourApiContentId: string | null;
  tourApiCategoryCode: string | null;
  tourApiImageUrl: string | null;

  kakaoPlaceId: string | null;
  kakaoCategory: string | null;
  kakaoPlaceUrl: string | null;

  confidence: PlaceConfidence;
  verificationStatus: PlaceVerificationStatus;
  /** adapters that contributed data. */
  sources: PlaceSource[];
  /** other plausible matches kept for user disambiguation. */
  candidates: PlaceCandidate[];
}

/**
 * The group's aggregated preference (STEP 6) — the equal-weight mean of every
 * participant's `PreferenceVector`. Same 8 axes and 1..10 scale, but values may
 * be fractional (rounded to 2 dp). Derived deterministically from the stored
 * preferences via `buildExperienceProfile`; NOT persisted.
 *
 * This is an intermediate representation, not a recommendation: it carries no
 * place, priority, "travel style", or conflict/variance information. Those
 * belong to later steps (STEP 8 candidates, STEP 9 scoring).
 *
 * `buildExperienceProfile` returns `null` (not a fabricated vector) when no
 * participant has submitted preferences yet.
 */
export type ExperienceProfile = Record<PreferenceKey, number>;

/**
 * "low"/"medium"/"high" is the only resolution Travel State needs for a risk
 * signal — see features/travel-state. "unknown" means insufficient trustworthy
 * data, NEVER a guess (no weather forecast, no route, etc).
 */
export type RiskLevel = "low" | "medium" | "high" | "unknown";

/**
 * Internal engine state only (STEP 7). NEVER shown to the user, NEVER drives an
 * automatic itinerary change, alert, or Re:Plan run — only a future
 * user-triggered Re:Plan (STEP 10) may consult it.
 */
export type TravelStateStatus = "NORMAL" | "WATCH" | "INTERVENTION";

/**
 * "How is this trip doing against its own plan, right now" — NOT a
 * recommendation, NOT a score, NOT Re:Plan, and NOT the group's Experience
 * Profile (STEP 6 answers "what does this group want"; this answers "what's
 * actually happening"). Computed on demand by `buildTravelState`
 * (features/travel-state) — never persisted.
 *
 * Every optional/null field means "not enough trustworthy data" — reliable
 * current-location, visit-confirmation, and traffic-baseline data don't exist
 * in this project yet, so those metrics degrade to null/"unknown" rather than
 * being estimated.
 */
export interface TravelState {
  tripId: string;
  /** The plain "YYYY-MM-DD"/"HH:mm" (KST) clock reading this snapshot was computed for — injected by the caller, never read from the system clock inside a pure calculator. */
  now: { date: string; time: string };

  /** Minutes behind the next not-yet-completed item scheduled for `now.date`; 0 when on/ahead of schedule; null when there's no such item to compare against. This is "plan vs. clock", never a claimed arrival delay. */
  scheduleDelayMinutes: number | null;
  /** Minutes from `now` to the last scheduled item on `now.date` — remaining PLANNED time, not "free time"; null with no items today. */
  remainingScheduleMinutes: number | null;

  weatherRisk: RiskLevel;
  weatherRiskReason: string;

  trafficBurden: RiskLevel;
  trafficBurdenReason: string;

  /** 0 (completed visits match the group's Experience Profile) .. 1 (opposite); null without both a profile and trustworthy completed-visit category data — visit tracking by category doesn't exist yet, so this is always null in production today. */
  experienceDeviation: number | null;

  /** How spread out the group's preferences are (0 = identical); null with 0-1 participants who submitted preferences. */
  preferenceDisagreement: number | null;

  status: TravelStateStatus;
}

/**
 * One real, API-confirmed alternative for a FLEXIBLE itinerary slot (STEP 8,
 * Candidate Generation). Deliberately close to `PlaceCandidate`/`NormalizedPlace`'s
 * vocabulary (source / verificationStatus / placeId / coordinates), but not the
 * same shape: those types resolve ONE user-typed place name against a query, this
 * describes generating a LIST of fresh alternatives — there's no user query to
 * hold a `nameSimilarity` against, and there IS a real TourAPI `contentTypeId`
 * worth keeping.
 *
 * Every field traces back to a real adapter response (TourAPI / Kakao Local) —
 * never an invented name or coordinate. `candidateReason` is a short debug note,
 * NOT a score — see features/candidate. STEP 9 (out of scope here) is what
 * ranks these.
 */
export interface CandidatePlace {
  placeId: string | null;
  placeName: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** TourAPI contentTypeId this came from (see lib/api/tour/tourism.ts), when known. */
  category: number | null;
  /**
   * TourAPI contentid (STEP 12) — kept separately from `placeId`, which may
   * end up `"kakao:{id}"` when Kakao verification wins (see
   * buildCandidateFromTourism / lib/place/match.ts). Needed to fetch a
   * detail-level description/event via lib/api/tour/tourismDetail.ts without
   * re-searching. `null` when this candidate has no TourAPI origin (e.g. a
   * "keep current" view — see features/scoring/scoring.ts's itemToCandidateView).
   */
  tourApiContentId: string | null;
  /** TourAPI firstimage, when the source data had one — never a generated/guessed URL. */
  imageUrl: string | null;
  source: PlaceSource;
  verificationStatus: PlaceVerificationStatus;
  candidateReason: string;
}

/**
 * Candidate Generation's output for one FLEXIBLE itinerary item (STEP 8).
 * `keepCurrent` is a system CONTROL VALUE, not a Place object — it is never
 * mixed into `candidates` — representing "do nothing to this slot", which is
 * always a valid option since Re:Trip never changes a plan on its own.
 */
export interface SlotCandidates {
  /** the ItineraryItem.order this is for. */
  itineraryOrder: number;
  /** always true here — keeping the current place is always an option. Reserved for a future STEP to express when it isn't. */
  keepCurrent: true;
  candidates: CandidatePlace[];
}

/**
 * One transport mode's real-or-honestly-unavailable info between two points
 * (STEP 13). Re:Trip's only real provider is Kakao Mobility, and Kakao only
 * grants 자동차 길찾기 (`/v1/directions`) to a plain REST key — 도보/대중교통
 * 통합 길찾기 are 제휴(partnership)-only APIs this project has no access to
 * (see lib/api/kakao/route.ts). So `WALK`/`TRANSIT` are ALWAYS
 * `available: false` today — never an estimated duration dressed up as real
 * data. See features/mobility for the pure builder.
 */
export type MobilityMode = "WALK" | "DRIVING" | "TRANSIT";

export interface MobilityOption {
  mode: MobilityMode;
  available: boolean;
  durationMinutes: number | null;
  distanceMeters: number | null;
  /** Korean label from Kakao's raw traffic_state code ("원활"/"서행"/"지체"/"정체") — DRIVING only when real segment data exists, else null. */
  trafficLabel: string | null;
  /** No transit adapter exists (see `MobilityMode` doc) — always null today; kept so a future real transit integration doesn't need a shape change. */
  transferCount: number | null;
  /** Real route geometry for the map, or `[]` when unavailable/unknown — never a straight line between the two points. */
  polyline: RoutePolylinePoint[];
  source: "kakao-mobility" | null;
  /** Non-null exactly when `available` is false — why this mode has no data (e.g. no API access, no route found, adapter failure). */
  failureReason: string | null;
}

/**
 * `ReplanPreview` / `ReplanSlotProposal` (STEP 10) live in `features/replan`,
 * not here — they embed `RankedOption` from `features/scoring`, and `types/`
 * must not depend on a feature module (features depend on types, never the
 * reverse). This PHASE-0 stub is superseded; nothing imports it.
 */
