/**
 * features/travel-state/weatherOutlook — pure, browser-safe DISPLAY labels
 * for a real KMA forecast (STEP 22 §5/§6). This is presentational only: it
 * reuses the SAME PTY/SKY code semantics `computeWeatherRisk` already relies
 * on (features/travel-state/travelState.ts), never a second risk judgment
 * and never fed back into scoring/candidate generation. Its only job is
 * turning raw `WeatherData` slots into a short Korean label ("맑음"/"소나기"/
 * …) for the pre-trip "날짜별 예상 날씨" summary.
 *
 * `am`/`pm` come back `null` whenever no real forecast slot exists for that
 * half of that date — either the date is outside KMA's ~3-day getVilageFcst
 * window or in the past. The caller shows an honest "아직 정확한 예보를 확인할
 * 수 없어요" instead of inventing a value — never fabricated weather.
 */
import type { WeatherData } from "@/types";

export type ForecastOutlookKind = "clear" | "cloudy" | "rain" | "snow";

export interface ForecastOutlook {
  kind: ForecastOutlookKind;
  label: string;
}

export interface DailyOutlook {
  /** "YYYY-MM-DD", matching ItineraryItem.date. */
  date: string;
  am: ForecastOutlook | null;
  pm: ForecastOutlook | null;
}

const SEVERITY: Record<ForecastOutlookKind, number> = { clear: 0, cloudy: 1, snow: 2, rain: 3 };

/** Same PTY codes as `computeWeatherRisk`'s `PRECIPITATION_CODES` (1/2/4 = rain-family, 3 = snow). */
export function summarizeForecastSlot(w: WeatherData): ForecastOutlook {
  if (w.precipitationType === 3) return { kind: "snow", label: "눈" };
  if (w.precipitationType === 1 || w.precipitationType === 2) return { kind: "rain", label: "비" };
  if (w.precipitationType === 4) return { kind: "rain", label: "소나기" };
  if ((w.precipitationProbability ?? 0) >= 60) return { kind: "rain", label: "비 가능" };
  if (w.skyCondition === 4) return { kind: "cloudy", label: "흐림" };
  if (w.skyCondition === 3) return { kind: "cloudy", label: "구름 많음" };
  return { kind: "clear", label: "맑음" };
}

/**
 * Buckets forecast slots by date into AM (<12:00) / PM (>=12:00), picking
 * the MOST SEVERE outlook within each half — a real "오후 소나기 가능" slot is
 * never averaged away by a calmer morning reading. One entry per `dates`
 * item, in the same order.
 */
export function buildDailyOutlook(slots: readonly WeatherData[], dates: readonly string[]): DailyOutlook[] {
  return dates.map((date) => {
    const kmaDate = date.replaceAll("-", "");
    const forDate = slots.filter((s) => s.forecastDate === kmaDate);
    return {
      date,
      am: pickWorst(forDate.filter((s) => Number(s.forecastTime) < 1200)),
      pm: pickWorst(forDate.filter((s) => Number(s.forecastTime) >= 1200)),
    };
  });
}

function pickWorst(slots: WeatherData[]): ForecastOutlook | null {
  if (slots.length === 0) return null;
  return slots
    .map(summarizeForecastSlot)
    .reduce((worst, cur) => (SEVERITY[cur.kind] > SEVERITY[worst.kind] ? cur : worst));
}
