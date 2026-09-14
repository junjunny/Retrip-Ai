/**
 * features/demo/demoService — turns a `DemoScenario` into a REAL trip.
 *
 * 1. `createTrip` (the ordinary client trip service — same function
 *    `/trip/create` uses) with the scenario's schedule anchored to "now"
 *    and its `tripPreference` (a real, plausible group preference, not a
 *    scoring shortcut — see demoScenarios.ts).
 * 2. Resolves + confirms each item's real place through the exact SAME
 *    `/resolve` + itinerary `PATCH` endpoints `PlaceConfirmSheet` uses for a
 *    human clicking "이 장소로 선택" — sequential, one place at a time, so
 *    the demo respects the per-trip resolve rate limit exactly like a real
 *    session would (see app/api/trip/[tripId]/resolve/route.ts). This is
 *    automatically picking the top real search hit, the same outcome a
 *    human would get by picking the first suggested candidate — an
 *    unresolved place (e.g. a generic placeholder name with no real match)
 *    is left honestly unconfirmed, same as the real flow. A few items
 *    (e.g. "전주 숙소") carry a real `resolveAddress` instead and resolve by
 *    address (`/resolve?addr=`) rather than by name.
 * 3. (STEP 22 §4) Never pre-completes anything. A demo trip always opens
 *    with item 1 as "current" — the exact same generic journey UI a brand
 *    new ordinary trip already shows for its own first item (see
 *    `DEMO_STARTING_ORDER`'s doc comment). Earlier steps (through STEP 17-21)
 *    pre-completed every item up to the trigger so a judge landed "a few
 *    steps into the day" — that shortcut is exactly what made a demo trip
 *    look like it started mid-itinerary (e.g. 부산 opening on "수변최고돼지
 *    국밥"), so STEP 22 removes it: the traveler now walks every real
 *    "완료 -> 다음" step themselves, from the very first stop.
 *
 * 4. (STEP 22) Seeds the scenario's 3 real travelers through the exact SAME
 *    `/api/trip/{tripId}/submit` endpoint a human joining via the invite
 *    link uses — so `groupSatisfaction` scoring (features/scoring/scoring.ts)
 *    reads their real, genuinely different preference vectors via
 *    `listPreferenceVectors`, not a single hand-picked aggregate. Runs
 *    concurrently with place resolution (independent of it) so it adds no
 *    wall-clock time in the common case.
 *
 * Client-side only (uses the browser Firestore SDK + `fetch`), same trust
 * boundary as trip creation and place confirmation already have.
 */
import { createTrip, getTrip } from "@/features/trip";
import { nowKst } from "@/lib/kst";

import { buildDemoItinerary, type DemoScenario, type DemoTraveler } from "./demoScenarios";

export interface DemoStartProgress {
  resolved: number;
  total: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Stay comfortably clear of the per-trip resolve cooldown (1s) — see lib/rateLimit.ts.
const RESOLVE_SPACING_MS = 1_100;

/** Builds the scenario's itinerary, creates the trip, resolves every place, and seeds its 3 real travelers. Returns the new tripId — item 1 is current, nothing is pre-completed (STEP 22 §4). */
export async function startDemo(
  scenario: DemoScenario,
  onProgress?: (p: DemoStartProgress) => void,
): Promise<string> {
  const built = buildDemoItinerary(scenario, nowKst());
  const dates = [...new Set(built.map((i) => i.date))].sort();

  const tripId = await createTrip({
    title: scenario.title,
    destination: scenario.destination,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    itinerary: built.map((i) => ({
      date: i.date,
      time: i.time,
      placeName: i.placeName,
      scheduleType: i.scheduleType,
    })),
    tripPreference: scenario.tripPreference,
    demoScenarioId: scenario.id,
  });

  // Fire-and-forget-until-the-end: real participant seeding doesn't depend on
  // place resolution, so it runs alongside it (see module doc §4).
  const travelersSeeded = Promise.all(scenario.travelers.map((t) => submitDemoTraveler(tripId, t)));

  const trip = await getTrip(tripId);
  if (!trip) return tripId; // defensive — should never happen right after creation

  const total = trip.itinerary.length;
  // Bias each search near the previously-resolved stop (nothing for the
  // first item) — the same `lat`/`lng` hint PlaceConfirmSheet could pass,
  // just threaded across the sequence instead of coming from a map click.
  // Without it, a common chain name (e.g. "베테랑 칼국수") can resolve to a
  // same-named branch in a completely different city.
  let anchor: { latitude: number; longitude: number } | null = null;
  for (let i = 0; i < total; i++) {
    const item = trip.itinerary[i];
    // `built` and `trip.itinerary` share the same order (buildDemoItinerary
    // anchors every same-day item's real time so the sort it feeds into can
    // never reshuffle them — see that function's doc comment), so index i
    // in both arrays is the same scenario item.
    onProgress?.({ resolved: i, total });
    const resolved = await resolveAndConfirm(tripId, item.order, built[i], anchor);
    if (resolved) anchor = resolved;
    if (i < total - 1) await sleep(RESOLVE_SPACING_MS);
  }
  onProgress?.({ resolved: total, total });

  await travelersSeeded;
  return tripId;
}

/**
 * Creates one real participant + preference document via the ordinary
 * `/submit` endpoint (the same one `/trip/{tripId}/join` posts to) — best
 * effort, like `markCompleted`: a traveler who fails to seed just never
 * joined, the demo still proceeds (the group's `tripPreference` was already
 * computed statically from the scenario's own vectors — see
 * demoScenarios.ts — so a seeding hiccup never blanks out Section C).
 */
async function submitDemoTraveler(tripId: string, traveler: DemoTraveler): Promise<void> {
  try {
    await fetch(`/api/trip/${tripId}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nickname: traveler.name,
        preferences: traveler.preferences,
        pace: traveler.pace,
        indoorOutdoor: traveler.indoorOutdoor,
      }),
    });
  } catch {
    // best-effort — see doc comment above.
  }
}

async function resolveAndConfirm(
  tripId: string,
  order: number,
  item: { placeName: string; resolveAddress?: string },
  anchor: { latitude: number; longitude: number } | null,
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const params = item.resolveAddress
      ? new URLSearchParams({ addr: item.resolveAddress })
      : new URLSearchParams({ q: item.placeName });
    if (!item.resolveAddress && anchor) {
      params.set("lat", String(anchor.latitude));
      params.set("lng", String(anchor.longitude));
    }
    const res = await fetch(`/api/trip/${tripId}/resolve?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const place = data.place;
    if (!place || place.verificationStatus === "unresolved" || place.latitude == null) return null;

    // Same PATCH shape PlaceConfirmSheet sends for "이 장소로 선택" — the
    // endpoint always marks a submitted place confirmed (see its doc
    // comment), matching a human picking this exact top result.
    await fetch(`/api/trip/${tripId}/itinerary`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        order,
        place: {
          placeId: place.placeId,
          placeName: item.resolveAddress ? item.placeName : place.placeName,
          address: place.roadAddress ?? place.address,
          latitude: place.latitude,
          longitude: place.longitude,
        },
      }),
    });
    return { latitude: place.latitude, longitude: place.longitude };
  } catch {
    // best-effort — a place that fails to resolve just stays unconfirmed, exactly like a real user's flow would.
    return null;
  }
}

