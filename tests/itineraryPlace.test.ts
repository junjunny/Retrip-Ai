import { describe, expect, it } from "vitest";

import {
  applyPlaceChoice,
  itineraryMarkers,
  placeChoiceFromCandidate,
  placeChoiceFromNormalized,
  type PlaceChoice,
} from "@/features/trip/itineraryPlace";
import type { ItineraryItem, NormalizedPlace, PlaceCandidate } from "@/types";

const item = (over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  order: 1,
  date: "2026-09-10",
  time: "14:00",
  placeId: null,
  placeName: "해운대",
  address: null,
  latitude: null,
  longitude: null,
  scheduleType: "flexible",
  status: "planned",
  placeConfirmed: false,
  ...over,
});

const choice: PlaceChoice = {
  placeId: "kakao:7913306",
  placeName: "해운대해수욕장",
  address: "부산 해운대구 우동",
  latitude: 35.1585,
  longitude: 129.1599,
};

describe("applyPlaceChoice", () => {
  it("updates placeId / placeName / address / coords + placeConfirmed", () => {
    const [out] = applyPlaceChoice([item()], 1, choice);
    expect(out).toMatchObject({
      placeId: "kakao:7913306",
      placeName: "해운대해수욕장",
      address: "부산 해운대구 우동",
      latitude: 35.1585,
      longitude: 129.1599,
      placeConfirmed: true,
    });
  });

  it("does NOT change order / date / time / scheduleType / status", () => {
    const before = item({ scheduleType: "fixed", status: "completed", date: "2026-09-11", time: "09:30" });
    const [out] = applyPlaceChoice([before], 1, choice);
    expect(out.order).toBe(before.order);
    expect(out.date).toBe("2026-09-11");
    expect(out.time).toBe("09:30");
    expect(out.scheduleType).toBe("fixed");
    expect(out.status).toBe("completed");
  });

  it("only touches the item with the given order", () => {
    const items = [item({ order: 1 }), item({ order: 2, placeName: "감천" })];
    const out = applyPlaceChoice(items, 2, choice);
    expect(out[0].placeConfirmed).toBe(false);
    expect(out[0].placeName).toBe("해운대");
    expect(out[1].placeName).toBe("해운대해수욕장");
  });

  it("keeps a choice with null coordinates (never invents any)", () => {
    const noCoords: PlaceChoice = { ...choice, latitude: null, longitude: null };
    const [out] = applyPlaceChoice([item()], 1, noCoords);
    expect(out.latitude).toBeNull();
    expect(out.longitude).toBeNull();
    expect(out.placeConfirmed).toBe(true);
  });
});

describe("itineraryMarkers", () => {
  it("emits a marker only for items that actually have coordinates", () => {
    const items = [
      item({ order: 1, latitude: 35.1, longitude: 129.1, placeConfirmed: true }),
      item({ order: 2, latitude: null, longitude: null }),
    ];
    const markers = itineraryMarkers(items);
    expect(markers.map((m) => m.order)).toEqual([1]);
    expect(markers[0]).toMatchObject({ latitude: 35.1, longitude: 129.1, confirmed: true });
  });

  it("returns [] when nothing has coordinates — no fake markers", () => {
    expect(itineraryMarkers([item(), item({ order: 2 })])).toEqual([]);
  });
});

describe("placeChoice builders", () => {
  it("from a NormalizedPlace prefers road address", () => {
    const np = {
      query: "해운대",
      placeName: "해운대해수욕장",
      placeId: "kakao:7913306",
      address: "부산 해운대구 우동",
      roadAddress: "부산 해운대구 해운대해변로 264",
      latitude: 35.1585,
      longitude: 129.1599,
    } as NormalizedPlace;
    expect(placeChoiceFromNormalized(np)).toMatchObject({
      placeId: "kakao:7913306",
      address: "부산 해운대구 해운대해변로 264",
      latitude: 35.1585,
    });
  });

  it("from a candidate carries its placeId + coords", () => {
    const c: PlaceCandidate = {
      source: "kakao",
      name: "광안리해수욕장",
      address: "부산 수영구 광안동",
      latitude: 35.153,
      longitude: 129.118,
      placeId: "kakao:123",
      nameSimilarity: 1,
      distanceMeters: null,
    };
    expect(placeChoiceFromCandidate(c)).toEqual({
      placeId: "kakao:123",
      placeName: "광안리해수욕장",
      address: "부산 수영구 광안동",
      latitude: 35.153,
      longitude: 129.118,
    });
  });
});
