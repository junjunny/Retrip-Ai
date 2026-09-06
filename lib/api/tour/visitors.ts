/**
 * 한국관광공사 빅데이터 지역별 방문자수_GW (data.go.kr 15101972) → `VisitorData[]`.
 *
 * Operations (DataLabService):
 *   metcoRegnVisitrDDList   광역시도별 일자별 방문자 수
 *   locgoRegnVisitrDDList   기초지자체별 일자별 방문자 수
 *
 * The data is **daily unique-visitor counts** from KT/SKT mobile data — this
 * adapter never calls it "real-time crowding". It only normalizes the numbers.
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
    regionCode: str(raw.signguCd) ?? str(raw.mreaCd) ?? null,
    regionName: str(raw.signguNm) ?? str(raw.mreaNm) ?? null,
    visitorType: str(raw.touDivNm) ?? str(raw.touDivCd) ?? null,
    visitorCount: num(raw.touNum),
    granularity: "daily",
    source: "tour-datalab-visitor",
  };
}

const usable = (v: VisitorData) => v.date !== "";

interface DateRange {
  /** "YYYYMMDD" */
  startYmd: string;
  /** "YYYYMMDD" */
  endYmd: string;
  numOfRows?: number;
  pageNo?: number;
}

/** Metro-level (시도) daily visitor counts. `areaCd` is the 광역시도 code. */
export async function fetchMetroVisitors(
  areaCd: number | string,
  range: DateRange,
): Promise<VisitorData[]> {
  const items = await dataPortalGet<RawVisitorItem>(SERVICE, "metcoRegnVisitrDDList", {
    ...MOBILE,
    startYmd: range.startYmd,
    endYmd: range.endYmd,
    areaCd,
    numOfRows: range.numOfRows ?? 100,
    pageNo: range.pageNo ?? 1,
  }, { source: SOURCE, revalidateSeconds: REVALIDATE });
  return items.map(normalize).filter(usable);
}

/** District-level (시군구) daily visitor counts. */
export async function fetchDistrictVisitors(
  areaCd: number | string,
  signguCd: number | string,
  range: DateRange,
): Promise<VisitorData[]> {
  const items = await dataPortalGet<RawVisitorItem>(SERVICE, "locgoRegnVisitrDDList", {
    ...MOBILE,
    startYmd: range.startYmd,
    endYmd: range.endYmd,
    areaCd,
    signguCd,
    numOfRows: range.numOfRows ?? 100,
    pageNo: range.pageNo ?? 1,
  }, { source: SOURCE, revalidateSeconds: REVALIDATE });
  return items.map(normalize).filter(usable);
}

export const _internal = { normalize };
