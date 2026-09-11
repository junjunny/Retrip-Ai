/**
 * STEP 8 — Candidate Generation pure calculators (hermetic). No Firestore, no
 * network, no Date.now(): `now` is always injected.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MAX_CANDIDATES_PER_SLOT,
  buildCandidateFromTourism,
  buildSlotCandidates,
  dedupeCandidates,
  filterInvalidCandidates,
  resolveSlotAnchor,
  selectFlexibleSlots,
  selectNearbySearchRadiusMeters,
  selectSearchContentTypeIds,
} from "@/features/candidate";
import { defaultPreferenceVector } from "@/features/participant/participant";
import type {
  CandidatePlace,
  ExperienceProfile,
  ItineraryItem,
  PlaceLocation,
  TourismPlace,
} from "@/types";

const item = (over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  order: 1,
  date: "2026-10-01",
  time: "10:00",
  placeId: null,
  placeName: "장소",
  address: null,
  latitude: null,
  longitude: null,
  scheduleType: "flexible",
  status: "planned",
  placeConfirmed: false,
  ...over,
});

const tour = (over: Partial<TourismPlace> = {}): TourismPlace => ({
  id: "1000000",
  contentTypeId: 12,
  name: "해운대해수욕장",
  address: "부산 해운대구 우동",
  areaCode: "6",
  sigunguCode: null,
  categoryCode: null,
  latitude: 35.1587,
  longitude: 129.1604,
  imageUrl: null,
  tel: null,
  source: "tour-korservice",
  ...over,
});

const kakaoLoc = (over: Partial<PlaceLocation> = {}): PlaceLocation => ({
  id: "kakao123",
  name: "해운대해수욕장",
  address: "부산 해운대구 우동",
  roadAddress: "부산 해운대구 해운대해변로 264",
  category: "관광,명소 > 해수욕장",
  categoryGroupCode: null,
  phone: null,
  latitude: 35.1587,
  longitude: 129.1604,
  url: null,
  provider: "kakao",
  ...over,
});

describe("selectFlexibleSlots", () => {
  it("TEST 1/2 — only flexible, not-fixed items qualify", () => {
    const itinerary = [
      item({ order: 1, scheduleType: "flexible", time: "11:00" }),
      item({ order: 2, scheduleType: "fixed", time: "12:00" }),
    ];
    const slots = selectFlexibleSlots(itinerary, { date: "2026-10-01", time: "10:00" });
    expect(slots.map((s) => s.order)).toEqual([1]);
  });

  it("TEST 3 — completed items are excluded", () => {
    const itinerary = [item({ order: 1, status: "completed", time: "11:00" })];
    expect(selectFlexibleSlots(itinerary, { date: "2026-10-01", time: "10:00" })).toEqual([]);
  });

  it("TEST 4 — items on other dates never mix in", () => {
    const itinerary = [
      item({ order: 1, date: "2026-10-02", time: "09:00" }),
      item({ order: 2, date: "2026-10-01", time: "11:00" }),
    ];
    const slots = selectFlexibleSlots(itinerary, { date: "2026-10-01", time: "10:00" });
    expect(slots.map((s) => s.order)).toEqual([2]);
  });

  it("TEST 5 — a future time today is included; an already-past time today is not", () => {
    const itinerary = [
      item({ order: 1, time: "09:00" }), // already past 10:00
      item({ order: 2, time: "15:00" }), // future
    ];
    const slots = selectFlexibleSlots(itinerary, { date: "2026-10-01", time: "10:00" });
    expect(slots.map((s) => s.order)).toEqual([2]);
  });
});

describe("selectSearchContentTypeIds", () => {
  it("TEST 6 — an Experience Profile leans category selection toward its above-neutral axes", () => {
    const profile: ExperienceProfile = { ...defaultPreferenceVector(), nature: 9, shopping: 9 };
    const types = selectSearchContentTypeIds(profile, "low");
    expect(types).toEqual(expect.arrayContaining([12, 38])); // nature, shopping
    expect(types).not.toContain(28); // activity stayed at neutral — not pulled in
  });

  it("TEST 7 — no Experience Profile -> a generic default, never invented", () => {
    expect(selectSearchContentTypeIds(null, "low")).toEqual([12, 39]);
  });

  it("TEST 8 — weatherRisk high ADDS indoor categories without removing outdoor ones", () => {
    const profile: ExperienceProfile = { ...defaultPreferenceVector(), activity: 9 }; // outdoor-only signal
    const withoutRain = selectSearchContentTypeIds(profile, "low");
    const withRain = selectSearchContentTypeIds(profile, "high");
    expect(withoutRain).toContain(28); // 레포츠 (outdoor) present either way
    expect(withRain).toContain(28);
    expect(withRain).toEqual(expect.arrayContaining([14, 38, 39, 32])); // indoor set added
  });

  it("TEST 9 — weatherRisk unknown never adjusts the search space", () => {
    const profile: ExperienceProfile = { ...defaultPreferenceVector(), activity: 9 };
    expect(selectSearchContentTypeIds(profile, "unknown")).toEqual(selectSearchContentTypeIds(profile, "low"));
  });
});

describe("selectNearbySearchRadiusMeters", () => {
  it("TEST 10 — high traffic burden narrows the search radius", () => {
    expect(selectNearbySearchRadiusMeters("high")).toBeLessThan(selectNearbySearchRadiusMeters("low"));
  });

  it("TEST 11 — unknown traffic never narrows the radius (no guess)", () => {
    expect(selectNearbySearchRadiusMeters("unknown")).toBe(selectNearbySearchRadiusMeters("low"));
    expect(selectNearbySearchRadiusMeters("medium")).toBe(selectNearbySearchRadiusMeters("low"));
  });
});

describe("resolveSlotAnchor", () => {
  it("TEST 12 — no trip-level reference location and the slot has no coords -> null, never a guessed coordinate", () => {
    expect(resolveSlotAnchor(item({ latitude: null, longitude: null }), null)).toBeNull();
  });

  it("TEST 13 — the slot's own confirmed coordinates win over the trip-level fallback", () => {
    const slot = item({ latitude: 1, longitude: 2 });
    expect(resolveSlotAnchor(slot, { latitude: 9, longitude: 9 })).toEqual({ latitude: 1, longitude: 2 });
  });

  it("falls back to the trip-level location when the slot has no coords of its own", () => {
    expect(resolveSlotAnchor(item(), { latitude: 9, longitude: 9 })).toEqual({ latitude: 9, longitude: 9 });
  });
});

describe("buildCandidateFromTourism", () => {
  it("TEST 14/25/26 — a real TourAPI place becomes a candidate whose fields trace to real input, never invented", () => {
    const t = tour();
    const c = buildCandidateFromTourism(t, []);
    expect(c.placeName).toBe(t.name);
    expect(c.latitude).toBe(t.latitude);
    expect(c.longitude).toBe(t.longitude);
    expect(c.category).toBe(t.contentTypeId);
  });

  it("TEST 15 — an empty Kakao response still yields a usable TourAPI-only candidate", () => {
    const c = buildCandidateFromTourism(tour(), []);
    expect(c.placeName).toBeTruthy();
    expect(c.source).toBe("tour-korservice");
  });

  it("TEST 17 — a matching Kakao result verifies/enriches the candidate", () => {
    const c = buildCandidateFromTourism(tour(), [kakaoLoc()]);
    expect(c.verificationStatus).toBe("verified");
    expect(c.candidateReason).toContain("Kakao");
  });

  it("TEST 18 — a Kakao result for a DIFFERENT place never gets attached (never a blind first result)", () => {
    const c = buildCandidateFromTourism(
      tour(),
      [kakaoLoc({ name: "전혀다른카페", latitude: 33.5, longitude: 126.5, address: "제주" })],
    );
    // still built from the real TourAPI place, not silently swapped to the mismatched Kakao one
    expect(c.placeName).toBe("해운대해수욕장");
  });

  it("TEST 25/26 (negative) — coordinates/name never come from anywhere but a real source", () => {
    const t = tour({ latitude: 35.0, longitude: 129.0 });
    const differentKakao = kakaoLoc({ latitude: 35.5, longitude: 129.5 });
    const c = buildCandidateFromTourism(t, [differentKakao]);
    // must equal one of the two REAL sources' coordinates exactly — never an average/derived value
    const isFromTour = c.latitude === t.latitude && c.longitude === t.longitude;
    const isFromKakao = c.latitude === differentKakao.latitude && c.longitude === differentKakao.longitude;
    expect(isFromTour || isFromKakao).toBe(true);
  });
});

describe("dedupeCandidates", () => {
  const c = (over: Partial<CandidatePlace> = {}): CandidatePlace => ({
    placeId: "tour:1",
    placeName: "해운대해수욕장",
    address: null,
    latitude: 35.1587,
    longitude: 129.1604,
    category: 12,
    source: "tour-korservice",
    verificationStatus: "candidate",
    candidateReason: "",
    ...over,
  });

  it("TEST 19 — same placeId collapses to one, keeping the first occurrence", () => {
    const out = dedupeCandidates([c({ placeId: "tour:1" }), c({ placeId: "tour:1", placeName: "다른이름" })]);
    expect(out).toHaveLength(1);
    expect(out[0].placeName).toBe("해운대해수욕장");
  });

  it("falls back to normalized-name equality when placeId is null on both sides", () => {
    const out = dedupeCandidates([
      c({ placeId: null, placeName: "해운대 해수욕장" }),
      c({ placeId: null, placeName: "해운대해수욕장" }),
    ]);
    expect(out).toHaveLength(1);
  });

  it("keeps genuinely different places", () => {
    const out = dedupeCandidates([c({ placeId: "tour:1" }), c({ placeId: "tour:2", placeName: "광안리해수욕장" })]);
    expect(out).toHaveLength(2);
  });
});

describe("filterInvalidCandidates", () => {
  const c = (over: Partial<CandidatePlace> = {}): CandidatePlace => ({
    placeId: "tour:1",
    placeName: "해운대해수욕장",
    address: null,
    latitude: 35.1587,
    longitude: 129.1604,
    category: 12,
    source: "tour-korservice",
    verificationStatus: "candidate",
    candidateReason: "",
    ...over,
  });

  it("TEST 20 — a half-present coordinate pair is invalid", () => {
    const out = filterInvalidCandidates([c({ latitude: 1, longitude: null })], [], null);
    expect(out).toEqual([]);
  });

  it("TEST 20b — an empty name is invalid", () => {
    expect(filterInvalidCandidates([c({ placeName: "  " })], [], null)).toEqual([]);
  });

  it("TEST 24 — a candidate matching a FIXED item's name is protected out", () => {
    const itinerary = [item({ scheduleType: "fixed", placeName: "해운대해수욕장" })];
    expect(filterInvalidCandidates([c({ placeName: "해운대해수욕장" })], itinerary, null)).toEqual([]);
  });

  it("a candidate matching an already-COMPLETED item's name is filtered", () => {
    const itinerary = [item({ status: "completed", placeName: "해운대해수욕장" })];
    expect(filterInvalidCandidates([c({ placeName: "해운대해수욕장" })], itinerary, null)).toEqual([]);
  });

  it("a candidate absurdly far from the search anchor is filtered", () => {
    const seoul = { latitude: 37.5665, longitude: 126.978 };
    const out = filterInvalidCandidates([c({ latitude: 35.1587, longitude: 129.1604 })], [], seoul);
    expect(out).toEqual([]);
  });

  it("keeps a legitimately nearby, unrelated-name candidate", () => {
    const anchor = { latitude: 35.16, longitude: 129.16 };
    expect(filterInvalidCandidates([c()], [], anchor)).toHaveLength(1);
  });
});

describe("buildSlotCandidates", () => {
  const c = (over: Partial<CandidatePlace> = {}): CandidatePlace => ({
    placeId: `tour:${Math.random()}`,
    placeName: `장소${Math.random()}`,
    address: null,
    latitude: 35.16,
    longitude: 129.16,
    category: 12,
    source: "tour-korservice",
    verificationStatus: "candidate",
    candidateReason: "",
    ...over,
  });

  it("TEST 21 — caps at MAX_CANDIDATES_PER_SLOT", () => {
    const many = Array.from({ length: MAX_CANDIDATES_PER_SLOT + 10 }, () => c());
    const result = buildSlotCandidates(item({ order: 3 }), many, [], null);
    expect(result.candidates.length).toBe(MAX_CANDIDATES_PER_SLOT);
    expect(result.itineraryOrder).toBe(3);
    expect(result.keepCurrent).toBe(true);
  });

  it("TEST 22 — identical input -> identical output", () => {
    const raw = [c({ placeId: "a" }), c({ placeId: "b" })];
    const slot = item({ order: 1 });
    expect(buildSlotCandidates(slot, raw, [], null)).toEqual(buildSlotCandidates(slot, raw, [], null));
  });

  it("TEST 23 — never mutates the itinerary it was given", () => {
    const itinerary = [item({ order: 1 }), item({ order: 2, scheduleType: "fixed" })];
    const snapshot = JSON.stringify(itinerary);
    buildSlotCandidates(itinerary[0], [c({ placeName: itinerary[1].placeName })], itinerary, null);
    expect(JSON.stringify(itinerary)).toBe(snapshot);
  });

  it("TEST 28 — output preserves input order (no internal ranking/re-sort) and carries no score/rank field", () => {
    const raw = [c({ placeId: "z" }), c({ placeId: "a" }), c({ placeId: "m" })]; // deliberately not alphabetical
    const result = buildSlotCandidates(item(), raw, [], null);
    expect(result.candidates.map((x) => x.placeId)).toEqual(["z", "a", "m"]);
    for (const cand of result.candidates) {
      expect(Object.keys(cand).sort()).toEqual(
        ["address", "candidateReason", "category", "latitude", "longitude", "placeId", "placeName", "source", "verificationStatus"].sort(),
      );
    }
  });

  it("'keep current' is a control value, never mixed into the candidates array as a Place", () => {
    const result = buildSlotCandidates(item(), [c()], [], null);
    expect(result.candidates.every((cand) => "placeId" in cand)).toBe(true);
    expect((result as unknown as Record<string, unknown>).candidates).not.toContainEqual(
      expect.objectContaining({ keepCurrent: true }),
    );
  });
});

describe("TEST 27 — visitor data is never used as real-time crowding (source scan)", () => {
  it("candidateGeneration.ts and candidateService.ts don't reference the visitor-count adapter", () => {
    const files = ["candidateGeneration.ts", "candidateService.ts"].map((f) =>
      readFileSync(join(process.cwd(), "features/candidate", f), "utf8"),
    );
    for (const src of files) {
      expect(src).not.toMatch(/fetchMetroVisitors|fetchDistrictVisitors|visitorCount/);
    }
  });
});
