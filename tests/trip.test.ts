import { describe, expect, it } from "vitest";

import {
  applyItineraryEdit,
  applyRowPatch,
  coerceTripPreference,
  dropRow,
  generateTripId,
  normalizeItinerary,
  removeItineraryItem,
  renumberItinerary,
  tripDates,
  validateTripDraft,
  type TripDraft,
} from "@/features/trip/trip";
import { defaultPreferenceVector } from "@/features/participant/participant";
import type { ItineraryItem } from "@/types";

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

  it("allows an empty itinerary (trip basics only)", () => {
    expect(validateTripDraft(baseDraft({ itinerary: [] }))).toEqual([]);
  });

  it("rejects an itinerary date outside the trip range", () => {
    const errors = validateTripDraft(
      baseDraft({
        startDate: "2026-09-18",
        endDate: "2026-09-20",
        itinerary: [{ time: "10:00", placeName: "x", date: "2026-09-21" }],
      }),
    );
    expect(errors).toContain("여행 기간에 없는 날짜의 일정이 있습니다.");
  });

  it("accepts itinerary dates within the range", () => {
    expect(
      validateTripDraft(
        baseDraft({
          startDate: "2026-09-18",
          endDate: "2026-09-20",
          itinerary: [
            { time: "10:00", placeName: "a", date: "2026-09-18" },
            { time: "10:00", placeName: "b", date: "2026-09-20" },
          ],
        }),
      ),
    ).toEqual([]);
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

describe("tripDates", () => {
  it("lists every day inclusive", () => {
    expect(tripDates("2026-09-18", "2026-09-20")).toEqual([
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
  });
  it("single day", () => {
    expect(tripDates("2026-09-18", "2026-09-18")).toEqual(["2026-09-18"]);
  });
  it("[] for end < start or malformed", () => {
    expect(tripDates("2026-09-20", "2026-09-18")).toEqual([]);
    expect(tripDates("", "2026-09-18")).toEqual([]);
    expect(tripDates("2026/09/18", "2026-09-20")).toEqual([]);
  });
});

const mkItem = (over: Partial<ItineraryItem>): ItineraryItem => ({
  order: 1,
  date: "2026-09-18",
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

describe("renumberItinerary / applyItineraryEdit / removeItineraryItem", () => {
  it("renumbers by (date, time)", () => {
    const out = renumberItinerary([
      mkItem({ order: 1, date: "2026-09-19", time: "09:00", placeName: "day2" }),
      mkItem({ order: 2, date: "2026-09-18", time: "18:00", placeName: "day1저녁" }),
      mkItem({ order: 3, date: "2026-09-18", time: "10:00", placeName: "day1아침" }),
    ]);
    expect(out.map((i) => [i.order, i.placeName])).toEqual([
      [1, "day1아침"],
      [2, "day1저녁"],
      [3, "day2"],
    ]);
  });

  it("edit: time change re-sorts + renumbers, place fields untouched", () => {
    const items = [
      mkItem({ order: 1, time: "10:00", placeName: "A", placeId: "kakao:1", latitude: 35, longitude: 129, placeConfirmed: true }),
      mkItem({ order: 2, time: "12:00", placeName: "B" }),
    ];
    const out = applyItineraryEdit(items, 1, { time: "13:00" });
    expect(out.map((i) => [i.order, i.placeName, i.time])).toEqual([
      [1, "B", "12:00"],
      [2, "A", "13:00"],
    ]);
    const a = out.find((i) => i.placeName === "A")!;
    expect(a).toMatchObject({ placeId: "kakao:1", latitude: 35, placeConfirmed: true });
  });

  it("edit: placeName change clears placeId/address/coords + placeConfirmed", () => {
    const items = [
      mkItem({
        order: 1,
        placeName: "해운대해수욕장",
        placeId: "kakao:7913306",
        address: "부산 해운대구",
        latitude: 35.15,
        longitude: 129.16,
        placeConfirmed: true,
      }),
    ];
    const [out] = applyItineraryEdit(items, 1, { placeName: "광안리해수욕장" });
    expect(out).toMatchObject({
      placeName: "광안리해수욕장",
      placeId: null,
      address: null,
      latitude: null,
      longitude: null,
      placeConfirmed: false,
    });
  });

  it("edit: scheduleType/date change does NOT reset a confirmed place", () => {
    const items = [
      mkItem({ order: 1, placeName: "A", placeId: "kakao:1", latitude: 35, longitude: 129, placeConfirmed: true }),
    ];
    const [out] = applyItineraryEdit(items, 1, { scheduleType: "fixed", date: "2026-09-19" });
    expect(out).toMatchObject({ scheduleType: "fixed", date: "2026-09-19", placeConfirmed: true, placeId: "kakao:1" });
  });

  it("edit: never touches status", () => {
    const items = [mkItem({ order: 1, status: "completed" })];
    expect(applyItineraryEdit(items, 1, { time: "11:00" })[0].status).toBe("completed");
  });

  it("delete: removes the item and renumbers", () => {
    const items = [
      mkItem({ order: 1, time: "10:00", placeName: "A" }),
      mkItem({ order: 2, time: "12:00", placeName: "B" }),
      mkItem({ order: 3, time: "14:00", placeName: "C" }),
    ];
    const out = removeItineraryItem(items, 2);
    expect(out.map((i) => [i.order, i.placeName])).toEqual([
      [1, "A"],
      [2, "C"],
    ]);
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

// ===========================================================================
// STEP 12 — Trip Preference ("이번 여행의 취향", separate from any participant's)
// ===========================================================================
describe("validateTripDraft — tripPreference", () => {
  it("an omitted tripPreference is valid — a trip can be created without touching it", () => {
    expect(validateTripDraft(baseDraft())).toEqual([]);
  });

  it("a full, in-range (1~10) tripPreference is valid", () => {
    expect(validateTripDraft(baseDraft({ tripPreference: { ...defaultPreferenceVector(), nature: 9, cafe: 8 } }))).toEqual([]);
  });

  it("an out-of-range or non-integer axis is rejected, by its Korean label", () => {
    const errors = validateTripDraft(baseDraft({ tripPreference: { ...defaultPreferenceVector(), nature: 11 } }));
    expect(errors.some((e) => e.includes("자연") && e.includes("1~10"))).toBe(true);
  });

  it("nature: 0 and nature: 3.5 are both rejected the same way", () => {
    expect(validateTripDraft(baseDraft({ tripPreference: { ...defaultPreferenceVector(), nature: 0 } })).length).toBeGreaterThan(0);
    expect(validateTripDraft(baseDraft({ tripPreference: { ...defaultPreferenceVector(), nature: 3.5 } })).length).toBeGreaterThan(0);
  });
});

describe("coerceTripPreference", () => {
  it("a legacy trip with no tripPreference field at all -> null, never a fabricated default", () => {
    expect(coerceTripPreference(undefined)).toBeNull();
    expect(coerceTripPreference(null)).toBeNull();
  });

  it("a full valid vector round-trips exactly", () => {
    const v = { ...defaultPreferenceVector(), nature: 9, cafe: 8, photo: 8, relax: 9 };
    expect(coerceTripPreference(v)).toEqual(v);
  });

  it("is deterministic: same input -> same output", () => {
    const v = { ...defaultPreferenceVector(), food: 7 };
    expect(coerceTripPreference(v)).toEqual(coerceTripPreference(v));
  });

  it("a partial/malformed stored value is defensively normalized (missing -> neutral, out-of-range -> clamped), same policy as participant preferences", () => {
    const partial = coerceTripPreference({ nature: 12, culture: -1 });
    expect(partial?.nature).toBe(10);
    expect(partial?.culture).toBe(1);
    expect(partial?.food).toBe(5); // missing axis -> neutral
  });
});
