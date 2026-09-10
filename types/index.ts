/**
 * Shared domain types for Re:Trip AI.
 *
 * PHASE 0: intentionally minimal. These are placeholders that mark the shape of
 * the domain so later phases have a stable import path (`@/types`). Fields will
 * be filled in phase by phase — do not over-specify them now.
 */
import type { Timestamp } from "firebase/firestore";

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
 * Fixed preference axes — a per-participant integer vector, 1..5
 * (see PREFERENCE_MIN/MAX; 3 = 보통). STEP 6 aggregates these into a group
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

/** The group's aggregated intended experience (Phase 4). */
export interface ExperienceProfile {
  tripId: string;
}

/**
 * Unified snapshot of the current trip conditions — weather, traffic, crowd,
 * etc. — produced by the Travel State Engine (Phase 7).
 */
export interface TravelState {
  tripId: string;
}

/** A candidate re-designed plan produced by the Re:Plan Engine (Phase 8). */
export interface ReplanPlan {
  tripId: string;
}
