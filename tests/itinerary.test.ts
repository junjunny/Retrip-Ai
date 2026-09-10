import { describe, expect, it } from "vitest";

import { coerceItinerary } from "@/features/trip/tripService";

const START = "2026-09-10";

describe("coerceItinerary — backward compatibility", () => {
  it("reads a legacy Phase-1 item ({order,time,placeName}) with filled defaults", () => {
    const out = coerceItinerary(
      [{ order: 1, time: "14:00", placeName: "해운대" }],
      START,
    );
    expect(out).toEqual([
      {
        order: 1,
        date: START, // ← trip.startDate
        time: "14:00",
        placeId: null,
        placeName: "해운대",
        latitude: null,
        longitude: null,
        scheduleType: "flexible", // ← legacy default
        status: "planned", // ← legacy default
      },
    ]);
  });

  it("keeps Phase-3-B fields when already present", () => {
    const out = coerceItinerary(
      [
        {
          order: 1,
          date: "2026-09-11",
          time: "09:00",
          placeId: "kakao:7913306",
          placeName: "해운대해수욕장",
          latitude: 35.1585,
          longitude: 129.1598,
          scheduleType: "fixed",
          status: "completed",
        },
      ],
      START,
    );
    expect(out[0]).toMatchObject({
      date: "2026-09-11",
      placeId: "kakao:7913306",
      latitude: 35.1585,
      scheduleType: "fixed",
      status: "completed",
    });
  });

  it("drops non-itinerary entries and returns [] for a missing array", () => {
    expect(coerceItinerary(undefined, START)).toEqual([]);
    expect(coerceItinerary([{ foo: 1 }, null, "x"], START)).toEqual([]);
  });

  it("sorts mixed legacy+new items by (date, time)", () => {
    const out = coerceItinerary(
      [
        { order: 2, time: "18:00", placeName: "저녁" }, // legacy → date START
        { order: 1, date: "2026-09-09", time: "10:00", placeName: "전날" },
      ],
      START,
    );
    expect(out.map((i) => i.placeName)).toEqual(["전날", "저녁"]);
  });
});
