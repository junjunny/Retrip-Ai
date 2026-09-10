import { describe, expect, it } from "vitest";

import {
  applyRowPatch,
  dropRow,
  generateTripId,
  normalizeItinerary,
  validateTripDraft,
  type TripDraft,
} from "@/features/trip/trip";

const baseDraft = (over: Partial<TripDraft> = {}): TripDraft => ({
  title: "부산 바다 여행",
  destination: "부산",
  startDate: "2026-09-10",
  endDate: "2026-09-10",
  itinerary: [{ time: "14:00", placeName: "해운대" }],
  ...over,
});

describe("validateTripDraft", () => {
  it("passes a valid draft", () => {
    expect(validateTripDraft(baseDraft())).toEqual([]);
  });

  it("flags missing basics", () => {
    const errors = validateTripDraft(
      baseDraft({ title: " ", destination: "", startDate: "", endDate: "" }),
    );
    expect(errors).toContain("여행 제목을 입력해주세요.");
    expect(errors).toContain("여행 지역을 입력해주세요.");
    expect(errors).toContain("여행 시작일을 선택해주세요.");
    expect(errors).toContain("여행 종료일을 선택해주세요.");
  });

  it("flags endDate before startDate", () => {
    const errors = validateTripDraft(
      baseDraft({ startDate: "2026-09-11", endDate: "2026-09-10" }),
    );
    expect(errors).toContain("여행 종료일은 시작일보다 빠를 수 없습니다.");
  });

  it("flags an empty itinerary", () => {
    expect(validateTripDraft(baseDraft({ itinerary: [] }))).toContain(
      "최소 1개의 일정을 입력해주세요.",
    );
  });

  it("flags a missing or malformed time", () => {
    expect(
      validateTripDraft(baseDraft({ itinerary: [{ time: "", placeName: "x" }] })),
    ).toContain("일정의 시간을 입력해주세요.");
    expect(
      validateTripDraft(
        baseDraft({ itinerary: [{ time: "9:00", placeName: "x" }] }),
      ),
    ).toContain("일정의 시간을 올바른 형식(HH:mm)으로 입력해주세요.");
  });

  it("flags a missing place name", () => {
    expect(
      validateTripDraft(
        baseDraft({ itinerary: [{ time: "14:00", placeName: "  " }] }),
      ),
    ).toContain("일정의 장소명을 입력해주세요.");
  });
});

describe("normalizeItinerary", () => {
  const D = "2026-09-10";

  it("sorts by time, re-numbers order, fills the new fields with defaults", () => {
    const result = normalizeItinerary(
      [
        { time: "18:00", placeName: "광안리" },
        { time: "14:00", placeName: "해운대" },
        { time: "16:00", placeName: "청사포" },
      ],
      D,
    );
    expect(result.map((i) => [i.order, i.time, i.placeName])).toEqual([
      [1, "14:00", "해운대"],
      [2, "16:00", "청사포"],
      [3, "18:00", "광안리"],
    ]);
    expect(result[0]).toMatchObject({
      date: D,
      placeId: null,
      latitude: null,
      longitude: null,
      scheduleType: "flexible",
      status: "planned",
    });
  });

  it("keeps input order for equal date+time (stable)", () => {
    const result = normalizeItinerary(
      [
        { time: "14:00", placeName: "해운대" },
        { time: "14:00", placeName: "청사포" },
      ],
      D,
    );
    expect(result.map((i) => i.placeName)).toEqual(["해운대", "청사포"]);
  });

  it("sorts multi-day items by (date, time), not time alone", () => {
    const result = normalizeItinerary(
      [
        { date: "2026-09-11", time: "09:00", placeName: "day2 아침" },
        { date: "2026-09-10", time: "18:00", placeName: "day1 저녁" },
      ],
      D,
    );
    expect(result.map((i) => i.placeName)).toEqual(["day1 저녁", "day2 아침"]);
  });

  it("respects an explicit fixed scheduleType and trims names", () => {
    const r = normalizeItinerary(
      [{ time: "09:00", placeName: " 김해공항 ", scheduleType: "fixed" }],
      D,
    );
    expect(r[0]).toMatchObject({ placeName: "김해공항", scheduleType: "fixed", date: D });
  });
});

describe("itinerary row editing", () => {
  const rows = [
    { key: "a", time: "14:00", placeName: "해운대" },
    { key: "b", time: "16:00", placeName: "청사포" },
  ];

  it("applyRowPatch updates only the matching row", () => {
    expect(applyRowPatch(rows, "b", { placeName: "청사포항" })).toEqual([
      { key: "a", time: "14:00", placeName: "해운대" },
      { key: "b", time: "16:00", placeName: "청사포항" },
    ]);
  });

  it("applyRowPatch is a no-op for an unknown key", () => {
    expect(applyRowPatch(rows, "zzz", { placeName: "x" })).toEqual(rows);
  });

  it("dropRow removes the matching row", () => {
    expect(dropRow(rows, "a")).toEqual([
      { key: "b", time: "16:00", placeName: "청사포" },
    ]);
  });

  it("dropRow never removes the last remaining row", () => {
    const one = [{ key: "a", time: "14:00", placeName: "해운대" }];
    expect(dropRow(one, "a")).toEqual(one);
  });
});

describe("generateTripId", () => {
  it("produces an 8-char id from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTripId()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it("is effectively unique across many draws", () => {
    const ids = new Set(Array.from({ length: 5000 }, () => generateTripId()));
    expect(ids.size).toBe(5000);
  });
});
