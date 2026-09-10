/**
 * KTO TourAPI `areaCode` ↔ 행정표준코드 시도코드. Minimal lookup layer.
 *
 * The two systems are DIFFERENT (부산: TourAPI "6" vs 행정표준 "26"). Never compare
 * the raw numbers — go through here. 시군구 codes are the 행정표준 5-digit codes
 * (prefix = 시도 code); the visitor API returns those directly.
 */
export interface KrSido {
  /** TourAPI areaCode */
  ktoAreaCode: string;
  /** 행정표준코드 2-digit 시도 code (visitor / statistics APIs) */
  statSidoCode: string;
  name: string;
}

const SIDO: readonly KrSido[] = [
  { ktoAreaCode: "1", statSidoCode: "11", name: "서울특별시" },
  { ktoAreaCode: "2", statSidoCode: "28", name: "인천광역시" },
  { ktoAreaCode: "3", statSidoCode: "30", name: "대전광역시" },
  { ktoAreaCode: "4", statSidoCode: "27", name: "대구광역시" },
  { ktoAreaCode: "5", statSidoCode: "29", name: "광주광역시" },
  { ktoAreaCode: "6", statSidoCode: "26", name: "부산광역시" },
  { ktoAreaCode: "7", statSidoCode: "31", name: "울산광역시" },
  { ktoAreaCode: "8", statSidoCode: "36", name: "세종특별자치시" },
  { ktoAreaCode: "31", statSidoCode: "41", name: "경기도" },
  { ktoAreaCode: "32", statSidoCode: "51", name: "강원특별자치도" },
  { ktoAreaCode: "33", statSidoCode: "43", name: "충청북도" },
  { ktoAreaCode: "34", statSidoCode: "44", name: "충청남도" },
  { ktoAreaCode: "35", statSidoCode: "47", name: "경상북도" },
  { ktoAreaCode: "36", statSidoCode: "48", name: "경상남도" },
  { ktoAreaCode: "37", statSidoCode: "52", name: "전북특별자치도" },
  { ktoAreaCode: "38", statSidoCode: "46", name: "전라남도" },
  { ktoAreaCode: "39", statSidoCode: "50", name: "제주특별자치도" },
] as const;

export function ktoAreaToStatSido(ktoAreaCode: string | number): KrSido | null {
  return SIDO.find((s) => s.ktoAreaCode === String(ktoAreaCode)) ?? null;
}

export function statSidoToKtoArea(statSidoCode: string | number): KrSido | null {
  const two = String(statSidoCode).slice(0, 2);
  return SIDO.find((s) => s.statSidoCode === two) ?? null;
}

export const KR_SIDO = SIDO;
