/**
 * features/replan/replanService — Re:Plan orchestration I/O (STEP 10).
 *
 * `generateReplanPreview`: user pressed [Re:Plan] → reuse STEP 8 Candidate
 * Generation + STEP 9 Scoring (never reimplemented) → build a `ReplanPreview`.
 * NO itinerary write happens here.
 *
 * `applyReplanPreview`: user pressed [이 계획 적용] → re-verify the trip's
 * itinerary hasn't changed since the preview, then re-derive the SAME
 * proposal server-side (using the preview's own captured `now` — see below)
 * and write ONLY its REPLACE slots. The client's copy of the preview is
 * NEVER trusted for what to write — only its fingerprint + generatedAt
 * receipt come back, and the server recomputes everything itself
 * deterministically. This closes the "client just POSTs whatever place data
 * it wants" injection path (AGENTS-spec §13).
 *
 * SERVER ONLY. No new Firestore persistence: nothing here is written except
 * the trip's own `itinerary` field, and only inside `applyReplanPreview`.
 */
import "server-only";

import { applyPlaceChoices, coerceItinerary, type PlaceChoice } from "@/features/trip";
import { TripNotFoundError } from "@/features/trip/tripAdminService";
import { scoreTripCandidates, scoreTripCandidatesWithContext } from "@/features/scoring/scoringService";
import { generateReplanExplanation } from "@/features/replan/explanation/explanationService";
import type { ExplanationFacts } from "@/features/replan/explanation/explanationFacts";
import type { ReplanExplanation } from "@/features/replan/explanation/explanationSchema";
import { getAdminDb } from "@/lib/firebase/admin";
import type { ItineraryItem } from "@/types";

import {
  buildReplanPreview,
  computeItineraryFingerprint,
  computeLocationFingerprint,
  type ReplanPreview,
} from "./replan";

export class ReplanStaleError extends Error {
  constructor() {
    super("일정이 변경되어 이 계획을 적용할 수 없습니다. 다시 계획을 생성해주세요.");
    this.name = "ReplanStaleError";
  }
}

function requireDb() {
  const db = getAdminDb();
  if (!db) {
    throw new Error(
      "Firebase Admin이 설정되지 않았습니다. FIREBASE_SERVICE_ACCOUNT_KEY를 확인해주세요.",
    );
  }
  return db;
}

async function loadItinerary(tripId: string) {
  const ref = requireDb().doc(`trips/${tripId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new TripNotFoundError();
  const data = snap.data() ?? {};
  const startDate = typeof data.startDate === "string" ? data.startDate : "";
  return { ref, itinerary: coerceItinerary(data.itinerary, startDate) };
}

export interface GenerateReplanPreviewOptions {
  /** Injected for testability. The real Route Handler always uses the server clock — a client can never supply `now` (see the route). */
  now?: Date;
  /** Same contract as STEP 7/8/9: never inferred, only ever what the caller explicitly supplies. */
  currentLocation?: { latitude: number; longitude: number } | null;
}

async function buildPreview(tripId: string, options: GenerateReplanPreviewOptions) {
  const now = options.now ?? new Date();
  const [{ itinerary }, { slotRankings, travelState }] = await Promise.all([
    loadItinerary(tripId),
    scoreTripCandidatesWithContext(tripId, { now, currentLocation: options.currentLocation }),
  ]);

  const preview = buildReplanPreview({
    tripId,
    generatedAt: now.toISOString(),
    itinerary,
    slotRankings,
    currentLocation: options.currentLocation,
  });
  return { preview, travelState };
}

/**
 * User pressed [Re:Plan]. Read-only: computes and returns a preview, never
 * writes the itinerary. `slots: []` (not an error) when there's nothing
 * eligible to re-plan right now (no FLEXIBLE/incomplete slot scheduled for
 * today at or after `now`).
 */
export async function generateReplanPreview(
  tripId: string,
  options: GenerateReplanPreviewOptions = {},
): Promise<ReplanPreview> {
  return (await buildPreview(tripId, options)).preview;
}

/**
 * Same as `generateReplanPreview`, plus a human-readable explanation of the
 * result (STEP 11). The explanation is generated ONCE for the whole preview
 * (never per slot — AGENTS-spec §31) via `features/replan/explanation`,
 * which degrades to a deterministic fallback on any LLM failure and never
 * throws — so this function's own failure surface is identical to
 * `generateReplanPreview`'s.
 */
export async function generateReplanPreviewWithExplanation(
  tripId: string,
  options: GenerateReplanPreviewOptions = {},
): Promise<{ preview: ReplanPreview; explanation: ReplanExplanation; facts: ExplanationFacts }> {
  const { preview, travelState } = await buildPreview(tripId, options);
  const { explanation, facts } = await generateReplanExplanation(
    preview,
    { weatherRisk: travelState.weatherRisk, trafficBurden: travelState.trafficBurden },
    travelState.now.date,
  );
  return { preview, explanation, facts };
}

export interface ApplyReplanOptions {
  /** the fingerprint the client's preview was built against — must match the LIVE itinerary's fingerprint right now. */
  baseItineraryFingerprint: string;
  /**
   * The preview's own `baseLocationFingerprint` (STEP 13) — must match
   * `computeLocationFingerprint(currentLocation)` below. Preview and Apply
   * must agree on WHERE the user was, since mobility/scoring were computed
   * for that origin; a changed origin means this isn't "the same plan"
   * anymore and the client must re-Preview.
   */
  baseLocationFingerprint: string;
  /** the preview's own `generatedAt` — reused as `now` so Apply reproduces the exact proposal the user reviewed. */
  generatedAt: string;
  currentLocation?: { latitude: number; longitude: number } | null;
}

/**
 * User pressed [이 계획 적용]. Re-verifies the itinerary AND the origin are
 * unchanged since the preview (`ReplanStaleError` otherwise — never applies
 * over a stale base), then recomputes the proposal server-side (deterministic
 * given the same itinerary + `now` + `currentLocation`) and writes ONLY its
 * REPLACE slots' place fields (never date/time/order/status —
 * `applyPlaceChoices` reuses STEP 3's field-limited `applyPlaceChoice`). A
 * candidate that wasn't independently `verified` is written with
 * `placeConfirmed: false` — never forced true. `[기존 일정 유지]` never calls
 * this function at all — see the route.
 *
 * Concurrency (STEP 13): the slow work (scoring, external APIs) happens
 * OUTSIDE any Firestore transaction — never call an external API from inside
 * `runTransaction`. The actual read-check-write for the final commit happens
 * INSIDE one, so a write that lands between this function's first read and
 * its commit is caught (the transaction's own fresh read won't match
 * `baseItineraryFingerprint` either) instead of silently overwritten.
 */
export async function applyReplanPreview(
  tripId: string,
  options: ApplyReplanOptions,
): Promise<{ itinerary: ItineraryItem[]; changedCount: number }> {
  const { ref, itinerary: liveItinerary } = await loadItinerary(tripId);

  const liveFingerprint = computeItineraryFingerprint(liveItinerary);
  if (liveFingerprint !== options.baseItineraryFingerprint) {
    throw new ReplanStaleError();
  }
  const liveLocationFingerprint = computeLocationFingerprint(options.currentLocation ?? null);
  if (liveLocationFingerprint !== options.baseLocationFingerprint) {
    throw new ReplanStaleError();
  }

  const now = new Date(options.generatedAt);
  const slotRankings = await scoreTripCandidates(tripId, {
    now: Number.isNaN(now.getTime()) ? undefined : now,
    currentLocation: options.currentLocation,
  });
  const preview = buildReplanPreview({
    tripId,
    generatedAt: options.generatedAt,
    itinerary: liveItinerary,
    slotRankings,
    currentLocation: options.currentLocation,
  });

  const liveByOrder = new Map(liveItinerary.map((it) => [it.order, it]));
  const choices: { order: number; choice: PlaceChoice }[] = [];
  for (const slot of preview.slots) {
    if (slot.action !== "REPLACE" || !slot.proposed) continue;
    const live = liveByOrder.get(slot.itineraryOrder);
    // Defense in depth beyond the fingerprint check: never touch a slot that
    // isn't FLEXIBLE / not-completed right now, even if it somehow got this far.
    if (!live || live.scheduleType !== "flexible" || live.status === "completed") continue;
    if (!slot.proposed.placeName.trim()) continue;

    choices.push({
      order: slot.itineraryOrder,
      choice: {
        placeId: slot.proposed.placeId,
        placeName: slot.proposed.placeName,
        address: slot.proposed.address,
        latitude: slot.proposed.latitude,
        longitude: slot.proposed.longitude,
        confirmed: slot.proposed.verificationStatus === "verified",
      },
    });
  }

  if (choices.length === 0) {
    return { itinerary: liveItinerary, changedCount: 0 };
  }

  const next = applyPlaceChoices(liveItinerary, choices);

  // Commit inside a transaction that re-reads and re-checks the itinerary
  // fingerprint at the last possible moment — closes the gap between the
  // read at the top of this function and this write. No external API call
  // happens in here, only Firestore reads/writes (see the module docstring).
  await requireDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new TripNotFoundError();
    const data = snap.data() ?? {};
    const startDate = typeof data.startDate === "string" ? data.startDate : "";
    const freshItinerary = coerceItinerary(data.itinerary, startDate);
    if (computeItineraryFingerprint(freshItinerary) !== options.baseItineraryFingerprint) {
      throw new ReplanStaleError();
    }
    tx.update(ref, { itinerary: next });
  });

  return { itinerary: next, changedCount: choices.length };
}
