import { describe, expect, it } from "vitest";

import { buildNarrativeFacts, NARRATIVE_OVERVIEW_MAX_LENGTH } from "@/features/journey/narrativeFacts";
import { isGroundedNarrative, isValidPlaceNarrative } from "@/features/journey/narrativeSchema";

describe("buildNarrativeFacts (STEP 19)", () => {
  it("omits every optional field when nothing real is known", () => {
    const facts = buildNarrativeFacts({
      placeName: "서학동사진미술관",
      address: null,
      detail: null,
      nowDate: "2026-09-14",
      previousPlaceName: null,
      route: null,
    });
    expect(facts).toEqual({ placeName: "서학동사진미술관" });
  });

  it("truncates a long overview to NARRATIVE_OVERVIEW_MAX_LENGTH", () => {
    const long = "가".repeat(500);
    const facts = buildNarrativeFacts({
      placeName: "A",
      address: null,
      detail: { overview: long, event: null },
      nowDate: "2026-09-14",
      previousPlaceName: null,
      route: null,
    });
    expect(facts.overviewSnippet).toHaveLength(NARRATIVE_OVERVIEW_MAX_LENGTH);
  });

  it("marks eventOngoing only when nowDate falls within the real event range", () => {
    const inRange = buildNarrativeFacts({
      placeName: "A",
      address: null,
      detail: { overview: "설명", event: { startDate: "20260910", endDate: "20260920" } },
      nowDate: "2026-09-14",
      previousPlaceName: null,
      route: null,
    });
    expect(inRange.eventOngoing).toBe(true);

    const outOfRange = buildNarrativeFacts({
      placeName: "A",
      address: null,
      detail: { overview: "설명", event: { startDate: "20260910", endDate: "20260912" } },
      nowDate: "2026-09-14",
      previousPlaceName: null,
      route: null,
    });
    expect(outOfRange.eventOngoing).toBeUndefined();
  });

  it("converts a real route into rounded minutes, never inventing one when route is null", () => {
    const withRoute = buildNarrativeFacts({
      placeName: "A",
      address: null,
      detail: null,
      nowDate: "2026-09-14",
      previousPlaceName: "B",
      route: { durationSeconds: 245, distanceMeters: 931 },
    });
    expect(withRoute.travelDurationMinutes).toBeCloseTo(4.1, 5);
    expect(withRoute.travelDistanceMeters).toBe(931);

    const withoutRoute = buildNarrativeFacts({
      placeName: "A",
      address: null,
      detail: null,
      nowDate: "2026-09-14",
      previousPlaceName: "B",
      route: null,
    });
    expect(withoutRoute.travelDurationMinutes).toBeUndefined();
    expect(withoutRoute.travelDistanceMeters).toBeUndefined();
  });
});

describe("isValidPlaceNarrative (STEP 19)", () => {
  it("accepts a well-formed narrative", () => {
    expect(
      isValidPlaceNarrative({ title: "다음 여행지", message: "짧은 소개 문장입니다.", factsUsed: ["overview"] }),
    ).toBe(true);
  });

  it("rejects missing fields, oversized strings, or a non-array factsUsed", () => {
    expect(isValidPlaceNarrative({ title: "제목", message: "본문" })).toBe(false);
    expect(isValidPlaceNarrative({ title: "제목", message: "x".repeat(200), factsUsed: [] })).toBe(false);
    expect(isValidPlaceNarrative({ title: "제목", message: "본문", factsUsed: "not-an-array" })).toBe(false);
  });
});

describe("isGroundedNarrative (STEP 19)", () => {
  const baseFacts = { placeName: "A" };

  it("rejects a duration/distance claim when no real route fact exists", () => {
    const n = { title: "제목", message: "약 5분 거리예요.", factsUsed: [] };
    expect(isGroundedNarrative(n, baseFacts)).toBe(false);
  });

  it("accepts a duration claim when a real route fact backs it", () => {
    const n = { title: "제목", message: "약 4분 거리예요.", factsUsed: ["route"] };
    expect(isGroundedNarrative(n, { ...baseFacts, travelDurationMinutes: 4.1 })).toBe(true);
  });

  it("always rejects a weather claim — this feature never has a weather signal", () => {
    const n = { title: "제목", message: "비가 올 수 있어요.", factsUsed: [] };
    expect(isGroundedNarrative(n, baseFacts)).toBe(false);
  });

  it("rejects a raw score/percentage leaking into the text", () => {
    const n = { title: "제목", message: "이 장소는 92점이에요.", factsUsed: [] };
    expect(isGroundedNarrative(n, baseFacts)).toBe(false);
  });

  it("accepts plain narrative text with no numeric/weather claims", () => {
    const n = { title: "다음 여행지", message: "전주의 또 다른 분위기를 느낄 수 있는 곳이에요.", factsUsed: ["overview"] };
    expect(isGroundedNarrative(n, baseFacts)).toBe(true);
  });
});
