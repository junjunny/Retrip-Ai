import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _internal as accessInternal } from "@/lib/api/tour/accessibility";
import { _internal as tourismInternal } from "@/lib/api/tour/tourism";
import { _internal as visitorInternal } from "@/lib/api/tour/visitors";
import { _internal as kmaInternal } from "@/lib/api/weather/kma";
import { latLngToGrid } from "@/lib/api/weather/grid";
import { _internal as kakaoInternal } from "@/lib/api/kakao/place";
import { buildQuery, fetchJson } from "@/lib/api/http";
import { ExternalApiError } from "@/lib/api/errors";

// ---------- http helper ----------
describe("fetchJson", () => {
  afterEach(() => vi.unstubAllGlobals());

  const mockFetch = (impl: (url: string) => Promise<Response> | Response) =>
    vi.stubGlobal("fetch", vi.fn((u: string) => Promise.resolve(impl(u))));

  it("parses JSON on 200", async () => {
    mockFetch(() => new Response(JSON.stringify({ a: 1 }), { status: 200 }));
    expect(await fetchJson("http://x", { source: "t", retries: 0 })).toEqual({ a: 1 });
  });

  it("does NOT retry a 400 and maps to http", async () => {
    const f = vi.fn(() => Promise.resolve(new Response("bad", { status: 400 })));
    vi.stubGlobal("fetch", f);
    await expect(fetchJson("http://x", { source: "t", retries: 3 })).rejects.toMatchObject({
      kind: "http",
      status: 400,
    });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("maps 401 to auth, 429 to rate_limit, 503 to upstream", async () => {
    for (const [status, kind] of [[401, "auth"], [429, "rate_limit"], [503, "upstream"]] as const) {
      vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("", { status }))));
      await expect(
        fetchJson("http://x", { source: "t", retries: 0 }),
      ).rejects.toMatchObject({ kind });
    }
  });

  it("retries a 500 then succeeds", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        n++;
        return Promise.resolve(
          n < 2 ? new Response("", { status: 500 }) : new Response("{}", { status: 200 }),
        );
      }),
    );
    expect(await fetchJson("http://x", { source: "t", retries: 2 })).toEqual({});
    expect(n).toBe(2);
  });

  it("maps a thrown network error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("fetch failed"))));
    await expect(fetchJson("http://x", { source: "t", retries: 0 })).rejects.toMatchObject({
      kind: "network",
    });
  });

  it("non-JSON 200 body is bad_response", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("<xml/>", { status: 200 }))));
    await expect(fetchJson("http://x", { source: "t", retries: 0 })).rejects.toMatchObject({
      kind: "bad_response",
    });
  });
});

describe("buildQuery", () => {
  it("appends pre-encoded keys raw and encodes the rest", () => {
    const qs = buildQuery({ serviceKey: "a%2Bb%3D", keyword: "해운대", n: 3, skip: undefined }, ["serviceKey"]);
    expect(qs).toBe("serviceKey=a%2Bb%3D&keyword=%ED%95%B4%EC%9A%B4%EB%8C%80&n=3");
  });
});

// ---------- KMA grid ----------
describe("latLngToGrid", () => {
  it("matches KMA reference for Seoul City Hall", () => {
    expect(latLngToGrid(37.5665, 126.978)).toEqual({ nx: 60, ny: 127 });
  });
  it("is deterministic and in range for Busan", () => {
    const g = latLngToGrid(35.1587, 129.1603);
    expect(g).toEqual(latLngToGrid(35.1587, 129.1603));
    expect(g.nx).toBeGreaterThan(90);
    expect(g.nx).toBeLessThan(105);
  });
});

// ---------- normalizers ----------
describe("tourism normalize", () => {
  it("maps real KorService2 fields and joins addr1+addr2", () => {
    const p = tourismInternal.normalize({
      contentid: "126508",
      contenttypeid: "12",
      title: "해운대해수욕장",
      addr1: "부산광역시 해운대구",
      addr2: "우동",
      areacode: "6",
      sigungucode: "16",
      cat1: "A01",
      cat2: "A0101",
      cat3: "A01011100",
      mapx: "129.1603078993",
      mapy: "35.1586975194",
      firstimage: "http://img/1.jpg",
      tel: "051-749-7601",
    });
    expect(p).toMatchObject({
      id: "126508",
      contentTypeId: 12,
      name: "해운대해수욕장",
      address: "부산광역시 해운대구 우동",
      categoryCode: "A01011100",
      latitude: 35.1586975194,
      longitude: 129.1603078993,
      source: "tour-korservice",
    });
  });
  it("drops a row with no id/name via usable()", () => {
    expect(tourismInternal.usable(tourismInternal.normalize({ title: "" }))).toBe(false);
  });
});

describe("visitor normalize", () => {
  it("maps daily visitor fields and pins granularity", () => {
    expect(
      visitorInternal.normalize({
        baseYmd: "20260101",
        signguCd: "26350",
        signguNm: "부산 해운대구",
        touDivNm: "관광객(외지인)",
        touNum: "123456",
      }),
    ).toEqual({
      date: "20260101",
      regionCode: "26350",
      regionName: "부산 해운대구",
      visitorType: "관광객(외지인)",
      visitorCount: 123456,
      granularity: "daily",
      source: "tour-datalab-visitor",
    });
  });
});

describe("accessibility normalize", () => {
  it("keeps only populated facility fields as free text", () => {
    const a = accessInternal.normalize("126508", {
      wheelchair: "가능",
      elevator: "",
      parking: "장애인 전용 주차구역 있음",
      restroom: "   ",
    });
    expect(a.features).toEqual({ wheelchair: "가능", parking: "장애인 전용 주차구역 있음" });
    expect(a.availableFeatures.sort()).toEqual(["parking", "wheelchair"]);
    expect(a.source).toBe("tour-barrier-free");
  });
});

describe("KMA pivot", () => {
  it("pivots category rows into per-slot WeatherData, PCP stays string", () => {
    const rows = [
      { category: "TMP", fcstDate: "20260101", fcstTime: "1500", fcstValue: "12" },
      { category: "POP", fcstDate: "20260101", fcstTime: "1500", fcstValue: "30" },
      { category: "PCP", fcstDate: "20260101", fcstTime: "1500", fcstValue: "강수없음" },
      { category: "SKY", fcstDate: "20260101", fcstTime: "1500", fcstValue: "3" },
      { category: "PTY", fcstDate: "20260101", fcstTime: "1500", fcstValue: "0" },
      { category: "XYZ", fcstDate: "20260101", fcstTime: "1500", fcstValue: "ignore" },
      { category: "TMP", fcstDate: "20260101", fcstTime: "1600", fcstValue: "11" },
    ];
    const out = kmaInternal.pivot(rows, 98, 76);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      forecastDate: "20260101",
      forecastTime: "1500",
      temperature: 12,
      precipitationProbability: 30,
      precipitationAmount: "강수없음",
      skyCondition: 3,
      precipitationType: 0,
      nx: 98,
      ny: 76,
    });
  });
});

describe("kakao keyword normalize", () => {
  it("maps a place doc and rejects one without coordinates", () => {
    expect(
      kakaoInternal.fromKeywordDoc({
        id: "7913306",
        place_name: "해운대해수욕장",
        address_name: "부산 해운대구 우동",
        road_address_name: "",
        category_name: "여행 > 관광,명소 > 해수욕장,해변",
        category_group_code: "AT4",
        phone: "051-749-7612",
        place_url: "http://place.map.kakao.com/7913306",
        x: "129.159854668484",
        y: "35.1585232170784",
      }),
    ).toMatchObject({
      id: "7913306",
      name: "해운대해수욕장",
      roadAddress: null,
      latitude: 35.1585232170784,
      longitude: 129.159854668484,
      provider: "kakao",
    });
    expect(kakaoInternal.fromKeywordDoc({ place_name: "x" })).toBeNull();
  });
});

// ---------- dataPortal envelope ----------
describe("dataPortalGet envelope handling", () => {
  beforeEach(() => vi.stubEnv("TOUR_API_KEY_MAIN", "test%2Bkey%3D"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const envelope = (items: unknown, resultCode = "0000") =>
    new Response(
      JSON.stringify({ response: { header: { resultCode }, body: { items } } }),
      { status: 200 },
    );

  it("returns the item array on success", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(envelope({ item: [{ contentid: "1", title: "A" }] }))));
    const { fetchTourismByArea } = await import("@/lib/api/tour/tourism");
    const out = await fetchTourismByArea({ areaCode: 6 });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("A");
  });

  it("treats NODATA (03) and empty items as []", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(envelope("", "03"))));
    const { searchTourismByKeyword } = await import("@/lib/api/tour/tourism");
    expect(await searchTourismByKeyword("없는곳")).toEqual([]);
  });

  it("maps result code 30 to an auth ExternalApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(envelope({ item: [] }, "30"))));
    const { fetchTourismByArea } = await import("@/lib/api/tour/tourism");
    await expect(fetchTourismByArea({ areaCode: 6 })).rejects.toMatchObject({
      kind: "auth",
    });
  });

  it("wraps a single-object item as a one-element array", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(envelope({ item: { contentid: "9", title: "solo" } }))));
    const { fetchTourismByArea } = await import("@/lib/api/tour/tourism");
    const out = await fetchTourismByArea({ areaCode: 6 });
    expect(out.map((p) => p.name)).toEqual(["solo"]);
  });

  it("propagates ExternalApiError instances", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(envelope({ item: [] }, "30"))));
    const { fetchTourismByArea } = await import("@/lib/api/tour/tourism");
    await expect(fetchTourismByArea({ areaCode: 6 })).rejects.toBeInstanceOf(ExternalApiError);
  });
});
