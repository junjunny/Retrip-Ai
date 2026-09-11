/**
 * features/scoring — Deterministic Scoring (STEP 9).
 *
 * STEP 8 answered "which real places COULD replace this FLEXIBLE slot?". This
 * answers "which of those is a better fit for this group, right now?" — by
 * scoring each candidate (and the "keep current" option) on six named
 * components and combining them with fixed, documented weights. NEVER an LLM
 * call, NEVER I/O, NEVER `new Date()`/`Math.random()` — every input is
 * injected, so the same input always produces the same score and the same
 * ranking. I/O (route data) lives in `./scoringService`.
 *
 * ── The six components ──────────────────────────────────────────────────
 * POSITIVE:
 *   1. groupSatisfaction        — do INDIVIDUAL participants like this?
 *   2. experiencePreservation   — does this match what the GROUP, as a whole,
 *                                 distinctively cares about (relative to its
 *                                 own average interest — NOT the same
 *                                 computation as groupSatisfaction; see below)
 *   3. situationFitness         — does this suit today's real weather AND
 *                                 today's real traffic situation?
 *   4. timeFitness              — is there realistically enough time?
 * NEGATIVE:
 *   5. travelBurden              — real cost of getting there
 *   6. minimumSatisfactionPenalty — is one participant being sacrificed for
 *                                  the group average? (the core safeguard)
 *
 * ── Avoiding double counting ────────────────────────────────────────────
 * groupSatisfaction anchors each participant's preference against the FIXED
 * scale neutral (PREFERENCE_NEUTRAL = 5): "does this person like this kind of
 * place, in absolute terms". experiencePreservation anchors the group's
 * Experience Profile against ITS OWN mean across all 8 axes: "is this candidate
 * serving what's distinctively important to this group, relative to
 * everything else they also somewhat like". Because the anchor differs
 * (a fixed constant vs. a per-group computed mean) and the two use different
 * score ranges, the two are NOT algebraically the same quantity — verified by
 * a dedicated invariant test (tests/scoring.test.ts).
 * travelBurden is the raw cost of the trip to the candidate, independent of
 * the clock. timeFitness is whether that cost fits inside the time actually
 * left before the slot's original time. situationFitness is whether TODAY'S
 * weather suits the candidate's category — a completely different signal
 * (weather, not distance/duration) from either.
 *
 * ── Unknown data ─────────────────────────────────────────────────────────
 * A component with no real data behind it NEVER becomes an invented "good" or
 * "bad" number. Two-sided components (groupSatisfaction, experiencePreservation)
 * fall back to NEUTRAL_COMPONENT_SCORE (50) for the final-score sum when they
 * can't be computed (kept as `null` in the breakdown for transparency).
 * One-sided COST components (travelBurden) fall back to 0 (no *evidenced*
 * cost) rather than a mid-scale guess, because "unknown" is not "medium cost".
 */
import { INDOOR_CONTENT_TYPES, OUTDOOR_CONTENT_TYPES, PREFERENCE_TO_CONTENT_TYPE } from "@/features/candidate";
import { PREFERENCE_KEYS, PREFERENCE_MAX, PREFERENCE_MIN, PREFERENCE_NEUTRAL } from "@/features/participant/participant";
import { parseTimeToMinutes } from "@/features/travel-state";
import type {
  CandidatePlace,
  ExperienceProfile,
  ItineraryItem,
  PreferenceKey,
  PreferenceVector,
  RiskLevel,
} from "@/types";

// ---------------------------------------------------------------------------
// Score scale + weights (§20/§21) — the single source of truth for every
// magic number this module uses.
// ---------------------------------------------------------------------------

export const SCORE_MIN = 0;
export const SCORE_MAX = 100;
/** The "no signal either way" value on the 0..100 scale for a two-sided component. */
export const NEUTRAL_COMPONENT_SCORE = 50;

/**
 * Positive-component weights sum to 0.90 -> the best a candidate can score
 * from the four positive components alone is 90, not 100 (100 would require
 * also being credited for travelBurden, which is purely a cost slot — see
 * `computeFinalScore`). travelBurden's weight (0.10) is only ever a
 * subtraction budget. Verified by a budget test in tests/scoring.test.ts.
 */
export const SCORING_WEIGHTS = {
  groupSatisfaction: 0.35,
  experiencePreservation: 0.25,
  situationFitness: 0.15,
  timeFitness: 0.15,
  travelBurden: 0.1,
} as const;

/** Below this participant score (0..100), the fairness safeguard kicks in. */
export const MIN_SATISFACTION_THRESHOLD = 60;
/** Penalty points per point of shortfall below the threshold — see computeMinimumSatisfactionPenalty. */
export const MIN_SATISFACTION_PENALTY_WEIGHT = 1.5;

export const SITUATION_FITNESS_WEATHER_BONUS = 30;
export const SITUATION_FITNESS_WEATHER_PENALTY = 30;
/** A route this long or longer counts as "장거리" for the traffic-situation penalty below — distinct from computeTravelBurden's precise duration-based cost. */
export const SITUATION_FITNESS_LONG_DISTANCE_METERS = 5_000;
export const SITUATION_FITNESS_TRAFFIC_PENALTY = 15;

export const TIME_FITNESS_BONUS = 30;
export const TIME_FITNESS_PENALTY = 40;
/** Minutes of slack remaining AFTER travel that counts as "comfortable". */
export const TIME_FITNESS_GENEROUS_SLACK_MINUTES = 60;

/** Real one-way duration at/above this is treated as maximum travel burden (100). */
export const TRAVEL_BURDEN_MAX_DURATION_MINUTES = 60;

/** How far a per-axis "relative emphasis" can push Experience Preservation before it clamps. */
export const EXPERIENCE_PRESERVATION_RANGE = 5;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round2 = (n: number) => Math.round(n * 100) / 100;
const rescale = (value: number, fromMin: number, fromMax: number, toMin: number, toMax: number) =>
  toMin + ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin);

// ---------------------------------------------------------------------------
// Category -> preference axis compatibility (reuses STEP 8's real mapping)
// ---------------------------------------------------------------------------

/**
 * Which PreferenceKey axes a TourAPI contentTypeId is tagged with — the exact
 * inverse of `PREFERENCE_TO_CONTENT_TYPE` (STEP 8), so scoring can never drift
 * out of sync with what Candidate Generation already decided a category means.
 * `[]` for an unmapped/unknown category — never guessed.
 */
export function categoryPreferenceAxes(category: number | null): PreferenceKey[] {
  if (category === null) return [];
  return PREFERENCE_KEYS.filter((k) => PREFERENCE_TO_CONTENT_TYPE[k].includes(category));
}

type Shelter = "indoor" | "outdoor" | "unknown";

const INDOOR_SET = new Set(INDOOR_CONTENT_TYPES);

function categoryShelter(category: number | null): Shelter {
  if (category === null) return "unknown";
  if (OUTDOOR_CONTENT_TYPES.includes(category)) return "outdoor";
  return INDOOR_SET.has(category) ? "indoor" : "unknown";
}

// ---------------------------------------------------------------------------
// 1. Group Satisfaction (individual-first, then aggregated)
// ---------------------------------------------------------------------------

// weight[axis] = preference[axis] - PREFERENCE_NEUTRAL; PREFERENCE_MIN=1, MAX=10, NEUTRAL=5
// -> weight range is [-4, +5], NOT symmetric (NEUTRAL isn't the scale's exact midpoint).
const PARTICIPANT_WEIGHT_MIN = PREFERENCE_MIN - PREFERENCE_NEUTRAL; // -4
const PARTICIPANT_WEIGHT_MAX = PREFERENCE_MAX - PREFERENCE_NEUTRAL; // +5

/**
 * One participant's compatibility with a candidate: the average of
 * (their preference - NEUTRAL) over the axes the candidate's category is
 * actually tagged with, rescaled to 0..100. A neutral preference on every hit
 * axis does NOT earn a large bonus (unlike using the raw 1..10 preference
 * directly would). `[]` hit axes (unmapped category) -> NEUTRAL_COMPONENT_SCORE,
 * never a guessed compatibility.
 */
export function computeParticipantScore(
  preference: PreferenceVector,
  category: number | null,
): number {
  const axes = categoryPreferenceAxes(category);
  if (axes.length === 0) return NEUTRAL_COMPONENT_SCORE;
  const avgWeight = mean(axes.map((k) => preference[k] - PREFERENCE_NEUTRAL));
  return round2(
    clamp(rescale(avgWeight, PARTICIPANT_WEIGHT_MIN, PARTICIPANT_WEIGHT_MAX, SCORE_MIN, SCORE_MAX), SCORE_MIN, SCORE_MAX),
  );
}

export interface GroupSatisfactionResult {
  participantScores: number[];
  groupSatisfaction: number | null;
  minimumParticipantSatisfaction: number | null;
}

/**
 * Individual scores FIRST, group aggregate (arithmetic mean) second — never
 * averaging raw preferences directly. `null` with 0 participants (no group to
 * average, not a fabricated neutral).
 */
export function computeGroupSatisfaction(
  preferenceVectors: readonly PreferenceVector[],
  category: number | null,
): GroupSatisfactionResult {
  if (preferenceVectors.length === 0) {
    return { participantScores: [], groupSatisfaction: null, minimumParticipantSatisfaction: null };
  }
  const participantScores = preferenceVectors.map((v) => computeParticipantScore(v, category));
  return {
    participantScores,
    groupSatisfaction: round2(mean(participantScores)),
    minimumParticipantSatisfaction: Math.min(...participantScores),
  };
}

// ---------------------------------------------------------------------------
// 2. Minimum Satisfaction Penalty — the core safeguard
// ---------------------------------------------------------------------------

/**
 * `null` (0 participants) -> 0, nothing to safeguard. Otherwise a shortfall
 * below MIN_SATISFACTION_THRESHOLD is penalized linearly — see the module
 * docstring and tests/scoring.test.ts for the worked [95,95,30] vs
 * [82,81,76] example this is built to catch.
 */
export function computeMinimumSatisfactionPenalty(minimumParticipantSatisfaction: number | null): number {
  if (minimumParticipantSatisfaction === null) return 0;
  return round2(
    Math.max(0, MIN_SATISFACTION_THRESHOLD - minimumParticipantSatisfaction) * MIN_SATISFACTION_PENALTY_WEIGHT,
  );
}

// ---------------------------------------------------------------------------
// 3. Experience Preservation
// ---------------------------------------------------------------------------

/**
 * How well a candidate serves what's DISTINCTIVELY important to this group —
 * each profile axis compared to the profile's OWN mean (not the fixed scale
 * neutral used by groupSatisfaction; see module docstring for why this avoids
 * double-counting). `null` when there's no profile at all (nothing to
 * preserve yet, STEP 6 returns null with 0 participants) — never a fabricated
 * neutral standing in for "we don't know what this group wants".
 * NEUTRAL_COMPONENT_SCORE for an unmapped category, same as groupSatisfaction.
 */
export function computeExperiencePreservation(
  profile: ExperienceProfile | null,
  category: number | null,
): number | null {
  if (!profile) return null;
  const axes = categoryPreferenceAxes(category);
  if (axes.length === 0) return NEUTRAL_COMPONENT_SCORE;
  const profileMean = mean(PREFERENCE_KEYS.map((k) => profile[k]));
  const avgRelative = clamp(
    mean(axes.map((k) => profile[k] - profileMean)),
    -EXPERIENCE_PRESERVATION_RANGE,
    EXPERIENCE_PRESERVATION_RANGE,
  );
  return round2(
    rescale(avgRelative, -EXPERIENCE_PRESERVATION_RANGE, EXPERIENCE_PRESERVATION_RANGE, SCORE_MIN, SCORE_MAX),
  );
}

// ---------------------------------------------------------------------------
// 4. Situation Fitness (real weather x category shelter, nothing else)
// ---------------------------------------------------------------------------

/**
 * Two independent real-data signals, each only firing on its own clear case:
 *  - weatherRisk "high": +bonus for an indoor-shelter category, -penalty for
 *    an outdoor one; low/medium/unknown weather, or an unknown-shelter
 *    category, contribute nothing — no guessing "probably outdoor".
 *  - trafficBurden "high" AND a REAL route distance beyond
 *    SITUATION_FITNESS_LONG_DISTANCE_METERS: a flat contextual penalty for a
 *    genuinely long trip on a congested day. This uses DISTANCE (not
 *    duration) specifically so it never re-derives the same number
 *    `computeTravelBurden` already charges via duration — see module
 *    docstring on avoiding double counting. No distance data -> no penalty
 *    (never assumes "long" without evidence).
 */
export function computeSituationFitness(
  weatherRisk: RiskLevel,
  trafficBurden: RiskLevel,
  category: number | null,
  routeDistanceMeters: number | null,
): number {
  let score = NEUTRAL_COMPONENT_SCORE;

  if (weatherRisk === "high") {
    const shelter = categoryShelter(category);
    if (shelter === "indoor") score += SITUATION_FITNESS_WEATHER_BONUS;
    else if (shelter === "outdoor") score -= SITUATION_FITNESS_WEATHER_PENALTY;
  }

  if (
    trafficBurden === "high" &&
    routeDistanceMeters !== null &&
    routeDistanceMeters >= SITUATION_FITNESS_LONG_DISTANCE_METERS
  ) {
    score -= SITUATION_FITNESS_TRAFFIC_PENALTY;
  }

  return clamp(score, SCORE_MIN, SCORE_MAX);
}

// ---------------------------------------------------------------------------
// 5. Time Fitness (real route duration only — never a guessed opening hour)
// ---------------------------------------------------------------------------

/**
 * Whether there's realistically enough time to get to the candidate before
 * the slot's originally-planned time. Requires a REAL `routeDurationSeconds`
 * (Kakao Mobility) — without one there is no feasibility judgement to make,
 * so this returns NEUTRAL_COMPONENT_SCORE rather than reasoning from the
 * schedule slack alone (which could imply a travel time that was never
 * measured). Never reads an opening-hour value — this project has none.
 */
export function computeTimeFitness(
  now: { date: string; time: string },
  slotTime: string,
  routeDurationSeconds: number | null,
): number {
  if (routeDurationSeconds === null) return NEUTRAL_COMPONENT_SCORE;
  const nowMin = parseTimeToMinutes(now.time);
  const slotMin = parseTimeToMinutes(slotTime);
  if (nowMin === null || slotMin === null) return NEUTRAL_COMPONENT_SCORE;

  const slackMinutes = slotMin - nowMin; // >= 0: STEP 8 only ever selects now-or-future slots
  const remainingAfterTravel = slackMinutes - routeDurationSeconds / 60;

  if (remainingAfterTravel < 0) {
    return clamp(NEUTRAL_COMPONENT_SCORE - TIME_FITNESS_PENALTY, SCORE_MIN, SCORE_MAX);
  }
  if (remainingAfterTravel >= TIME_FITNESS_GENEROUS_SLACK_MINUTES) {
    return clamp(NEUTRAL_COMPONENT_SCORE + TIME_FITNESS_BONUS, SCORE_MIN, SCORE_MAX);
  }
  const t = remainingAfterTravel / TIME_FITNESS_GENEROUS_SLACK_MINUTES;
  return round2(NEUTRAL_COMPONENT_SCORE - TIME_FITNESS_PENALTY + t * (TIME_FITNESS_BONUS + TIME_FITNESS_PENALTY));
}

// ---------------------------------------------------------------------------
// 6. Travel Burden (real distance/duration only — a one-sided cost)
// ---------------------------------------------------------------------------

/**
 * `null` (no real Kakao Mobility route) -> `null`, kept in the breakdown for
 * transparency; `computeFinalScore` treats a null burden as 0 (no *evidenced*
 * cost), never a mid-scale guess — an unmeasured trip is not "medium effort".
 * Uses duration only (not distance): for burden purposes the two are highly
 * correlated and duration is the more directly felt cost; distance would only
 * matter for a fare/cost estimate, out of scope here.
 */
export function computeTravelBurden(routeDurationSeconds: number | null): number | null {
  if (routeDurationSeconds === null) return null;
  const minutes = routeDurationSeconds / 60;
  return round2(clamp(rescale(minutes, 0, TRAVEL_BURDEN_MAX_DURATION_MINUTES, SCORE_MIN, SCORE_MAX), SCORE_MIN, SCORE_MAX));
}

// ---------------------------------------------------------------------------
// Final score
// ---------------------------------------------------------------------------

export interface FinalScoreInput {
  groupSatisfaction: number | null;
  experiencePreservation: number | null;
  situationFitness: number;
  timeFitness: number;
  travelBurden: number | null;
  minimumSatisfactionPenalty: number;
}

/**
 * positiveScore = weighted(groupSatisfaction, experiencePreservation,
 *   situationFitness, timeFitness) — two-sided unknowns fall back to
 *   NEUTRAL_COMPONENT_SCORE here (see module docstring).
 * negativeScore = weighted(travelBurden ?? 0) + minimumSatisfactionPenalty
 * finalScore = clamp(positiveScore - negativeScore, 0, 100)
 */
export function computeFinalScore(input: FinalScoreInput): number {
  const gs = input.groupSatisfaction ?? NEUTRAL_COMPONENT_SCORE;
  const ep = input.experiencePreservation ?? NEUTRAL_COMPONENT_SCORE;
  const tb = input.travelBurden ?? 0;

  const positiveScore =
    SCORING_WEIGHTS.groupSatisfaction * gs +
    SCORING_WEIGHTS.experiencePreservation * ep +
    SCORING_WEIGHTS.situationFitness * input.situationFitness +
    SCORING_WEIGHTS.timeFitness * input.timeFitness;

  const negativeScore = SCORING_WEIGHTS.travelBurden * tb + input.minimumSatisfactionPenalty;

  return round2(clamp(positiveScore - negativeScore, SCORE_MIN, SCORE_MAX));
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface ScoreCandidateInput {
  place: CandidatePlace;
  preferenceVectors: readonly PreferenceVector[];
  experienceProfile: ExperienceProfile | null;
  weatherRisk: RiskLevel;
  trafficBurden: RiskLevel;
  now: { date: string; time: string };
  /** the FLEXIBLE slot's originally-planned "HH:mm" — the reference point for Time Fitness. */
  slotTime: string;
  /** real Kakao Mobility duration to `place`, or `null` (no currentLocation / adapter failure) — never guessed. */
  routeDurationSeconds: number | null;
  /** real Kakao Mobility distance to `place`, or `null` — used only by Situation Fitness's traffic signal (see computeSituationFitness). */
  routeDistanceMeters: number | null;
}

export interface ScoreBreakdown {
  groupSatisfaction: number | null;
  experiencePreservation: number | null;
  situationFitness: number;
  timeFitness: number;
  travelBurden: number | null;
  minimumSatisfactionPenalty: number;
  finalScore: number;
  participantScores: number[];
  minimumParticipantSatisfaction: number | null;
}

/** Scores ONE candidate (or a "keep current" view built by `itemToCandidateView`). Pure, deterministic. */
export function scoreCandidate(input: ScoreCandidateInput): ScoreBreakdown {
  const category = input.place.category;
  const { participantScores, groupSatisfaction, minimumParticipantSatisfaction } = computeGroupSatisfaction(
    input.preferenceVectors,
    category,
  );
  const experiencePreservation = computeExperiencePreservation(input.experienceProfile, category);
  const situationFitness = computeSituationFitness(
    input.weatherRisk,
    input.trafficBurden,
    category,
    input.routeDistanceMeters,
  );
  const timeFitness = computeTimeFitness(input.now, input.slotTime, input.routeDurationSeconds);
  const travelBurden = computeTravelBurden(input.routeDurationSeconds);
  const minimumSatisfactionPenalty = computeMinimumSatisfactionPenalty(minimumParticipantSatisfaction);

  const finalScore = computeFinalScore({
    groupSatisfaction,
    experiencePreservation,
    situationFitness,
    timeFitness,
    travelBurden,
    minimumSatisfactionPenalty,
  });

  return {
    groupSatisfaction,
    experiencePreservation,
    situationFitness,
    timeFitness,
    travelBurden,
    minimumSatisfactionPenalty,
    finalScore,
    participantScores,
    minimumParticipantSatisfaction,
  };
}

// ---------------------------------------------------------------------------
// Keep Current — a comparable option, never mixed into CandidatePlace[]/SlotCandidates
// ---------------------------------------------------------------------------

/**
 * Views the CURRENTLY-PLANNED itinerary item as a `CandidatePlace`-shaped
 * input so it can run through the exact same `scoreCandidate` pipeline as any
 * real candidate — this does NOT write it into `SlotCandidates.candidates`
 * (STEP 8's contract is untouched; see `RankedOption` below for where the two
 * are compared). `ItineraryItem` never stored a TourAPI category, so
 * `category` is honestly `null` here — never inferred — which correctly
 * degrades the category-dependent components to their documented neutral
 * defaults, exactly like any other candidate with an unmapped category.
 */
export function itemToCandidateView(item: ItineraryItem): CandidatePlace {
  return {
    placeId: item.placeId,
    placeName: item.placeName,
    address: item.address,
    latitude: item.latitude,
    longitude: item.longitude,
    category: null,
    source: "tour-korservice",
    verificationStatus: item.placeConfirmed ? "verified" : "candidate",
    candidateReason: "현재 일정 유지",
  };
}

export type RankedOptionKind = "candidate" | "keepCurrent";

export interface RankedOption {
  kind: RankedOptionKind;
  place: CandidatePlace;
  breakdown: ScoreBreakdown;
  /**
   * The real Kakao Mobility metrics `breakdown.travelBurden`/`timeFitness`
   * were computed from (`null` when unavailable) — carried here PURELY as
   * metadata for STEP 11's explanation layer to cite an honest number
   * ("약 18분"). This does NOT change how `scoreCandidate` computes anything;
   * the scoring formula, weights, and thresholds are untouched (see STEP 9).
   */
  route: { durationSeconds: number; distanceMeters: number } | null;
}

/**
 * Deterministic ranking: finalScore desc, then travelBurden asc (unknown
 * treated as 0 for the tie-break only — untouched in the breakdown itself),
 * then placeId asc (missing sorts last), then placeName asc. Never depends on
 * input array order, Math.random, or Date.now.
 */
export function rankScored(entries: readonly RankedOption[]): RankedOption[] {
  return [...entries].sort((a, b) => {
    if (a.breakdown.finalScore !== b.breakdown.finalScore) {
      return b.breakdown.finalScore - a.breakdown.finalScore;
    }
    const burdenDiff = (a.breakdown.travelBurden ?? 0) - (b.breakdown.travelBurden ?? 0);
    if (burdenDiff !== 0) return burdenDiff;

    const aId = a.place.placeId;
    const bId = b.place.placeId;
    if (aId !== bId) {
      if (aId === null) return 1;
      if (bId === null) return -1;
      return aId < bId ? -1 : 1;
    }
    if (a.place.placeName !== b.place.placeName) {
      return a.place.placeName < b.place.placeName ? -1 : 1;
    }
    return 0;
  });
}
