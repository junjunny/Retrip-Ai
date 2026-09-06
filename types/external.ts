/**
 * Re:Trip domain models for external data sources (PHASE 3-A).
 *
 * These are the ONLY shapes downstream code (Experience Profile, Travel State
 * Engine, Re:Plan) may consume. Raw TourAPI / KMA / Kakao response objects never
 * cross the adapter boundary. Every field here maps to a field the upstream API
 * actually returns — nothing is inferred or computed beyond unit/format
 * normalization.
 */

/** Tourism content (관광지·문화시설·음식점 등) — 한국관광공사 국문 관광정보. */
export interface TourismPlace {
  /** contentid */
  id: string;
  /** contenttypeid (12 관광지, 14 문화시설, 15 축제공연행사, 28 레포츠, 32 숙박, 38 쇼핑, 39 음식점) */
  contentTypeId: number | null;
  /** title */
  name: string;
  /** addr1 (+ addr2 appended when present) */
  address: string | null;
  areaCode: string | null;
  sigunguCode: string | null;
  /** most specific of cat3 / cat2 / cat1 */
  categoryCode: string | null;
  /** mapy (WGS84) */
  latitude: number | null;
  /** mapx (WGS84) */
  longitude: number | null;
  /** firstimage */
  imageUrl: string | null;
  tel: string | null;
  source: "tour-korservice";
}

/**
 * Regional visitor volume — 한국관광공사 빅데이터 지역별 방문자수.
 * KT + SKT mobile-data derived. **Daily unique-visitor counts, not real-time
 * crowding.** A visitor staying 3 days is counted 3 times.
 */
export interface VisitorData {
  /** baseYmd — "YYYYMMDD" as provided by the API */
  date: string;
  /** signguCd (기초지자체) or mreaCd (광역시도) */
  regionCode: string | null;
  regionName: string | null;
  /** touDivNm — e.g. 관광객 / 현지인(외지인 제외) etc., as provided */
  visitorType: string | null;
  /** touNum */
  visitorCount: number | null;
  /** the API's aggregation unit; fixed, documents that this is not live data */
  granularity: "daily";
  source: "tour-datalab-visitor";
}

/**
 * Barrier-free facility info for a tourism content — 한국관광공사 무장애 여행 정보.
 * `features` holds the raw Korean free-text descriptions the API returns, keyed
 * by facility field. `availableFeatures` is just the keys that had a non-empty
 * value — no scoring, no difficulty estimate (that is Travel State Engine's job).
 */
export interface AccessibilityData {
  /** contentid */
  contentId: string;
  features: Record<string, string>;
  availableFeatures: string[];
  source: "tour-barrier-free";
}

/**
 * One short-term forecast timeslot — 기상청 단기예보(getVilageFcst).
 * Values are pivoted from the API's per-category rows for a single (date, time).
 */
export interface WeatherData {
  /** fcstDate — "YYYYMMDD" */
  forecastDate: string;
  /** fcstTime — "HHmm" */
  forecastTime: string;
  nx: number;
  ny: number;
  /** TMP, °C */
  temperature: number | null;
  /** POP, % */
  precipitationProbability: number | null;
  /** PCP — the API returns free text ("강수없음", "1.0mm", "30.0~50.0mm"); preserved verbatim */
  precipitationAmount: string | null;
  /** SKY code: 1 맑음, 3 구름많음, 4 흐림 */
  skyCondition: number | null;
  /** PTY code: 0 없음, 1 비, 2 비/눈, 3 눈, 4 소나기 */
  precipitationType: number | null;
  /** REH, % */
  humidity: number | null;
  /** WSD, m/s */
  windSpeed: number | null;
  source: "kma-vilagefcst";
}

/** A resolved place / coordinate — Kakao Local. */
export interface PlaceLocation {
  /** Kakao place id (keyword search) or null (address-only result) */
  id: string | null;
  name: string;
  address: string | null;
  roadAddress: string | null;
  category: string | null;
  categoryGroupCode: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
  url: string | null;
  provider: "kakao";
}

/**
 * A driving route between two points — Kakao Mobility Directions.
 * `durationSeconds` is traffic-aware for priority RECOMMEND. Traffic state codes
 * are passed through raw (0 unknown, 1 원활, 2 서행, 3 지체, 4 정체) — not labelled
 * or turned into a "burden" number here.
 */
export interface RouteData {
  distanceMeters: number;
  durationSeconds: number;
  taxiFare: number | null;
  tollFare: number | null;
  /** summary.priority echoed back by the API */
  priority: string;
  trafficSegments: {
    name: string;
    distanceMeters: number;
    durationSeconds: number;
    /** road.traffic_speed, km/h */
    speedKmh: number | null;
    /** road.traffic_state, raw code */
    trafficState: number | null;
  }[];
  /** when Re:Trip fetched this (the API has no such field) */
  fetchedAt: string;
  provider: "kakao-mobility";
}
