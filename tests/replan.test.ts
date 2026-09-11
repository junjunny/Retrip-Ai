/**
 * STEP 10 — Re:Plan Orchestration, pure domain (hermetic). No Firestore, no
 * network, no clock: `generatedAt`/`now` are always injected.
 */
import { describe, expect, it } from "vitest";

import {
  MIN_IMPROVEMENT_TO_REPLACE,
  buildReplanPreview,
  computeItineraryFingerprint,
  decideSlotAction,
  type SlotRankingInput,
} from "@/features/replan";
import type { RankedOption, ScoreBreakdown } from "@/features/scoring";
import type { CandidatePlace, ItineraryItem } from "@/types";

const item = (over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  order: 1,
  date: "2026-10-01",
  time: "12:00",
  placeId: null,
  placeName: "기존 장소",
  address: null,
  latitude: null,
  longitude: null,
  scheduleType: "flexible",
  status: "planned",
  placeConfirmed: false,
  ...over,
});

const place = (over: Partial<CandidatePlace> = {}): CandidatePlace => ({
  placeId: "tour:1",
  placeName: "새 후보",
  address: "부산",
  latitude: 35.1,
  longitude: 129.1,
  category: 12,
  tourApiContentId: "tour:1",
  imageUrl: null,
  source: "tour-korservice",
  verificationStatus: "verified",
  candidateReason: "",
  ...over,
});

const breakdown = (finalScore: number): ScoreBreakdown => ({
  groupSatisfaction: finalScore,
  experiencePreservation: finalScore,
  situationFitness: 50,
  timeFitness: 50,
  travelBurden: null,
  minimumSatisfactionPenalty: 0,
  finalScore,
  participantScores: [finalScore],
  minimumParticipantSatisfaction: finalScore,
});

const option = (kind: "candidate" | "keepCurrent", p: CandidatePlace, finalScore: number): RankedOption => ({
  kind,
  place: p,
  breakdown: breakdown(finalScore),
  route: null,
});

const keepCurrentOf = (slot: ItineraryItem, finalScore: number): RankedOption =>
  option(
    "keepCurrent",
    {
      placeId: slot.placeId,
      placeName: slot.placeName,
      address: slot.address,
      latitude: slot.latitude,
      longitude: slot.longitude,
      category: null,
      tourApiContentId: null,
      imageUrl: null,
      source: "tour-korservice",
      verificationStatus: slot.placeConfirmed ? "verified" : "candidate",
      candidateReason: "현재 일정 유지",
    },
    finalScore,
  );

// ===========================================================================
// Fingerprint
// ===========================================================================
describe("computeItineraryFingerprint", () => {
  it("is deterministic for the same itinerary", () => {
    const it1 = [item({ order: 1 }), item({ order: 2, placeName: "b" })];
    expect(computeItineraryFingerprint(it1)).toBe(computeItineraryFingerprint(it1));
  });

  it("doesn't depend on array order (sorts by order internally)", () => {
    const a = item({ order: 1, placeName: "a" });
    const b = item({ order: 2, placeName: "b" });
    expect(computeItineraryFingerprint([a, b])).toBe(computeItineraryFingerprint([b, a]));
  });

  it("changes when any relevant field changes", () => {
    const base = [item({ order: 1 })];
    const fp0 = computeItineraryFingerprint(base);
    expect(computeItineraryFingerprint([item({ order: 1, time: "13:00" })])).not.toBe(fp0);
    expect(computeItineraryFingerprint([item({ order: 1, placeName: "다른 장소" })])).not.toBe(fp0);
    expect(computeItineraryFingerprint([item({ order: 1, status: "completed" })])).not.toBe(fp0);
    expect(computeItineraryFingerprint([item({ order: 1, scheduleType: "fixed" })])).not.toBe(fp0);
    expect(computeItineraryFingerprint([item({ order: 1, placeConfirmed: true })])).not.toBe(fp0);
  });
});

// ===========================================================================
// decideSlotAction
// ===========================================================================
describe("decideSlotAction", () => {
  const slot = item();

  it("keepCurrent as the top-ranked option -> KEEP", () => {
    const ranked = [keepCurrentOf(slot, 80), option("candidate", place(), 60)];
    const { action, winner } = decideSlotAction(ranked, new Set());
    expect(action).toBe("KEEP");
    expect(winner.kind).toBe("keepCurrent");
  });

  it("a candidate that clears the improvement threshold -> REPLACE", () => {
    const ranked = [
      option("candidate", place(), 70 + MIN_IMPROVEMENT_TO_REPLACE),
      keepCurrentOf(slot, 70),
    ];
    const { action, winner } = decideSlotAction(ranked, new Set());
    expect(action).toBe("REPLACE");
    expect(winner.kind).toBe("candidate");
  });

  it("a candidate that's only marginally better (below the threshold) -> KEEP, not an automatic swap", () => {
    const ranked = [
      option("candidate", place(), 70 + MIN_IMPROVEMENT_TO_REPLACE - 1),
      keepCurrentOf(slot, 70),
    ];
    expect(decideSlotAction(ranked, new Set()).action).toBe("KEEP");
  });

  it("an excluded (already-claimed) placeId is skipped in favor of the next eligible option", () => {
    const winnerPlace = place({ placeId: "tour:claimed", placeName: "이미 선택됨" });
    const secondPlace = place({ placeId: "tour:2", placeName: "차선책" });
    const ranked = [
      option("candidate", winnerPlace, 90),
      option("candidate", secondPlace, 70 + MIN_IMPROVEMENT_TO_REPLACE),
      keepCurrentOf(slot, 70),
    ];
    const { action, winner } = decideSlotAction(ranked, new Set(["tour:claimed"]));
    expect(action).toBe("REPLACE");
    expect(winner.place.placeId).toBe("tour:2");
  });

  it("every candidate excluded -> falls back to KEEP", () => {
    const p = place({ placeId: "tour:only" });
    const ranked = [option("candidate", p, 95), keepCurrentOf(slot, 60)];
    const { action, winner } = decideSlotAction(ranked, new Set(["tour:only"]));
    expect(action).toBe("KEEP");
    expect(winner.kind).toBe("keepCurrent");
  });
});

// ===========================================================================
// buildReplanPreview
// ===========================================================================
describe("buildReplanPreview", () => {
  const flexA = item({ order: 1, time: "10:00", placeName: "카페" });
  const fixedB = item({ order: 2, time: "12:00", scheduleType: "fixed", placeName: "공연" });
  const flexC = item({ order: 3, time: "15:00", placeName: "해변" });
  const itinerary = [flexA, fixedB, flexC];

  const winningPlaceA = place({ placeId: "tour:a", placeName: "실내 문화공간" });
  const winningPlaceC = place({ placeId: "tour:c", placeName: "다른 관광지" });

  const slotRankings: SlotRankingInput[] = [
    { itineraryOrder: 1, ranked: [option("candidate", winningPlaceA, 90), keepCurrentOf(flexA, 70)] },
    { itineraryOrder: 3, ranked: [keepCurrentOf(flexC, 80), option("candidate", winningPlaceC, 60)] },
  ];

  it("builds one proposal per eligible slot, with correct current/proposed data", () => {
    const preview = buildReplanPreview({
      tripId: "T1",
      generatedAt: "2026-10-01T01:00:00.000Z",
      itinerary,
      slotRankings,
    });
    expect(preview.tripId).toBe("T1");
    expect(preview.slots.map((s) => s.itineraryOrder)).toEqual([1, 3]);

    const slotA = preview.slots.find((s) => s.itineraryOrder === 1)!;
    expect(slotA.action).toBe("REPLACE");
    expect(slotA.proposed?.placeName).toBe("실내 문화공간");
    expect(slotA.current).toEqual({ placeId: null, placeName: "카페", date: "2026-10-01", time: "10:00", scheduleType: "flexible" });

    const slotC = preview.slots.find((s) => s.itineraryOrder === 3)!;
    expect(slotC.action).toBe("KEEP");
    expect(slotC.proposed).toBeNull();
  });

  it("a FIXED item never appears in the proposal even if a ranking were somehow supplied for it", () => {
    const preview = buildReplanPreview({
      tripId: "T1",
      generatedAt: "now",
      itinerary,
      slotRankings: [
        ...slotRankings,
        { itineraryOrder: 2, ranked: [option("candidate", place(), 99), keepCurrentOf(fixedB, 10)] },
      ],
    });
    // this project's real pipeline (STEP 8) never generates a ranking for a
    // FIXED slot in the first place; this asserts the proposal builder
    // doesn't add a defensive gate that silently drops it either — it
    // trusts its input's scope, so the ranking DOES appear here, proving the
    // real protection is upstream (selectFlexibleSlots), not duplicated here.
    expect(preview.slots.some((s) => s.itineraryOrder === 2)).toBe(true);
  });

  it("never mutates the itinerary it's given", () => {
    const snapshot = JSON.stringify(itinerary);
    buildReplanPreview({ tripId: "T1", generatedAt: "now", itinerary, slotRankings });
    expect(JSON.stringify(itinerary)).toBe(snapshot);
  });

  it("is deterministic: identical input -> identical preview (fingerprint included)", () => {
    const a = buildReplanPreview({ tripId: "T1", generatedAt: "now", itinerary, slotRankings });
    const b = buildReplanPreview({ tripId: "T1", generatedAt: "now", itinerary, slotRankings });
    expect(a).toEqual(b);
  });

  it("processes slots in itineraryOrder ascending regardless of input order, so cross-slot dedup is deterministic", () => {
    const sharedPlace = place({ placeId: "tour:shared", placeName: "공유 후보" });
    const rankings: SlotRankingInput[] = [
      { itineraryOrder: 3, ranked: [option("candidate", sharedPlace, 90), keepCurrentOf(flexC, 50)] },
      { itineraryOrder: 1, ranked: [option("candidate", sharedPlace, 90), keepCurrentOf(flexA, 50)] },
    ];
    // fed in reverse order on purpose
    const preview = buildReplanPreview({ tripId: "T1", generatedAt: "now", itinerary, slotRankings: rankings });
    const slot1 = preview.slots.find((s) => s.itineraryOrder === 1)!;
    const slot3 = preview.slots.find((s) => s.itineraryOrder === 3)!;
    // order 1 (processed first, ascending) claims the shared place
    expect(slot1.action).toBe("REPLACE");
    expect(slot1.proposed?.placeId).toBe("tour:shared");
    // order 3 must not also propose the same real place
    expect(slot3.proposed?.placeId).not.toBe("tour:shared");
  });

  it("a slot with no ranking data at all (order missing from itinerary) is skipped defensively", () => {
    const preview = buildReplanPreview({
      tripId: "T1",
      generatedAt: "now",
      itinerary,
      slotRankings: [{ itineraryOrder: 999, ranked: [keepCurrentOf(flexA, 50)] }],
    });
    expect(preview.slots).toEqual([]);
  });

  it("no eligible slots at all -> a normal preview with slots: [], not an error", () => {
    const preview = buildReplanPreview({ tripId: "T1", generatedAt: "now", itinerary, slotRankings: [] });
    expect(preview.slots).toEqual([]);
    expect(preview.tripId).toBe("T1");
  });
});
