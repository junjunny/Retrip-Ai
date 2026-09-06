/**
 * 한국관광공사 국문 관광정보 서비스_GW (data.go.kr 15101578) → `TourismPlace[]`.
 *
 * Operations used (KorService2, stable since 2016):
 *   areaBasedList2      지역기반 관광정보
 *   searchKeyword2      키워드 검색
 *   locationBasedList2  위치기반 관광정보
 *
 * SERVER ONLY. This adapter only fetches + normalizes — it does NOT decide which
 * place is a good alternative (that is Re:Plan's job).
 */
import "server-only";

import type { TourismPlace } from "@/types";

import { num, str } from "../coerce";
import { dataPortalGet } from "../dataPortal";

const SERVICE = "B551011/KorService2";
const SOURCE = "tour/tourism";
const MOBILE = { MobileOS: "ETC", MobileApp: "RetripAI" };
// Tourism content is near-static; a long TTL keeps quota use minimal.
const REVALIDATE = 60 * 60 * 6;

type RawTourItem = Record<string, unknown>;

function normalize(raw: RawTourItem): TourismPlace {
  const addr1 = str(raw.addr1);
  const addr2 = str(raw.addr2);
  return {
    id: str(raw.contentid) ?? "",
    contentTypeId: num(raw.contenttypeid),
    name: str(raw.title) ?? "",
    address: addr1 ? (addr2 ? `${addr1} ${addr2}` : addr1) : null,
    areaCode: str(raw.areacode),
    sigunguCode: str(raw.sigungucode),
    categoryCode: str(raw.cat3) ?? str(raw.cat2) ?? str(raw.cat1),
    latitude: num(raw.mapy),
    longitude: num(raw.mapx),
    imageUrl: str(raw.firstimage),
    tel: str(raw.tel),
    source: "tour-korservice",
  };
}

/** drop rows with no id or name — a place we can't reference is not useful */
const usable = (p: TourismPlace) => p.id !== "" && p.name !== "";

export interface AreaBasedParams {
  areaCode: number | string;
  sigunguCode?: number | string;
  /** 12 관광지, 14 문화시설, 15 축제, 28 레포츠, 32 숙박, 38 쇼핑, 39 음식점 */
  contentTypeId?: number;
  /** A 제목순, C 수정일순, O/Q 대표이미지순 (distance for locationBased) */
  arrange?: string;
  numOfRows?: number;
  pageNo?: number;
}

export async function fetchTourismByArea(p: AreaBasedParams): Promise<TourismPlace[]> {
  const items = await dataPortalGet<RawTourItem>(SERVICE, "areaBasedList2", {
    ...MOBILE,
    arrange: p.arrange ?? "A",
    areaCode: p.areaCode,
    sigunguCode: p.sigunguCode,
    contentTypeId: p.contentTypeId,
    numOfRows: p.numOfRows ?? 20,
    pageNo: p.pageNo ?? 1,
  }, { source: SOURCE, revalidateSeconds: REVALIDATE });
  return items.map(normalize).filter(usable);
}

export async function searchTourismByKeyword(
  keyword: string,
  p: { areaCode?: number | string; contentTypeId?: number; numOfRows?: number; pageNo?: number } = {},
): Promise<TourismPlace[]> {
  if (!keyword.trim()) return [];
  const items = await dataPortalGet<RawTourItem>(SERVICE, "searchKeyword2", {
    ...MOBILE,
    arrange: "A",
    keyword: keyword.trim(),
    areaCode: p.areaCode,
    contentTypeId: p.contentTypeId,
    numOfRows: p.numOfRows ?? 20,
    pageNo: p.pageNo ?? 1,
  }, { source: SOURCE, revalidateSeconds: REVALIDATE });
  return items.map(normalize).filter(usable);
}

export async function fetchTourismNearby(p: {
  longitude: number;
  latitude: number;
  radiusMeters?: number;
  contentTypeId?: number;
  numOfRows?: number;
  pageNo?: number;
}): Promise<TourismPlace[]> {
  const items = await dataPortalGet<RawTourItem>(SERVICE, "locationBasedList2", {
    ...MOBILE,
    arrange: "E", // distance
    mapX: p.longitude,
    mapY: p.latitude,
    radius: Math.min(p.radiusMeters ?? 2000, 20000),
    contentTypeId: p.contentTypeId,
    numOfRows: p.numOfRows ?? 20,
    pageNo: p.pageNo ?? 1,
  }, { source: SOURCE, revalidateSeconds: REVALIDATE });
  return items.map(normalize).filter(usable);
}

export const _internal = { normalize, usable };
