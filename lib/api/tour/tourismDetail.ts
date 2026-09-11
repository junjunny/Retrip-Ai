/**
 * 한국관광공사 국문 관광정보 서비스_GW — detailCommon2 (+ detailIntro2 for a
 * festival's dates) → `TourismDetail`.
 *
 * Verified against real responses: detailCommon2 rejects the documented
 * *YN flags (INVALID_REQUEST_PARAMETER_ERROR) and detailCommon2 rejects
 * `contentTypeId` too — `{ contentId }` alone returns the full record
 * (overview, firstimage, …) on this API version. detailIntro2 DOES require
 * `contentTypeId` (the field set differs per type); for contentTypeId 15
 * (축제공연행사) it returns eventstartdate/eventenddate ("YYYYMMDD").
 *
 * "지금 진행 중" is NOT decided here — this adapter only returns the raw
 * dates; features/replan/explanation's deterministic code compares them
 * against `now`.
 *
 * SERVER ONLY.
 */
import "server-only";

import type { TourismDetail } from "@/types";

import { str } from "../coerce";
import { dataPortalGet } from "../dataPortal";

const SERVICE = "B551011/KorService2";
const SOURCE = "tour/tourismDetail";
const MOBILE = { MobileOS: "ETC", MobileApp: "RetripAI" };
// Detail content (description, event dates) changes about as rarely as the listing itself.
const REVALIDATE = 60 * 60 * 6;
/** the only contentTypeId detailIntro2 exposes event dates for. */
const FESTIVAL_CONTENT_TYPE_ID = 15;

interface RawCommonItem {
  contentid?: string;
  overview?: string;
  firstimage?: string;
}
interface RawIntroItem {
  eventstartdate?: string;
  eventenddate?: string;
}

/**
 * Fetches a content's description + image, and (only for a festival) its
 * real event dates. `null` fields mean the API had nothing there — never
 * invented. Both calls are independent; a detailIntro2 failure still returns
 * the detailCommon2 data.
 */
export async function fetchTourismDetail(
  contentId: string,
  contentTypeId: number | null,
): Promise<TourismDetail | null> {
  const common = await dataPortalGet<RawCommonItem>(
    SERVICE,
    "detailCommon2",
    { ...MOBILE, contentId, numOfRows: 1, pageNo: 1 },
    { source: SOURCE, revalidateSeconds: REVALIDATE },
  );
  const c = common[0];
  if (!c) return null;

  let event: TourismDetail["event"] = null;
  if (contentTypeId === FESTIVAL_CONTENT_TYPE_ID) {
    const intro = await dataPortalGet<RawIntroItem>(
      SERVICE,
      "detailIntro2",
      { ...MOBILE, contentId, contentTypeId, numOfRows: 1, pageNo: 1 },
      { source: SOURCE, revalidateSeconds: REVALIDATE },
    ).catch(() => [] as RawIntroItem[]);
    const startDate = str(intro[0]?.eventstartdate);
    const endDate = str(intro[0]?.eventenddate);
    if (startDate && endDate) event = { startDate, endDate };
  }

  return {
    id: str(c.contentid) ?? contentId,
    description: str(c.overview),
    imageUrl: str(c.firstimage),
    event,
    source: "tour-korservice",
  };
}
