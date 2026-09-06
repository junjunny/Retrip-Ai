/**
 * External data adapters. Every function here returns a Re:Trip domain model
 * (see `types/external.ts`) — never a raw TourAPI / KMA / Kakao response.
 *
 * All of these are SERVER ONLY (they read API keys). Downstream phases
 * (Experience Profile, Travel State Engine, Re:Plan) consume the domain models,
 * not these functions' internals.
 */
export { ExternalApiError } from "./errors";
export type { ExternalApiErrorKind } from "./errors";

// 한국관광공사 국문 관광정보
export {
  fetchTourismByArea,
  searchTourismByKeyword,
  fetchTourismNearby,
} from "./tour/tourism";

// 한국관광공사 지역별 방문자수
export { fetchMetroVisitors, fetchDistrictVisitors } from "./tour/visitors";

// 한국관광공사 무장애 여행 정보
export { fetchAccessibility } from "./tour/accessibility";

// 기상청 단기예보
export { fetchShortTermForecast } from "./weather/kma";
export { latLngToGrid } from "./weather/grid";

// Kakao Local + Mobility
export {
  searchPlacesByKeyword,
  searchAddress,
  coordToAddress,
} from "./kakao/place";
export { fetchDrivingRoute } from "./kakao/route";
