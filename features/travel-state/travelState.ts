/**
 * features/travel-state — pure Travel State calculators (STEP 7).
 *
 * Travel State answers "what's actually happening against the plan right now",
 * NOT "what does the group want" (that's Experience Profile, STEP 6) and NOT a
 * recommendation/score/Re:Plan (those are STEP 8-10). Nothing here reads a
 * clock, calls an API, touches Firestore, or picks a random number — every
 * function takes already-normalized data and returns a value, so the same
 * input always produces the same output. I/O and clock-reading live in
 * `./travelStateService`.
 */
import { PREFERENCE_KEYS } from "@/features/participant/participant";
import type {
  ExperienceProfile,
  IndoorOutdoor,
  ItineraryItem,
  PreferenceKey,
  PreferenceVector,
  RiskLevel,
  RouteData,
  TravelState,
  TravelStateStatus,
  WeatherData,
} from "@/types";

const round2 = (n: number) => Math.round(n * 100) / 100;

function parseTimeToMinutes(time: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

/**
 * The earliest not-yet-completed item scheduled for `nowDate` — "what should
 * be happening now or next". Other dates and completed items never count.
 */
export function pickNextPendingItem(
  itinerary: readonly ItineraryItem[],
  nowDate: string,
): ItineraryItem | null {
  const pending = itinerary
    .filter((it) => it.date === nowDate && it.status !== "completed")
    .map((it) => ({ it, min: parseTimeToMinutes(it.time) }))
    .filter((x): x is { it: ItineraryItem; min: number } => x.min !== null)
    .sort((a, b) => a.min - b.min);
  return pending[0]?.it ?? null;
}

/**
 * Minutes behind `pickNextPendingItem`'s scheduled time; 0 if that item is
 * still in the future (never negative); null when there's no such item today.
 */
export function computeScheduleDelayMinutes(
  itinerary: readonly ItineraryItem[],
  nowDate: string,
  nowTime: string,
): number | null {
  const nowMin = parseTimeToMinutes(nowTime);
  if (nowMin === null) return null;
  const next = pickNextPendingItem(itinerary, nowDate);
  if (!next) return null;
  const nextMin = parseTimeToMinutes(next.time);
  if (nextMin === null) return null;
  return Math.max(0, nowMin - nextMin);
}

/**
 * Minutes from `nowTime` to the LAST item scheduled for `nowDate` (any
 * status) — the remaining window of the day's plan, not "free time"; 0 once
 * `now` is past it; null when there are no items today.
 */
export function computeRemainingScheduleMinutes(
  itinerary: readonly ItineraryItem[],
  nowDate: string,
  nowTime: string,
): number | null {
  const nowMin = parseTimeToMinutes(nowTime);
  if (nowMin === null) return null;
  const todayMinutes = itinerary
    .filter((it) => it.date === nowDate)
    .map((it) => parseTimeToMinutes(it.time))
    .filter((m): m is number => m !== null);
  if (todayMinutes.length === 0) return null;
  return Math.max(0, Math.max(...todayMinutes) - nowMin);
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

/** KMA PTY codes that mean actual precipitation is falling (0 = 없음 is excluded). */
const PRECIPITATION_CODES = new Set([1, 2, 3, 4]);

type BaseSeverity = Exclude<RiskLevel, "unknown">;

/** Raw-weather severity, before any indoor/outdoor adjustment. */
function baseWeatherSeverity(weather: WeatherData): BaseSeverity {
  if (weather.precipitationType !== null && PRECIPITATION_CODES.has(weather.precipitationType)) {
    return "high";
  }
  if ((weather.precipitationProbability ?? 0) >= 60 || weather.skyCondition === 4) {
    return "medium";
  }
  return "low";
}

const INDOOR_DOWNGRADE: Record<BaseSeverity, BaseSeverity> = {
  high: "medium",
  medium: "low",
  low: "low",
};

/**
 * `weather` null -> "unknown" (no forecast fetched/available — never a guess).
 * Otherwise the raw forecast severity, softened one step for an indoor item
 * (walls block rain) and left as-is for outdoor/unknown context — we can only
 * discount risk when we're sure shelter exists, never amplify on a guess.
 */
export function computeWeatherRisk(
  weather: WeatherData | null,
  indoorOutdoor: IndoorOutdoor | "unknown",
): { level: RiskLevel; reason: string } {
  if (!weather) return { level: "unknown", reason: "예보 데이터 없음" };
  const base = baseWeatherSeverity(weather);
  if (indoorOutdoor === "indoor") {
    return { level: INDOOR_DOWNGRADE[base], reason: `실내 일정 — 기상 심각도(${base})를 한 단계 완화` };
  }
  if (indoorOutdoor === "outdoor") {
    return { level: base, reason: `야외 일정 — 기상 심각도 ${base}` };
  }
  return { level: base, reason: `실내/야외 정보 없음 — 기상 심각도 ${base} 그대로 사용` };
}

// ---------------------------------------------------------------------------
// Traffic
// ---------------------------------------------------------------------------

/**
 * Kakao Mobility's per-road `traffic_state` code (see types/external.ts
 * RouteData) — 0 정보없음, 1 원활, 2 서행, 3 지체, 4 정체. The adapter has no
 * free-flow/baseline duration field, so "actual vs. baseline" isn't possible;
 * this normalizes the worst REAL congestion code observed on the route instead
 * of inventing a baseline.
 */
const TRAFFIC_STATE_LEVEL: Record<number, RiskLevel> = {
  1: "low",
  2: "medium",
  3: "high",
  4: "high",
};

export function computeTrafficBurden(route: RouteData | null): { level: RiskLevel; reason: string } {
  if (!route) return { level: "unknown", reason: "경로 데이터 없음" };
  const codes = route.trafficSegments
    .map((s) => s.trafficState)
    .filter((c): c is number => c !== null && c !== 0);
  if (codes.length === 0) return { level: "unknown", reason: "구간별 혼잡도 정보 없음" };
  const worst = Math.max(...codes);
  return { level: TRAFFIC_STATE_LEVEL[worst] ?? "unknown", reason: `구간 최대 혼잡도 코드 ${worst}` };
}

// ---------------------------------------------------------------------------
// Experience deviation
// ---------------------------------------------------------------------------

/**
 * Total-variation distance (0..1) between the group's Experience Profile
 * (normalized to a distribution) and the category mix of items actually
 * marked "completed" (also normalized). 0 = the group has been doing exactly
 * what it said it valued; 1 = the opposite.
 *
 * `null` whenever either input is missing — this project does not track which
 * PreferenceKey a completed item belongs to yet (no visit-category tracking),
 * so in production `completedCategoryCounts` is always null today and this
 * always returns null. The math is implemented now so it's ready the moment
 * that tracking exists, and so it's independently testable.
 */
export function computeExperienceDeviation(
  profile: ExperienceProfile | null,
  completedCategoryCounts: Partial<Record<PreferenceKey, number>> | null,
): number | null {
  if (!profile || !completedCategoryCounts) return null;

  const total = PREFERENCE_KEYS.reduce(
    (sum, k) => sum + Math.max(0, completedCategoryCounts[k] ?? 0),
    0,
  );
  if (total === 0) return null;

  const profileTotal = PREFERENCE_KEYS.reduce((sum, k) => sum + profile[k], 0);
  if (profileTotal === 0) return null; // degenerate all-zero profile — nothing to compare against

  let deviation = 0;
  for (const k of PREFERENCE_KEYS) {
    const actualShare = Math.max(0, completedCategoryCounts[k] ?? 0) / total;
    const intendedShare = profile[k] / profileTotal;
    deviation += Math.abs(actualShare - intendedShare);
  }
  return round2(deviation / 2);
}

// ---------------------------------------------------------------------------
// Preference disagreement (NOT scoring, NOT fairness — just a spread signal)
// ---------------------------------------------------------------------------

/**
 * Root-mean-square of each axis's population standard deviation across the
 * group's preference vectors — 0 means everyone answered identically, larger
 * means more spread. `null` with 0 or 1 participants (no disagreement is
 * defined). This is a plain statistical spread measure — it is NOT a fairness
 * penalty and does NOT decide who "wins" (that's STEP 9's job, out of scope
 * here).
 */
export function computePreferenceDisagreement(
  vectors: readonly PreferenceVector[],
): number | null {
  if (vectors.length <= 1) return null;
  const n = vectors.length;
  let sumVariance = 0;
  for (const k of PREFERENCE_KEYS) {
    const mean = vectors.reduce((sum, v) => sum + v[k], 0) / n;
    const variance = vectors.reduce((sum, v) => sum + (v[k] - mean) ** 2, 0) / n;
    sumVariance += variance;
  }
  return round2(Math.sqrt(sumVariance / PREFERENCE_KEYS.length));
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Deterministic thresholds behind `computeTravelStateStatus` — one place, no
 * numbers hardcoded elsewhere. Deliberately simple boolean rules, not a
 * weighted score (scoring is STEP 9's job).
 */
export const TRAVEL_STATE_THRESHOLDS = {
  scheduleDelayWatchMinutes: 15,
  scheduleDelayInterventionMinutes: 45,
  /** total-variation distance, 0..1 (see computeExperienceDeviation) */
  experienceDeviationWatch: 0.5,
  /** RMS of per-axis stdev on the 1..10 scale (see computePreferenceDisagreement) */
  preferenceDisagreementWatch: 2.5,
} as const;

/**
 * Internal-only status. NEVER shown to the user; NEVER triggers an automatic
 * itinerary change, alert, or Re:Plan run on its own — only a future
 * user-triggered Re:Plan (STEP 10) may read it.
 */
export function computeTravelStateStatus(input: {
  scheduleDelayMinutes: number | null;
  weatherRisk: RiskLevel;
  trafficBurden: RiskLevel;
  experienceDeviation: number | null;
  preferenceDisagreement: number | null;
}): TravelStateStatus {
  const t = TRAVEL_STATE_THRESHOLDS;

  const severeDelay =
    input.scheduleDelayMinutes !== null &&
    input.scheduleDelayMinutes >= t.scheduleDelayInterventionMinutes;
  if (severeDelay || (input.weatherRisk === "high" && input.trafficBurden === "high")) {
    return "INTERVENTION";
  }

  const watchDelay =
    input.scheduleDelayMinutes !== null &&
    input.scheduleDelayMinutes >= t.scheduleDelayWatchMinutes;
  const watchDeviation =
    input.experienceDeviation !== null && input.experienceDeviation >= t.experienceDeviationWatch;
  const watchDisagreement =
    input.preferenceDisagreement !== null &&
    input.preferenceDisagreement >= t.preferenceDisagreementWatch;

  if (
    watchDelay ||
    input.weatherRisk === "high" ||
    input.trafficBurden === "high" ||
    watchDeviation ||
    watchDisagreement
  ) {
    return "WATCH";
  }

  return "NORMAL";
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface TravelStateInput {
  tripId: string;
  /** plain "YYYY-MM-DD"/"HH:mm" (KST) — see travelStateService for how a real Date becomes this. */
  now: { date: string; time: string };
  itinerary: readonly ItineraryItem[];
  weather: WeatherData | null;
  weatherContext: { indoorOutdoor: IndoorOutdoor | "unknown" };
  route: RouteData | null;
  experienceProfile: ExperienceProfile | null;
  completedCategoryCounts: Partial<Record<PreferenceKey, number>> | null;
  preferenceVectors: readonly PreferenceVector[];
}

/** Assembles every metric above into one `TravelState` snapshot. Pure. */
export function buildTravelState(input: TravelStateInput): TravelState {
  const scheduleDelayMinutes = computeScheduleDelayMinutes(input.itinerary, input.now.date, input.now.time);
  const remainingScheduleMinutes = computeRemainingScheduleMinutes(
    input.itinerary,
    input.now.date,
    input.now.time,
  );
  const weather = computeWeatherRisk(input.weather, input.weatherContext.indoorOutdoor);
  const traffic = computeTrafficBurden(input.route);
  const experienceDeviation = computeExperienceDeviation(
    input.experienceProfile,
    input.completedCategoryCounts,
  );
  const preferenceDisagreement = computePreferenceDisagreement(input.preferenceVectors);

  const status = computeTravelStateStatus({
    scheduleDelayMinutes,
    weatherRisk: weather.level,
    trafficBurden: traffic.level,
    experienceDeviation,
    preferenceDisagreement,
  });

  return {
    tripId: input.tripId,
    now: input.now,
    scheduleDelayMinutes,
    remainingScheduleMinutes,
    weatherRisk: weather.level,
    weatherRiskReason: weather.reason,
    trafficBurden: traffic.level,
    trafficBurdenReason: traffic.reason,
    experienceDeviation,
    preferenceDisagreement,
    status,
  };
}
