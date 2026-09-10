import { describe, expect, it } from "vitest";

import {
  addressOverlap,
  haversineMeters,
  matchPlace,
  nameSimilarity,
  normalizeName,
} from "@/lib/place";
import type { PlaceLocation, TourismPlace } from "@/types";

const tour = (over: Partial<TourismPlace>): TourismPlace => ({
  id: "126508",
  contentTypeId: 12,
  name: "해운대해수욕장",
  address: "부산광역시 해운대구 우동",
  areaCode: "6",
  sigunguCode: "16",
  categoryCode: "A01011100",
  latitude: 35.1586,
  longitude: 129.1603,
  imageUrl: "http://img/x.jpg",
  tel: null,
  source: "tour-korservice",
  ...over,
});

const kakao = (over: Partial<PlaceLocation>): PlaceLocation => ({
  id: "7913306",
  name: "해운대해수욕장",
  address: "부산 해운대구 우동",
  roadAddress: null,
  category: "여행 > 관광,명소 > 해수욕장,해변",
  categoryGroupCode: "AT4",
  phone: "051-749-7612",
  latitude: 35.15852,
  longitude: 129.15985,
  url: "http://place.map.kakao.com/7913306",
  provider: "kakao",
  ...over,
});

// ---------- primitives ----------

describe("name similarity", () => {
  it("normalizes away spaces/punctuation", () => {
    expect(normalizeName("해운대 해수욕장!")).toBe("해운대해수욕장");
  });
  it("exact match = 1", () => {
    expect(nameSimilarity("해운대해수욕장", "해운대 해수욕장")).toBe(1);
  });
  it("a long name that merely CONTAINS the query scores low", () => {
    // "다비치안경 해운대해수욕장입구점" — the STEP 1 wrong-result case
    const s = nameSimilarity("해운대해수욕장", "다비치안경 해운대해수욕장입구점");
    expect(s).toBeLessThan(0.55);
  });
  it("unrelated names score low", () => {
    expect(nameSimilarity("해운대해수욕장", "감천문화마을")).toBeLessThan(0.4);
  });
});

describe("addressOverlap", () => {
  it("shares 시/구/동 tokens", () => {
    expect(
      addressOverlap("부산광역시 해운대구 우동", "부산 해운대구 우동 620"),
    ).toBeGreaterThan(0.5);
  });
  it("no overlap for different districts", () => {
    expect(
      addressOverlap("부산광역시 해운대구", "서울특별시 종로구"),
    ).toBe(0);
  });
});

describe("haversineMeters", () => {
  it("~484m between 해운대해수욕장 and 다비치안경 입구점", () => {
    const d = haversineMeters(35.15852, 129.15985, 35.16288, 129.15981);
    expect(d).toBeGreaterThan(400);
    expect(d).toBeLessThan(560);
  });
});

// ---------- matchPlace ----------

describe("matchPlace", () => {
  it("1. Tour + Kakao both '해운대해수욕장' at nearly the same point → verified/high, both sources", () => {
    const r = matchPlace({ query: "해운대해수욕장" }, [tour({})], [kakao({})]);
    expect(r.verificationStatus).toBe("verified");
    expect(r.confidence).toBe("high");
    expect(r.sources.sort()).toEqual(["kakao", "tour-korservice"]);
    expect(r.placeId).toBe("kakao:7913306"); // prefer Kakao coords/id
    expect(r.tourApiContentId).toBe("126508");
    expect(r.latitude).toBeCloseTo(35.1585, 2);
  });

  it("2. names match but the two sources' coordinates disagree (>600m) → NOT verified", () => {
    const r = matchPlace(
      { query: "해운대해수욕장" },
      [tour({ latitude: 35.18, longitude: 129.12 })], // ~4km off
      [kakao({})],
    );
    expect(r.verificationStatus).not.toBe("verified");
    expect(r.verificationStatus).toBe("candidate");
    expect(r.candidates.length).toBeGreaterThan(0); // both kept
  });

  it("3. single strong Kakao match + address hint → verified", () => {
    const r = matchPlace(
      { query: "해운대해수욕장", address: "부산 해운대구 우동" },
      [],
      [kakao({})],
    );
    expect(r.verificationStatus).toBe("verified");
    expect(r.sources).toEqual(["kakao"]);
  });

  it("4. no results at all → unresolved, null coords, null placeId", () => {
    const r = matchPlace({ query: "존재하지않는장소" }, [], []);
    expect(r.verificationStatus).toBe("unresolved");
    expect(r.confidence).toBe("low");
    expect(r.latitude).toBeNull();
    expect(r.longitude).toBeNull();
    expect(r.placeId).toBeNull();
  });

  it("5. TourAPI returns only the WRONG place ('다비치안경…') → not auto-confirmed", () => {
    const r = matchPlace(
      { query: "해운대해수욕장" },
      [
        tour({
          id: "2929116",
          name: "다비치안경 해운대해수욕장입구점",
          latitude: 35.16288,
          longitude: 129.15981,
        }),
      ],
      [], // Kakao gave nothing
    );
    expect(r.verificationStatus).toBe("unresolved");
    expect(r.placeName).toBe("해운대해수욕장"); // query kept, NOT the wrong name
    expect(r.placeId).toBeNull();
  });

  it("6. cross-confirmed even when TourAPI's own top result is the wrong place", () => {
    // Tour list has the wrong place first but also the real one; Kakao has the real one.
    const r = matchPlace(
      { query: "해운대해수욕장" },
      [
        tour({ id: "2929116", name: "다비치안경 해운대해수욕장입구점", latitude: 35.16288, longitude: 129.15981 }),
        tour({ id: "126508", name: "해운대해수욕장", latitude: 35.1586, longitude: 129.1603 }),
      ],
      [kakao({})],
    );
    expect(r.verificationStatus).toBe("verified");
    expect(r.placeName).toBe("해운대해수욕장");
    expect(r.tourApiContentId).toBe("126508"); // the correct one, not results[0]
  });
});
