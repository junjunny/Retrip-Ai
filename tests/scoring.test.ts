/**
 * STEP 9 — Deterministic Scoring (hermetic). No Firestore, no network, no
 * Date.now(): every `now` is injected. See features/scoring/scoring.ts for
 * the six-component formula this exercises.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MIN_SATISFACTION_PENALTY_WEIGHT,
  MIN_SATISFACTION_THRESHOLD,
  NEUTRAL_COMPONENT_SCORE,
  SCORE_MAX,
  SCORE_MIN,
  SCORING_WEIGHTS,
  SITUATION_FITNESS_LONG_DISTANCE_METERS,
  TIME_FITNESS_GENEROUS_SLACK_MINUTES,
  TRAVEL_BURDEN_MAX_DURATION_MINUTES,
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
  type RankedOption,
  type ScoreCandidateInput,
} from "@/features/scoring";
import { defaultPreferenceVector } from "@/features/participant/participant";
import type { CandidatePlace, ExperienceProfile, ItineraryItem, PreferenceVector } from "@/types";

const vec = (over: Partial<PreferenceVector> = {}): PreferenceVector => ({
  ...defaultPreferenceVector(),
  ...over,
});

const place = (over: Partial<CandidatePlace> = {}): CandidatePlace => ({
  placeId: "tour:1",
  placeName: "해운대해수욕장",
  address: null,
  latitude: 35.16,
  longitude: 129.16,
  category: 12,
  source: "tour-korservice",
  verificationStatus: "verified",
  candidateReason: "",
  ...over,
});

const item = (over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  order: 1,
  date: "2026-10-01",
  time: "12:00",
  placeId: null,
  placeName: "기존 일정",
  address: null,
  latitude: null,
  longitude: null,
  scheduleType: "flexible",
  status: "planned",
  placeConfirmed: false,
  ...over,
});

const baseInput = (over: Partial<ScoreCandidateInput> = {}): ScoreCandidateInput => ({
  place: place(),
  preferenceVectors: [vec()],
  experienceProfile: defaultPreferenceVector(),
  weatherRisk: "unknown",
  trafficBurden: "unknown",
  now: { date: "2026-10-01", time: "10:00" },
  slotTime: "12:00",
  routeDurationSeconds: null,
  routeDistanceMeters: null,
  ...over,
});

// ===========================================================================
// A. Basic scoring
// ===========================================================================
describe("A. basic scoring", () => {
  it("computes a full breakdown with a final score in [0,100]", () => {
    const b = scoreCandidate(baseInput());
    expect(b.finalScore).toBeGreaterThanOrEqual(SCORE_MIN);
    expect(b.finalScore).toBeLessThanOrEqual(SCORE_MAX);
  });

  it("every 0..100 component stays within range across a spread of inputs", () => {
    const inputs = [
      baseInput({ weatherRisk: "high", place: place({ category: 39 }) }),
      baseInput({ weatherRisk: "high", place: place({ category: 12 }) }),
      baseInput({ trafficBurden: "high", routeDistanceMeters: 20_000 }),
      baseInput({ routeDurationSeconds: 7200, routeDistanceMeters: 50_000 }),
      baseInput({ preferenceVectors: [vec({ nature: 1 }), vec({ nature: 10 })] }),
      baseInput({ experienceProfile: null }),
      baseInput({ preferenceVectors: [] }),
    ];
    for (const b of inputs.map(scoreCandidate)) {
      for (const v of [b.groupSatisfaction, b.experiencePreservation, b.situationFitness, b.timeFitness, b.travelBurden]) {
        if (v !== null) {
          expect(v).toBeGreaterThanOrEqual(SCORE_MIN);
          expect(v).toBeLessThanOrEqual(SCORE_MAX);
        }
      }
      expect(b.finalScore).toBeGreaterThanOrEqual(SCORE_MIN);
      expect(b.finalScore).toBeLessThanOrEqual(SCORE_MAX);
    }
  });

  it("weight budget: positive components sum to 90 (travelBurden's 10 is a subtraction-only slot)", () => {
    const sum = SCORING_WEIGHTS.groupSatisfaction + SCORING_WEIGHTS.experiencePreservation + SCORING_WEIGHTS.situationFitness + SCORING_WEIGHTS.timeFitness;
    expect(sum).toBeCloseTo(0.9, 10);
    expect(SCORING_WEIGHTS.travelBurden).toBeCloseTo(0.1, 10);
    // best case: every positive component maxed, no burden, no penalty
    expect(
      computeFinalScore({
        groupSatisfaction: 100,
        experiencePreservation: 100,
        situationFitness: 100,
        timeFitness: 100,
        travelBurden: 0,
        minimumSatisfactionPenalty: 0,
      }),
    ).toBe(90);
    // worst case: everything 0, full travel burden -> clamped at 0, never negative
    expect(
      computeFinalScore({
        groupSatisfaction: 0,
        experiencePreservation: 0,
        situationFitness: 0,
        timeFitness: 0,
        travelBurden: 100,
        minimumSatisfactionPenalty: 0,
      }),
    ).toBe(0);
  });
});

// ===========================================================================
// B. Group Satisfaction
// ===========================================================================
describe("B. Group Satisfaction", () => {
  it("a participant who rates the candidate's axes higher scores that candidate higher", () => {
    const low = computeParticipantScore(vec({ nature: 1 }), 12); // nature is one of category 12's axes
    const high = computeParticipantScore(vec({ nature: 10 }), 12);
    expect(high).toBeGreaterThan(low);
  });

  it("identical inputs -> identical outputs", () => {
    const a = computeParticipantScore(vec({ food: 8 }), 39);
    const b = computeParticipantScore(vec({ food: 8 }), 39);
    expect(a).toBe(b);
  });

  it("an unmapped/unknown category never fabricates a compatibility signal", () => {
    expect(computeParticipantScore(vec({ nature: 10 }), null)).toBe(NEUTRAL_COMPONENT_SCORE);
  });

  it("aggregate changes correctly as the group grows", () => {
    const one = computeGroupSatisfaction([vec({ food: 10 })], 39);
    const two = computeGroupSatisfaction([vec({ food: 10 }), vec({ food: 1 })], 39);
    expect(one.groupSatisfaction).not.toBeNull();
    expect(two.groupSatisfaction!).toBeLessThan(one.groupSatisfaction!);
    expect(two.participantScores).toHaveLength(2);
  });

  it("0 participants -> null, never a fabricated neutral", () => {
    const r = computeGroupSatisfaction([], 39);
    expect(r.groupSatisfaction).toBeNull();
    expect(r.minimumParticipantSatisfaction).toBeNull();
    expect(r.participantScores).toEqual([]);
  });
});

// ===========================================================================
// C. Minimum Satisfaction safeguard — the core differentiator
// ===========================================================================
describe("C. Minimum Satisfaction safeguard", () => {
  it("Case A [95,95,30] is penalized; Case B [82,81,76] is not", () => {
    const penaltyA = computeMinimumSatisfactionPenalty(Math.min(95, 95, 30));
    const penaltyB = computeMinimumSatisfactionPenalty(Math.min(82, 81, 76));
    expect(penaltyA).toBeGreaterThan(0);
    expect(penaltyB).toBe(0);
    expect(penaltyA).toBe(round((MIN_SATISFACTION_THRESHOLD - 30) * MIN_SATISFACTION_PENALTY_WEIGHT));
  });

  it("a same-average candidate that sacrifices one participant scores WORSE than a balanced one ([95,95,30] vs [82,81,76])", () => {
    const scoreA = computeFinalScore({
      groupSatisfaction: mean([95, 95, 30]),
      experiencePreservation: NEUTRAL_COMPONENT_SCORE,
      situationFitness: NEUTRAL_COMPONENT_SCORE,
      timeFitness: NEUTRAL_COMPONENT_SCORE,
      travelBurden: 0,
      minimumSatisfactionPenalty: computeMinimumSatisfactionPenalty(30),
    });
    const scoreB = computeFinalScore({
      groupSatisfaction: mean([82, 81, 76]),
      experiencePreservation: NEUTRAL_COMPONENT_SCORE,
      situationFitness: NEUTRAL_COMPONENT_SCORE,
      timeFitness: NEUTRAL_COMPONENT_SCORE,
      travelBurden: 0,
      minimumSatisfactionPenalty: computeMinimumSatisfactionPenalty(76),
    });
    expect(scoreB).toBeGreaterThan(scoreA);
    expect(scoreB - scoreA).toBeGreaterThan(20); // the safeguard visibly flips the outcome, not a rounding blip
  });

  it("second worked example: [98,98,35] (avg 77) still loses to [84,83,80] (avg 82.3)", () => {
    const scoreA = computeFinalScore({
      groupSatisfaction: mean([98, 98, 35]),
      experiencePreservation: NEUTRAL_COMPONENT_SCORE,
      situationFitness: NEUTRAL_COMPONENT_SCORE,
      timeFitness: NEUTRAL_COMPONENT_SCORE,
      travelBurden: 0,
      minimumSatisfactionPenalty: computeMinimumSatisfactionPenalty(35),
    });
    const scoreB = computeFinalScore({
      groupSatisfaction: mean([84, 83, 80]),
      experiencePreservation: NEUTRAL_COMPONENT_SCORE,
      situationFitness: NEUTRAL_COMPONENT_SCORE,
      timeFitness: NEUTRAL_COMPONENT_SCORE,
      travelBurden: 0,
      minimumSatisfactionPenalty: computeMinimumSatisfactionPenalty(80),
    });
    expect(scoreB).toBeGreaterThan(scoreA);
  });

  it("a single very-low participant increases the penalty vs. everyone being similarly high", () => {
    const sacrifice = computeMinimumSatisfactionPenalty(Math.min(...[95, 95, 20]));
    const balanced = computeMinimumSatisfactionPenalty(Math.min(...[88, 90, 85]));
    expect(sacrifice).toBeGreaterThan(balanced);
    expect(balanced).toBe(0);
  });

  it("threshold boundary: exactly at MIN_SATISFACTION_THRESHOLD -> 0 penalty; one point under -> positive", () => {
    expect(computeMinimumSatisfactionPenalty(MIN_SATISFACTION_THRESHOLD)).toBe(0);
    expect(computeMinimumSatisfactionPenalty(MIN_SATISFACTION_THRESHOLD - 1)).toBeGreaterThan(0);
  });

  it("0 participants -> 0 penalty (nothing to safeguard)", () => {
    expect(computeMinimumSatisfactionPenalty(null)).toBe(0);
  });
});

// ===========================================================================
// D. Experience Preservation
// ===========================================================================
describe("D. Experience Preservation", () => {
  it("a candidate matching the group's distinctive axes scores higher than one that doesn't", () => {
    const profile: ExperienceProfile = { ...defaultPreferenceVector(), nature: 10, photo: 10 };
    const matching = computeExperiencePreservation(profile, 12); // nature/photo/relax
    const opposite = computeExperiencePreservation(profile, 38); // shopping only, at neutral in this profile
    expect(matching!).toBeGreaterThan(opposite!);
  });

  it("profile null -> null, graceful degradation, never a fabricated neutral", () => {
    expect(computeExperiencePreservation(null, 12)).toBeNull();
  });

  it("an unmapped category -> neutral, not a guess", () => {
    const profile: ExperienceProfile = { ...defaultPreferenceVector(), nature: 10 };
    expect(computeExperiencePreservation(profile, null)).toBe(NEUTRAL_COMPONENT_SCORE);
  });

  it("is NOT the same computation as Group Satisfaction (different anchor, different result in general)", () => {
    const singleParticipant = vec({ nature: 9, photo: 2, culture: 7 });
    const profile: ExperienceProfile = singleParticipant; // same numbers, group-of-one
    const gs = computeParticipantScore(singleParticipant, 12);
    const ep = computeExperiencePreservation(profile, 12)!;
    expect(ep).not.toBeCloseTo(gs, 5);
  });
});

// ===========================================================================
// E. Situation Fitness — weather
// ===========================================================================
describe("E. Situation Fitness — weather", () => {
  it("high weather risk + indoor category -> above neutral", () => {
    expect(computeSituationFitness("high", "unknown", 39, null)).toBeGreaterThan(NEUTRAL_COMPONENT_SCORE);
  });
  it("high weather risk + outdoor category -> below neutral", () => {
    expect(computeSituationFitness("high", "unknown", 12, null)).toBeLessThan(NEUTRAL_COMPONENT_SCORE);
  });
  it("normal (low/medium) weather -> neutral regardless of category", () => {
    expect(computeSituationFitness("low", "unknown", 12, null)).toBe(NEUTRAL_COMPONENT_SCORE);
    expect(computeSituationFitness("medium", "unknown", 39, null)).toBe(NEUTRAL_COMPONENT_SCORE);
  });
  it("unknown weather -> neutral, never a guess", () => {
    expect(computeSituationFitness("unknown", "unknown", 12, null)).toBe(NEUTRAL_COMPONENT_SCORE);
  });
});

// ===========================================================================
// F. Situation Fitness — traffic (distinct signal from Travel Burden)
// ===========================================================================
describe("F. Situation Fitness — traffic", () => {
  it("high traffic + a genuinely long real route -> below neutral", () => {
    expect(
      computeSituationFitness("low", "high", 12, SITUATION_FITNESS_LONG_DISTANCE_METERS + 1),
    ).toBeLessThan(NEUTRAL_COMPONENT_SCORE);
  });
  it("normal traffic -> no traffic-based adjustment", () => {
    expect(computeSituationFitness("low", "low", 12, 20_000)).toBe(NEUTRAL_COMPONENT_SCORE);
    expect(computeSituationFitness("low", "medium", 12, 20_000)).toBe(NEUTRAL_COMPONENT_SCORE);
  });
  it("unknown traffic, or high traffic with no distance evidence -> no penalty (never assumes 'long')", () => {
    expect(computeSituationFitness("low", "unknown", 12, 20_000)).toBe(NEUTRAL_COMPONENT_SCORE);
    expect(computeSituationFitness("low", "high", 12, null)).toBe(NEUTRAL_COMPONENT_SCORE);
    expect(computeSituationFitness("low", "high", 12, 100)).toBe(NEUTRAL_COMPONENT_SCORE); // short trip, not "long"
  });
});

// ===========================================================================
// G. Time Fitness
// ===========================================================================
describe("G. Time Fitness", () => {
  it("ample time after travel -> above neutral", () => {
    const f = computeTimeFitness({ date: "d", time: "10:00" }, "13:00", 600); // 180min slack, 10min travel
    expect(f).toBeGreaterThan(NEUTRAL_COMPONENT_SCORE);
  });
  it("travel makes the slot unreachable -> below neutral", () => {
    const f = computeTimeFitness({ date: "d", time: "11:50" }, "12:00", 1200); // 10min slack, 20min travel
    expect(f).toBeLessThan(NEUTRAL_COMPONENT_SCORE);
  });
  it("no real route duration -> neutral, never inferred from schedule slack alone", () => {
    expect(computeTimeFitness({ date: "d", time: "10:00" }, "22:00", null)).toBe(NEUTRAL_COMPONENT_SCORE);
    expect(computeTimeFitness({ date: "d", time: "11:59" }, "12:00", null)).toBe(NEUTRAL_COMPONENT_SCORE);
  });
  it("interpolates smoothly between the tight and generous bounds", () => {
    const halfway = computeTimeFitness(
      { date: "d", time: "10:00" },
      "10:40",
      (40 - TIME_FITNESS_GENEROUS_SLACK_MINUTES / 2) * 60,
    );
    expect(halfway).toBeGreaterThan(NEUTRAL_COMPONENT_SCORE - 40);
    expect(halfway).toBeLessThan(NEUTRAL_COMPONENT_SCORE + 30);
  });
});

// ===========================================================================
// H. Travel Burden
// ===========================================================================
describe("H. Travel Burden", () => {
  it("a short real route is low burden; a long one is high burden", () => {
    expect(computeTravelBurden(300)).toBeLessThan(computeTravelBurden(3000)!);
  });
  it("route unavailable -> null, never a fabricated burden", () => {
    expect(computeTravelBurden(null)).toBeNull();
  });
  it("duration at/above the max threshold clamps to 100, never over", () => {
    expect(computeTravelBurden(TRAVEL_BURDEN_MAX_DURATION_MINUTES * 60)).toBe(100);
    expect(computeTravelBurden(TRAVEL_BURDEN_MAX_DURATION_MINUTES * 60 * 5)).toBe(100);
  });
  it("zero duration -> zero burden", () => {
    expect(computeTravelBurden(0)).toBe(0);
  });
});

// ===========================================================================
// I. Keep Current
// ===========================================================================
describe("I. Keep Current", () => {
  it("keepCurrent and real candidates are compared in the same ranking pipeline", () => {
    const keep = itemToCandidateView(item({ placeName: "현재 장소" }));
    const entries: RankedOption[] = [
      { kind: "candidate", place: place({ placeId: "tour:a" }), breakdown: scoreCandidate(baseInput({ place: place({ placeId: "tour:a" }) })), route: null },
      { kind: "keepCurrent", place: keep, breakdown: scoreCandidate(baseInput({ place: keep })), route: null },
    ];
    const ranked = rankScored(entries);
    expect(ranked.map((r) => r.kind).sort()).toEqual(["candidate", "keepCurrent"]);
  });

  it("keepCurrent with no metadata never gets a fake score — category unknown, route unknown -> neutral/null exactly like any other under-specified candidate", () => {
    const keep = itemToCandidateView(item({ placeId: null, placeName: "미확정 장소", latitude: null, longitude: null }));
    expect(keep.category).toBeNull();
    const b = scoreCandidate(baseInput({ place: keep, routeDurationSeconds: null, routeDistanceMeters: null }));
    expect(b.travelBurden).toBeNull();
    expect(b.timeFitness).toBe(NEUTRAL_COMPONENT_SCORE);
  });

  it("keepCurrent is never written into a CandidatePlace/SlotCandidates-shaped array — it's its own RankedOption kind", () => {
    const keep = itemToCandidateView(item());
    expect("keepCurrent" in keep).toBe(false);
  });
});

// ===========================================================================
// J. Determinism
// ===========================================================================
describe("J. Determinism", () => {
  it("identical scoreCandidate input -> identical breakdown, run twice", () => {
    const input = baseInput({ weatherRisk: "high", routeDurationSeconds: 900, routeDistanceMeters: 8000 });
    expect(scoreCandidate(input)).toEqual(scoreCandidate(input));
  });

  it("identical entries -> identical ranking, run twice", () => {
    const entries: RankedOption[] = [place({ placeId: "a" }), place({ placeId: "b" }), place({ placeId: "c" })].map((p) => ({
      kind: "candidate",
      place: p,
      breakdown: scoreCandidate(baseInput({ place: p })),
      route: null,
    }));
    expect(rankScored(entries)).toEqual(rankScored(entries));
  });
});

// ===========================================================================
// K. Tie-break
// ===========================================================================
describe("K. Tie-break", () => {
  const scored = (p: CandidatePlace, burdenOverride?: number | null): RankedOption => ({
    kind: "candidate",
    place: p,
    breakdown: { ...scoreCandidate(baseInput({ place: p })), travelBurden: burdenOverride ?? null },
    route: null,
  });

  it("equal finalScore -> lower travelBurden wins", () => {
    const a = scored(place({ placeId: "a" }), 40);
    const b = scored(place({ placeId: "b" }), 10);
    // force equal finalScore for a clean isolated tie-break test
    a.breakdown.finalScore = 50;
    b.breakdown.finalScore = 50;
    expect(rankScored([a, b]).map((r) => r.place.placeId)).toEqual(["b", "a"]);
  });

  it("equal finalScore + burden -> placeId ascending, missing placeId sorts last", () => {
    const a = scored(place({ placeId: "z" }), 5);
    const b = scored(place({ placeId: "a" }), 5);
    const c = scored(place({ placeId: null, placeName: "noId" }), 5);
    for (const e of [a, b, c]) e.breakdown.finalScore = 50;
    expect(rankScored([a, b, c]).map((r) => r.place.placeId)).toEqual(["a", "z", null]);
  });

  it("stable placeName ordering is always deterministic", () => {
    const a = scored(place({ placeId: null, placeName: "나" }), 5);
    const b = scored(place({ placeId: null, placeName: "가" }), 5);
    for (const e of [a, b]) e.breakdown.finalScore = 50;
    expect(rankScored([a, b]).map((r) => r.place.placeName)).toEqual(["가", "나"]);
  });
});

// ===========================================================================
// L. Input Immutability
// ===========================================================================
describe("L. Input Immutability", () => {
  it("scoreCandidate never mutates its input", () => {
    const input = baseInput();
    const snapshot = JSON.stringify(input);
    scoreCandidate(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("rankScored never mutates the entries it's given, and returns a new array", () => {
    const entries: RankedOption[] = [place({ placeId: "a" }), place({ placeId: "b" })].map((p) => ({
      kind: "candidate",
      place: p,
      breakdown: scoreCandidate(baseInput({ place: p })),
      route: null,
    }));
    const snapshot = JSON.stringify(entries);
    const result = rankScored(entries);
    expect(JSON.stringify(entries)).toBe(snapshot);
    expect(result).not.toBe(entries);
  });
});

// ===========================================================================
// M. No Fake Data
// ===========================================================================
describe("M. No Fake Data", () => {
  it("every optional real-data input missing -> every affected component is null/neutral, never invented", () => {
    const b = scoreCandidate(
      baseInput({
        place: place({ category: null }),
        experienceProfile: null,
        preferenceVectors: [],
        weatherRisk: "unknown",
        trafficBurden: "unknown",
        routeDurationSeconds: null,
        routeDistanceMeters: null,
      }),
    );
    expect(b.groupSatisfaction).toBeNull();
    expect(b.experiencePreservation).toBeNull();
    expect(b.situationFitness).toBe(NEUTRAL_COMPONENT_SCORE);
    expect(b.timeFitness).toBe(NEUTRAL_COMPONENT_SCORE);
    expect(b.travelBurden).toBeNull();
    expect(b.minimumSatisfactionPenalty).toBe(0);
    // finalScore still a clean neutral composite, not a crash or an extreme value
    expect(b.finalScore).toBeCloseTo(NEUTRAL_COMPONENT_SCORE * (SCORING_WEIGHTS.groupSatisfaction + SCORING_WEIGHTS.experiencePreservation + SCORING_WEIGHTS.situationFitness + SCORING_WEIGHTS.timeFitness), 5);
  });
});

// ===========================================================================
// N. No API coupling (source scan, mirrors the STEP 8 visitor-data guard)
// ===========================================================================
describe("N. No API coupling", () => {
  it("scoring.ts has no I/O: no server-only, no fetch, no adapter/Firestore imports", () => {
    const raw = readFileSync(join(process.cwd(), "features/scoring/scoring.ts"), "utf8");
    // strip comments so the docstrings that DESCRIBE these prohibitions don't self-trigger the scan
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/["']server-only["']/);
    expect(code).not.toMatch(/\bfetch\(/);
    expect(code).not.toMatch(/@\/lib\/api|@\/lib\/firebase|firebase-admin/);
    expect(code).not.toMatch(/new Date\(|Date\.now\(|Math\.random\(/);
  });
});

// ===========================================================================
// Property-style invariants (§30)
// ===========================================================================
describe("Invariants", () => {
  it("increasing travel burden never increases the final score, all else equal", () => {
    const cheap = scoreCandidate(baseInput({ routeDurationSeconds: 300, routeDistanceMeters: 2000 }));
    const expensive = scoreCandidate(baseInput({ routeDurationSeconds: 3000, routeDistanceMeters: 2000 }));
    expect(expensive.finalScore).toBeLessThanOrEqual(cheap.finalScore);
  });

  it("a falling minimum participant satisfaction never decreases the penalty", () => {
    const mins = [90, 70, 60, 50, 30, 10];
    const penalties = mins.map((m) => computeMinimumSatisfactionPenalty(m));
    for (let i = 1; i < penalties.length; i++) {
      expect(penalties[i]).toBeGreaterThanOrEqual(penalties[i - 1]);
    }
  });

  it("higher Experience Profile alignment on a candidate's axes never decreases Experience Preservation", () => {
    const natureLevels = [1, 3, 5, 7, 10];
    const scores = natureLevels.map(
      (n) => computeExperiencePreservation({ ...defaultPreferenceVector(), nature: n }, 12)!,
    );
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });

  it("final score always stays within [0,100] across a spread of extreme inputs", () => {
    const extremes = [
      baseInput({ preferenceVectors: [vec({ nature: 1 }), vec({ nature: 1 }), vec({ nature: 10 })], place: place({ category: 12 }) }),
      baseInput({ routeDurationSeconds: 100_000, routeDistanceMeters: 500_000 }),
      baseInput({ weatherRisk: "high", trafficBurden: "high", routeDistanceMeters: 60_000, place: place({ category: 12 }) }),
      baseInput({ experienceProfile: { ...defaultPreferenceVector(), nature: 10, culture: 1, food: 10, cafe: 1, shopping: 10, activity: 1, photo: 10, relax: 1 } }),
    ];
    for (const b of extremes.map(scoreCandidate)) {
      expect(b.finalScore).toBeGreaterThanOrEqual(0);
      expect(b.finalScore).toBeLessThanOrEqual(100);
    }
  });
});

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
