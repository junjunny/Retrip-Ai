/**
 * 한국관광공사 무장애 여행 정보_GW (data.go.kr 15101897) → `AccessibilityData`.
 *
 * Operation (KorService2):
 *   detailWithTour2   무장애 편의시설 상세 (contentId 단위)
 *
 * The API returns Korean free-text descriptions per facility field (wheelchair,
 * elevator, parking, restroom, braileblock, audioguide, …). This adapter keeps
 * them verbatim and lists which fields were populated. It does NOT estimate
 * "이동 난이도" or "피로도" — that is Travel State Engine's job (§3-C).
 *
 * SERVER ONLY.
 */
import "server-only";

import type { AccessibilityData } from "@/types";

import { str } from "../coerce";
import { dataPortalGet } from "../dataPortal";

const SERVICE = "B551011/KorService2";
const SOURCE = "tour/accessibility";
const MOBILE = { MobileOS: "ETC", MobileApp: "RetripAI" };
const REVALIDATE = 60 * 60 * 6;

// The facility fields detailWithTour2 returns (besides contentid/contenttypeid).
const FACILITY_FIELDS = [
  "wheelchair",
  "exit",
  "elevator",
  "parking",
  "restroom",
  "route",
  "stroller",
  "lactationroom",
  "braileblock",
  "audioguide",
  "guidehuman",
  "bigprint",
  "guidedog",
  "helpdog",
  "hearinghandicapetc",
  "signguide",
  "videoguide",
  "blindhandicapetc",
  "auditorium",
  "publictransport",
  "promotion",
  "handicapetc",
] as const;

type RawWithItem = Record<string, unknown>;

function normalize(contentId: string, raw: RawWithItem): AccessibilityData {
  const features: Record<string, string> = {};
  for (const field of FACILITY_FIELDS) {
    const v = str(raw[field]);
    if (v) features[field] = v;
  }
  return {
    contentId,
    features,
    availableFeatures: Object.keys(features),
    source: "tour-barrier-free",
  };
}

/**
 * Barrier-free detail for one tourism content. Returns `null` when the content
 * has no barrier-free record (NODATA), which is normal — not every place has one.
 */
export async function fetchAccessibility(
  contentId: string | number,
): Promise<AccessibilityData | null> {
  const id = String(contentId);
  const items = await dataPortalGet<RawWithItem>(SERVICE, "detailWithTour2", {
    ...MOBILE,
    contentId: id,
    numOfRows: 1,
    pageNo: 1,
  }, { source: SOURCE, revalidateSeconds: REVALIDATE });
  if (items.length === 0) return null;
  return normalize(id, items[0]);
}

export const _internal = { normalize, FACILITY_FIELDS };
