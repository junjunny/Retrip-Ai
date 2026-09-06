/**
 * 기상청 단기예보 조회서비스 (data.go.kr, VilageFcstInfoService_2.0) → `WeatherData[]`.
 *
 * Operation: getVilageFcst (동네예보). Response items are one row per
 * (category, fcstDate, fcstTime); this adapter pivots them into one WeatherData
 * per forecast slot. No "it will rain" judgement — raw → normalized only.
 *
 * SERVER ONLY.
 */
import "server-only";

import type { WeatherData } from "@/types";

import { num, str } from "../coerce";
import { dataPortalGet } from "../dataPortal";
import { latLngToGrid } from "./grid";

const SERVICE = "1360000/VilageFcstInfoService_2.0";
const SOURCE = "weather/kma";
// Forecast refreshes 8x/day; ~1h TTL keeps it current without hammering quota.
const REVALIDATE = 60 * 60;

interface RawFcstItem {
  baseDate?: string;
  baseTime?: string;
  category?: string;
  fcstDate?: string;
  fcstTime?: string;
  fcstValue?: string;
  nx?: number | string;
  ny?: number | string;
}

/**
 * getVilageFcst is published at 02/05/08/11/14/17/20/23:10. Pick the most recent
 * base time strictly in the past (KST), stepping back a day if needed.
 */
function latestBaseDateTime(now = new Date()): { baseDate: string; baseTime: string } {
  // KST = UTC+9, no DST
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const slots = [2, 5, 8, 11, 14, 17, 20, 23];
  const hour = kst.getUTCHours();
  const minute = kst.getUTCMinutes();
  let chosen = -1;
  for (const s of slots) {
    // data is available ~10 min after the slot hour
    if (hour > s || (hour === s && minute >= 15)) chosen = s;
  }
  const d = new Date(kst);
  if (chosen === -1) {
    d.setUTCDate(d.getUTCDate() - 1);
    chosen = 23;
  }
  const baseDate = d.toISOString().slice(0, 10).replace(/-/g, "");
  const baseTime = String(chosen).padStart(2, "0") + "00";
  return { baseDate, baseTime };
}

const CATEGORY_MAP: Record<string, keyof WeatherData> = {
  TMP: "temperature",
  POP: "precipitationProbability",
  PCP: "precipitationAmount",
  SKY: "skyCondition",
  PTY: "precipitationType",
  REH: "humidity",
  WSD: "windSpeed",
};

function pivot(items: RawFcstItem[], nx: number, ny: number): WeatherData[] {
  const bySlot = new Map<string, WeatherData>();
  for (const it of items) {
    const fcstDate = str(it.fcstDate);
    const fcstTime = str(it.fcstTime);
    const category = str(it.category);
    if (!fcstDate || !fcstTime || !category) continue;
    const target = CATEGORY_MAP[category];
    if (!target) continue;

    const key = `${fcstDate}-${fcstTime}`;
    let slot = bySlot.get(key);
    if (!slot) {
      slot = {
        forecastDate: fcstDate,
        forecastTime: fcstTime,
        nx,
        ny,
        temperature: null,
        precipitationProbability: null,
        precipitationAmount: null,
        skyCondition: null,
        precipitationType: null,
        humidity: null,
        windSpeed: null,
        source: "kma-vilagefcst",
      };
      bySlot.set(key, slot);
    }
    // PCP stays a string (KMA sends "강수없음" / "1.0mm" / "30.0~50.0mm"); the rest are numeric
    if (target === "precipitationAmount") {
      slot.precipitationAmount = str(it.fcstValue);
    } else {
      (slot[target] as number | null) = num(it.fcstValue);
    }
  }
  return [...bySlot.values()].sort((a, b) =>
    `${a.forecastDate}${a.forecastTime}`.localeCompare(`${b.forecastDate}${b.forecastTime}`),
  );
}

export interface VilageFcstParams {
  latitude: number;
  longitude: number;
  /** cap rows fetched from the API (each slot has ~12 category rows) */
  numOfRows?: number;
}

export async function fetchShortTermForecast(
  p: VilageFcstParams,
): Promise<WeatherData[]> {
  const { nx, ny } = latLngToGrid(p.latitude, p.longitude);
  const { baseDate, baseTime } = latestBaseDateTime();
  const items = await dataPortalGet<RawFcstItem>(SERVICE, "getVilageFcst", {
    dataType: "JSON",
    base_date: baseDate,
    base_time: baseTime,
    nx,
    ny,
    numOfRows: p.numOfRows ?? 300,
    pageNo: 1,
  }, { source: SOURCE, revalidateSeconds: REVALIDATE });
  return pivot(items, nx, ny);
}

export const _internal = { pivot, latestBaseDateTime };
