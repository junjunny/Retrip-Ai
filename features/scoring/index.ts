/**
 * features/scoring — Deterministic Scoring (STEP 9): "which of STEP 8's
 * real candidates (and 'keep current') best fits this group, right now" — a
 * ranking, NOT a recommendation UI, NOT Re:Plan. See ./scoring for the six
 * components, their weights, and the minimum-satisfaction safeguard.
 *
 * Everything here is pure and browser-safe. The server-only
 * `scoreTripCandidates` (Firestore + STEP 8 + Kakao Mobility) lives in
 * `./scoringService` and must be imported from there directly, never
 * re-exported here.
 */
export {
  EXPERIENCE_PRESERVATION_RANGE,
  MIN_SATISFACTION_PENALTY_WEIGHT,
  MIN_SATISFACTION_THRESHOLD,
  NEUTRAL_COMPONENT_SCORE,
  SCORE_MAX,
  SCORE_MIN,
  SCORING_WEIGHTS,
  SITUATION_FITNESS_LONG_DISTANCE_METERS,
  SITUATION_FITNESS_TRAFFIC_PENALTY,
  SITUATION_FITNESS_WEATHER_BONUS,
  SITUATION_FITNESS_WEATHER_PENALTY,
  TIME_FITNESS_BONUS,
  TIME_FITNESS_GENEROUS_SLACK_MINUTES,
  TIME_FITNESS_PENALTY,
  TRAVEL_BURDEN_MAX_DURATION_MINUTES,
  categoryPreferenceAxes,
  computeExperiencePreservation,
  computeFinalScore,
  computeGroupSatisfaction,
  computeMinimumSatisfactionPenalty,
  computeParticipantScore,
  computeSituationFitness,
  computeTimeFitness,
  computeTravelBurden,
  itemToCandidateView,
  rankScored,
  scoreCandidate,
} from "./scoring";
export type {
  FinalScoreInput,
  GroupSatisfactionResult,
  RankedOption,
  RankedOptionKind,
  ScoreBreakdown,
  ScoreCandidateInput,
} from "./scoring";
