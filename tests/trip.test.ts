import { describe, expect, it } from "vitest";

import {
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
  it("sorts by time and re-numbers order from 1", () => {
    const result = normalizeItinerary([
      { time: "18:00", placeName: "광안리" },
      { time: "14:00", placeName: "해운대" },
      { time: "16:00", placeName: "청사포" },
    ]);
    expect(result).toEqual([
      { order: 1, time: "14:00", placeName: "해운대" },
      { order: 2, time: "16:00", placeName: "청사포" },
      { order: 3, time: "18:00", placeName: "광안리" },
    ]);
  });

  it("keeps input order for equal times (stable)", () => {
    const result = normalizeItinerary([
      { time: "14:00", placeName: "해운대" },
      { time: "14:00", placeName: "청사포" },
    ]);
    expect(result.map((i) => i.placeName)).toEqual(["해운대", "청사포"]);
  });

  it("trims place names", () => {
    expect(normalizeItinerary([{ time: "09:00", placeName: " 감천 " }])[0]).toEqual(
      { order: 1, time: "09:00", placeName: "감천" },
    );
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
