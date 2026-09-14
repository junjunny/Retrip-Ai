/**
 * features/demo/demoReplanService — SERVER ONLY. The ONLY place a demo
 * trip's Re:Plan Preview/Apply is computed (STEP 23 §1/§13/§14/§21).
 *
 * A demo is a fixed, replayable SCENARIO, not a live recommendation session
 * (module doc, features/demo/demoScenarios.ts). Its Re:Plan therefore never
 * runs real candidate generation or deterministic scoring
 * (features/candidate, features/scoring, features/replan/replanService.ts —
 * all completely untouched by this file, and never imported here):
 *
 *   if (currentItem has a scripted disruption)
 *     -> REPLACE with that disruption's fixed replacement place
 *   else
 *     -> KEEP (nothing to change right now — same "quiet by default" feel
 *        as a real trip's Re:Plan)
 *
 * This sidesteps a real structural problem a fixed multi-day demo would
 * otherwise hit: `features/candidate`'s real eligibility gate
 * (`selectFlexibleSlots`) only ever considers items dated the SERVER's
 * actual current date — exactly correct for a real trip, but meaningless
 * for a scripted multi-day scenario a judge plays through in a few real
 * minutes. Bypassing that gate for a demo's OWN Re:Plan (never for a real
 * trip) is the actual fix, not a workaround.
 *
 * Real external adapters (`resolvePlace`, `fetchDrivingRoute`) are still
 * used, for exactly what STEP 23 §15/§16 allow: real coordinates, a real
 * image, a real address, and a real driving route/duration for the fixed
 * replacement place — never to decide WHICH place or WHETHER to replace,
 * and never fabricated when a real call fails (graceful degradation,
 * identical to the production path).
 */
import "server-only";

import { getDemoScenario, scenarioFlatItems, type DemoDisruption, type DemoScenario } from "@/features/demo";
import { generateReplanExplanation } from "@/features/replan/explanation/explanationService";
import type { ReplanExplanation } from "@/features/replan/explanation/explanationSchema";
import {
  computeItineraryFingerprint,
  computeLocationFingerprint,
  toPublicReplanPreview,
  type PublicReplanPreview,
  type ReplanPreview,
  type ReplanSlotProposal,
} from "@/features/replan/replan";
import { buildMobilityOptions } from "@/features/mobility";
import { applyPlaceChoices, coerceItinerary } from "@/features/trip";
import { TripNotFoundError } from "@/features/trip/tripAdminService";
import { fetchDrivingRoute } from "@/lib/api";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolvePlace } from "@/lib/place/resolve";
import type { CandidatePlace, ItineraryItem, PlaceSource, RiskLevel } from "@/types";

function requireDb() {
  const db = getAdminDb();
  if (!db) {
    throw new Error("Firebase Admin이 설정되지 않았습니다. FIREBASE_SERVICE_ACCOUNT_KEY를 확인해주세요.");
  }
  return db;
}

/** Reads a trip's `demoScenarioId` alongside its itinerary (one read, no extra Firestore round trip). `null` for an ordinary trip or one whose id doesn't match a known scenario. */
export async function getTripDemoScenario(tripId: string): Promise<DemoScenario | null> {
  const snap = await requireDb().doc(`trips/${tripId}`).get();
  if (!snap.exists) throw new TripNotFoundError();
  const data = snap.data() ?? {};
  const id = typeof data.demoScenarioId === "string" ? data.demoScenarioId : null;
  return id ? (getDemoScenario(id) ?? null) : null;
}

/** Mirrors app/trip/[tripId]/page.tsx's `firstCurrentOrder` — "where the traveler is right now" (STEP 17/18), duplicated here rather than imported across the app/->features/ boundary. */
function firstCurrentOrder(itinerary: readonly ItineraryItem[]): number | null {
  const next = [...itinerary].sort((a, b) => a.order - b.order).find((it) => it.status !== "completed");
  return next?.order ?? null;
}

const SITUATION_KIND_RISK: Record<DemoDisruption["situationKind"], { weatherRisk: RiskLevel; trafficBurden: RiskLevel }> = {
  weather: { weatherRisk: "high", trafficBurden: "low" },
  traffic: { weatherRisk: "low", trafficBurden: "high" },
  // "crowd" has no real Travel State signal backing it (STEP 21) — never
  // elevate a risk level that isn't actually real.
  crowd: { weatherRisk: "low", trafficBurden: "low" },
};

async function loadLiveItinerary(tripId: string) {
  const ref = requireDb().doc(`trips/${tripId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new TripNotFoundError();
  const data = snap.data() ?? {};
  const startDate = typeof data.startDate === "string" ? data.startDate : "";
  return { ref, itinerary: coerceItinerary(data.itinerary, startDate) };
}

/** Real coordinates/image/address for a fixed replacement, via the SAME resolver every real candidate uses — never a hardcoded coordinate (STEP 23 §15/§25). `null` on any real-API failure; the caller degrades gracefully, never fabricates. */
async function resolveFixedPlace(disruption: DemoDisruption): Promise<CandidatePlace | null> {
  try {
    const resolved = await resolvePlace({
      query: disruption.replacement.resolveQuery ?? disruption.replacement.placeName,
      latitude: null,
      longitude: null,
    });
    if (!resolved || resolved.verificationStatus === "unresolved" || resolved.latitude == null || resolved.longitude == null) {
      return null;
    }
    return {
      placeId: resolved.placeId,
      // the scenario's own display name is the source of truth, never the
      // API's own name spelling (STEP 23 §15) — coordinates/address/image
      // still come straight from the real resolution.
      placeName: disruption.replacement.placeName,
      address: resolved.roadAddress ?? resolved.address,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
      category: null,
      tourApiContentId: resolved.tourApiContentId,
      imageUrl: resolved.tourApiImageUrl,
      source: (resolved.sources[0] ?? "kakao") as PlaceSource,
      verificationStatus: resolved.verificationStatus,
      candidateReason: "Demo 시나리오 고정 대안",
    };
  } catch {
    return null;
  }
}

async function buildReplaceSlot(
  current: ItineraryItem,
  disruption: DemoDisruption,
  currentLocation: { latitude: number; longitude: number } | null,
): Promise<ReplanSlotProposal> {
  const place = await resolveFixedPlace(disruption);
  const route =
    place && currentLocation
      ? await fetchDrivingRoute({
          origin: currentLocation,
          destination: { latitude: place.latitude!, longitude: place.longitude! },
        }).catch(() => null)
      : null;

  const resolvedPlace: CandidatePlace = place ?? {
    placeId: null,
    placeName: disruption.replacement.placeName,
    address: null,
    latitude: null,
    longitude: null,
    category: null,
    tourApiContentId: null,
    imageUrl: null,
    source: "kakao",
    verificationStatus: "unresolved",
    candidateReason: "Demo 시나리오 고정 대안",
  };

  return {
    itineraryOrder: current.order,
    action: "REPLACE",
    current: {
      placeId: current.placeId,
      placeName: current.placeName,
      date: current.date,
      time: current.time,
      scheduleType: current.scheduleType,
    },
    proposed: {
      placeId: resolvedPlace.placeId,
      placeName: resolvedPlace.placeName,
      address: resolvedPlace.address,
      latitude: resolvedPlace.latitude,
      longitude: resolvedPlace.longitude,
      source: resolvedPlace.source,
      verificationStatus: resolvedPlace.verificationStatus,
      imageUrl: resolvedPlace.imageUrl,
    },
    score: {
      kind: "candidate",
      place: resolvedPlace,
      breakdown: {
        participantScores: [],
        groupSatisfaction: null,
        minimumParticipantSatisfaction: null,
        experiencePreservation: null,
        situationFitness: 100,
        timeFitness: 100,
        travelBurden: route ? 80 : null,
        minimumSatisfactionPenalty: 0,
        finalScore: 100,
      },
      route: route ? { durationSeconds: route.durationSeconds, distanceMeters: route.distanceMeters } : null,
      mobility: buildMobilityOptions(route),
    },
    options: [],
  };
}

export interface DemoReplanResult {
  preview: PublicReplanPreview;
  explanation: ReplanExplanation;
  events: never[];
  disruption: DemoDisruption | null;
}

/**
 * Read-only: the CURRENT item, if (and only if) the scenario scripts a
 * disruption for it, becomes the one REPLACE slot; every other item is
 * never touched. `slots: []` (via `disruption: null`) when the traveler
 * hasn't reached a disrupted item yet — same "nothing to Re:Plan right now"
 * shape a real trip's empty preview already has.
 */
export async function buildDemoReplanPreview(
  tripId: string,
  scenario: DemoScenario,
  options: { now?: Date; currentLocation?: { latitude: number; longitude: number } | null } = {},
): Promise<DemoReplanResult> {
  const { itinerary } = await loadLiveItinerary(tripId);
  const now = options.now ?? new Date();
  const currentLocation = options.currentLocation ?? null;
  const currentOrder = firstCurrentOrder(itinerary);
  const current = currentOrder != null ? itinerary.find((it) => it.order === currentOrder) : undefined;
  const scenarioItem = currentOrder != null ? scenarioFlatItems(scenario)[currentOrder - 1] : undefined;
  const disruption = scenarioItem?.disruption ?? null;

  const slot = current && disruption ? await buildReplaceSlot(current, disruption, currentLocation) : null;
  const preview: ReplanPreview = {
    tripId,
    generatedAt: now.toISOString(),
    baseItineraryFingerprint: computeItineraryFingerprint(itinerary),
    baseLocationFingerprint: computeLocationFingerprint(currentLocation),
    slots: slot ? [slot] : [],
  };

  const risk = disruption ? SITUATION_KIND_RISK[disruption.situationKind] : { weatherRisk: "low" as RiskLevel, trafficBurden: "low" as RiskLevel };
  const nowDate = now.toISOString().slice(0, 10);
  const { explanation } = await generateReplanExplanation(preview, risk, nowDate);

  return { preview: toPublicReplanPreview(preview), explanation, events: [], disruption };
}

export class DemoReplanStaleError extends Error {
  constructor() {
    super("일정이 변경되어 이 계획을 적용할 수 없습니다. 다시 계획을 생성해주세요.");
    this.name = "DemoReplanStaleError";
  }
}

export interface ApplyDemoReplanOptions {
  baseItineraryFingerprint: string;
  baseLocationFingerprint: string;
  currentLocation?: { latitude: number; longitude: number } | null;
}

/**
 * Re-derives the SAME fixed replacement from the scenario fixture (never
 * trusts the client for what to write — STEP 13 §13, unchanged principle),
 * re-checks the itinerary fingerprint, and writes only that one slot's place
 * fields via the exact same field-limited `applyPlaceChoices` a real trip's
 * Apply uses. `changedCount` is always 0 or 1 for a demo — never a
 * fabricated number.
 */
export async function applyDemoReplanPreview(
  tripId: string,
  scenario: DemoScenario,
  options: ApplyDemoReplanOptions,
): Promise<{ itinerary: ItineraryItem[]; changedCount: number }> {
  const { ref, itinerary: liveItinerary } = await loadLiveItinerary(tripId);

  if (computeItineraryFingerprint(liveItinerary) !== options.baseItineraryFingerprint) {
    throw new DemoReplanStaleError();
  }
  const currentLocation = options.currentLocation ?? null;
  if (computeLocationFingerprint(currentLocation) !== options.baseLocationFingerprint) {
    throw new DemoReplanStaleError();
  }

  const currentOrder = firstCurrentOrder(liveItinerary);
  const current = currentOrder != null ? liveItinerary.find((it) => it.order === currentOrder) : undefined;
  const scenarioItem = currentOrder != null ? scenarioFlatItems(scenario)[currentOrder - 1] : undefined;
  const disruption = scenarioItem?.disruption;

  if (!current || !disruption) {
    return { itinerary: liveItinerary, changedCount: 0 };
  }

  const place = await resolveFixedPlace(disruption);
  if (!place || place.latitude == null || place.longitude == null) {
    // real resolution failed at Apply time -> nothing honest to write.
    return { itinerary: liveItinerary, changedCount: 0 };
  }

  const next = applyPlaceChoices(liveItinerary, [
    {
      order: current.order,
      choice: {
        placeId: place.placeId,
        placeName: place.placeName,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        confirmed: place.verificationStatus === "verified",
      },
    },
  ]);

  await requireDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new TripNotFoundError();
    const data = snap.data() ?? {};
    const startDate = typeof data.startDate === "string" ? data.startDate : "";
    const freshItinerary = coerceItinerary(data.itinerary, startDate);
    if (computeItineraryFingerprint(freshItinerary) !== options.baseItineraryFingerprint) {
      throw new DemoReplanStaleError();
    }
    tx.update(ref, { itinerary: next });
  });

  return { itinerary: next, changedCount: 1 };
}
