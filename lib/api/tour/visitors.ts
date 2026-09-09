/**
 * 한국관광공사 빅데이터 지역별 방문자수_GW (data.go.kr 15101972) → `VisitorData[]`.
 *
 * Operations (DataLabService):
 *   metcoRegnVisitrDDList   광역시도별 일자별 방문자 수 (17개 시도 전체 반환)
 *   locgoRegnVisitrDDList   시군구별 일자별 방문자 수 (전 시군구 반환)
 *
 * Both operations take ONLY a date range — no region-filter param (a region
 * arg returns INVALID_REQUEST_PARAMETER_ERROR). Callers filter client-side.
 *
 * The data is **daily unique-visitor counts** from mobile-carrier data — this
 * adapter never calls it "real-time crowding". touDivNm splits 현지인(a) vs
 * 외지인(b); 외지인 ≈ tourists from outside the region.
 *
 * SERVER ONLY.
 */
import "server-only";

import type { VisitorData } from "@/types";

import { num, str } from "../coerce";
import { dataPortalGet } from "../dataPortal";

const SERVICE = "B551011/DataLabService";
const SOURCE = "tour/visitors";
const MOBILE = { MobileOS: "ETC", MobileApp: "RetripAI" };
// Daily aggregate — refresh at most once a day.
const REVALIDATE = 60 * 60 * 12;

type RawVisitorItem = Record<string, unknown>;

function normalize(raw: RawVisitorItem): VisitorData {
  return {
    date: str(raw.baseYmd) ?? "",
    // metco -> areaCode/areaNm ; locgo -> signguCode/signguNm
    regionCode: str(raw.signguCode) ?? str(raw.areaCode) ?? null,
    regionName: str(raw.signguNm) ?? str(raw.areaNm) ?? null,
    dayOfWeek: str(raw.daywkDivNm),
    visitorType: str(raw.touDivNm) ?? str(raw.touDivCd) ?? null,
    visitorCount: num(raw.touNum),
    granularity: "daily",
    source: "tour-datalab-visitor",
  };
}

const usable = (v: VisitorData) => v.date !== "";

export interface VisitorQuery {
  /** "YYYYMMDD" */
  startYmd: string;
  /** "YYYYMMDD" */
  endYmd: string;
  /** keep only this region code (client-side filter; the API returns all) */
  regionCode?: string | number;
  numOfRows?: number;
  pageNo?: number;
}

async function fetchVisitors(
  operation: "metcoRegnVisitrDDList" | "locgoRegnVisitrDDList",
  q: VisitorQuery,
): Promise<VisitorData[]> {
  const items = await dataPortalGet<RawVisitorItem>(SERVICE, operation, {
    ...MOBILE,
    startYmd: q.startYmd,
    endYmd: q.endYmd,
    numOfRows: q.numOfRows ?? 1000,
    pageNo: q.pageNo ?? 1,
  }, { source: SOURCE, revalidateSeconds: REVALIDATE });

  let out = items.map(normalize).filter(usable);
  if (q.regionCode !== undefined) {
    const code = String(q.regionCode);
    out = out.filter((v) => v.regionCode === code);
  }
  return out;
}

/** Metro-level (시도) daily visitor counts. Pass `regionCode` (e.g. "26" 부산) to filter. */
export function fetchMetroVisitors(q: VisitorQuery): Promise<VisitorData[]> {
  return fetchVisitors("metcoRegnVisitrDDList", q);
}

/** District-level (시군구) daily visitor counts. Pass `regionCode` (e.g. "26350" 해운대구) to filter. */
export function fetchDistrictVisitors(q: VisitorQuery): Promise<VisitorData[]> {
  return fetchVisitors("locgoRegnVisitrDDList", q);
}

export const _internal = { normalize };
