/**
 * features/travel-state/travelStateService — reads a trip's real data (itinerary,
 * preferences, Experience Profile, weather, route) and computes its Travel
 * State on demand.
 *
 * SERVER ONLY. Not persisted — Travel State is cheap to recompute and nothing
 * yet consumes a stored snapshot (see AGENTS-spec §8). No polling, no GPS: the
 * caller may pass a current location, but this file never invents one.
 */
import "server-only";

import { INDOOR_CONTENT_TYPES, OUTDOOR_CONTENT_TYPES } from "@/features/candidate/candidateGeneration";
import { getTripExperienceProfile } from "@/features/experience/experienceService";
import { listPreferenceVectors } from "@/features/participant/participantService";
import { TripNotFoundError } from "@/features/trip/tripAdminService";
import { coerceItinerary } from "@/features/trip/trip";
import { fetchDrivingRoute, fetchShortTermForecast, fetchTourismDetail } from "@/lib/api";
import { getAdminDb } from "@/lib/firebase/admin";
import type { IndoorOutdoor, ItineraryItem, RouteData, TravelState, WeatherData } from "@/types";

import { buildTravelState, pickNextPendingItem } from "./travelState";

function requireDb() {
  const db = getAdminDb();
  if (!db) {
    throw new Error(
      "Firebase Admin이 설정되지 않았습니다. FIREBASE_SERVICE_ACCOUNT_KEY를 확인해주세요.",
    );
  }
  return db;
}

/**
 * The ONE place a real `Date` is read for Travel State — converts it to the
 * app's plain "YYYY-MM-DD"/"HH:mm" (KST) convention that ItineraryItem dates
 * already use (see types/index.ts), so every pure calculator downstream only
 * ever sees strings, never a Date or a timezone.
 */
function toKstParts(now: Date): { date: string; time: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/**
 * Picks the forecast slot closest in time to (nowDate, nowTime), comparing as
 * naive KST clock minutes (both sides are already KST-implicit — see
 * types/external.ts WeatherData / this module's toKstParts) so a same-day
 * comparison never goes wrong at a day boundary.
 */
function nearestForecastSlot(
  slots: WeatherData[],
  nowDate: string,
  nowTime: string,
): WeatherData | null {
  if (slots.length === 0) return null;
  const toMinutes = (ymd: string, hm: string) =>
    Date.UTC(
      Number(ymd.slice(0, 4)),
      Number(ymd.slice(4, 6)) - 1,
      Number(ymd.slice(6, 8)),
      Number(hm.slice(0, 2)),
      Number(hm.slice(2, 4)),
    ) / 60000;
  const targetMin = toMinutes(nowDate.replaceAll("-", ""), nowTime.replace(":", ""));
  let best = slots[0];
  let bestDiff = Infinity;
  for (const s of slots) {
    const diff = Math.abs(toMinutes(s.forecastDate, s.forecastTime) - targetMin);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  return best;
}

/** `null` on any adapter failure or missing coordinates — never a crash, never a guess. */
async function safeFetchWeather(
  item: ItineraryItem | null,
  nowDate: string,
  nowTime: string,
): Promise<WeatherData | null> {
  if (!item || item.latitude === null || item.longitude === null) return null;
  try {
    const slots = await fetchShortTermForecast({ latitude: item.latitude, longitude: item.longitude });
    return nearestForecastSlot(slots, nowDate, nowTime);
  } catch {
    return null;
  }
}

/**
 * Real indoor/outdoor classification for the next pending item, from
 * TourAPI's own `contenttypeid` (STEP 20) — reuses candidate generation's
 * SAME indoor/outdoor split (`INDOOR_CONTENT_TYPES`/`OUTDOOR_CONTENT_TYPES`),
 * never a second classification drifting out of sync with it. Only possible
 * when the item's `placeId` is `"tour:{contentId}"` (a Kakao-only or
 * unconfirmed item has no such lookup); any adapter failure or ambiguous
 * contentTypeId (neither list) honestly stays "unknown" — never a guess.
 */
async function safeFetchIndoorOutdoor(item: ItineraryItem | null): Promise<IndoorOutdoor | "unknown"> {
  if (!item?.placeId?.startsWith("tour:")) return "unknown";
  try {
    const detail = await fetchTourismDetail(item.placeId.slice("tour:".length), null);
    if (detail?.contentTypeId == null) return "unknown";
    if (INDOOR_CONTENT_TYPES.includes(detail.contentTypeId)) return "indoor";
    if (OUTDOOR_CONTENT_TYPES.includes(detail.contentTypeId)) return "outdoor";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** `null` without both a confirmed destination AND a caller-supplied current location — no GPS is inferred. */
async function safeFetchRoute(
  item: ItineraryItem | null,
  currentLocation: { latitude: number; longitude: number } | null,
): Promise<RouteData | null> {
  if (!item || item.latitude === null || item.longitude === null) return null;
  if (!currentLocation) return null;
  try {
    return await fetchDrivingRoute({
      origin: currentLocation,
      destination: { latitude: item.latitude, longitude: item.longitude },
    });
  } catch {
    return null;
  }
}

export interface GetTravelStateOptions {
  /** Injected for testability / explicit snapshots. Defaults to the real clock. */
  now?: Date;
  /**
   * The traveler's current coordinates, if the caller already has them.
   * Re:Trip does NOT track GPS (out of scope for STEP 7) and never infers this
   * from destination or itinerary data. Omitted/null -> `trafficBurden` stays
   * "unknown" (no route can be computed without a real origin).
   */
  currentLocation?: { latitude: number; longitude: number } | null;
}

/**
 * Computes a trip's Travel State from its current stored data. Recomputed on
 * every call — nothing here is cached in Firestore.
 */
export async function getTripTravelState(
  tripId: string,
  options: GetTravelStateOptions = {},
): Promise<TravelState> {
  const snap = await requireDb().doc(`trips/${tripId}`).get();
  if (!snap.exists) throw new TripNotFoundError();
  const data = snap.data() ?? {};
  const startDate = typeof data.startDate === "string" ? data.startDate : "";
  const itinerary = coerceItinerary(data.itinerary, startDate);

  const now = toKstParts(options.now ?? new Date());
  const nextItem = pickNextPendingItem(itinerary, now.date);
  const currentLocation = options.currentLocation ?? null;

  const [weather, route, experienceProfile, preferenceVectors, indoorOutdoor] = await Promise.all([
    safeFetchWeather(nextItem, now.date, now.time),
    safeFetchRoute(nextItem, currentLocation),
    getTripExperienceProfile(tripId),
    listPreferenceVectors(tripId),
    safeFetchIndoorOutdoor(nextItem),
  ]);

  return buildTravelState({
    tripId,
    now,
    itinerary,
    weather,
    // STEP 20: a real TourAPI-derived classification when the next item is a
    // resolved TourAPI place; "unknown" (never a guess) otherwise — see
    // safeFetchIndoorOutdoor. See computeWeatherRisk.
    weatherContext: { indoorOutdoor },
    route,
    experienceProfile,
    // No visit-category tracking exists yet — always "insufficient data".
    // See computeExperienceDeviation.
    completedCategoryCounts: null,
    preferenceVectors,
  });
}
