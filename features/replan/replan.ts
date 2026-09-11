/**
 * features/replan — Re:Plan Orchestration (STEP 10), pure domain layer.
 *
 * Turns STEP 9's per-slot `RankedOption[]` into a `ReplanPreview`: which
 * FLEXIBLE slots would change, to what, and why (the score breakdown STEP 9
 * already computed) — WITHOUT touching the itinerary. Nothing here calls
 * Firestore, an adapter, or the clock; `generatedAt`/`now` are always
 * injected. I/O and the actual Apply mutation live in `./replanService`.
 *
 * This file does NOT reimplement candidate generation (STEP 8) or scoring
 * (STEP 9) — it only decides, from an already-ranked list, whether a slot's
 * top-ranked real candidate is worth proposing over "keep current", and
 * assembles the result.
 */
import type { RankedOption } from "@/features/scoring";
import type { ItineraryItem, MobilityOption, PlaceSource, PlaceVerificationStatus, ScheduleType } from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * A candidate must beat "keep current" by at least this many finalScore
 * points (0..100 scale) to be proposed as a REPLACE. Without this, STEP 9's
 * tie-break rules (which exist to make *ranking* deterministic, not to judge
 * "meaningfully better") could flip a 0.01-point, noise-level edge into a
 * proposed itinerary change — exactly the "AI recommended something so we
 * changed it" UX this project explicitly rejects (see AGENTS-spec §9/§24).
 */
export const MIN_IMPROVEMENT_TO_REPLACE = 5;

// ---------------------------------------------------------------------------
// Deterministic itinerary fingerprint (stale-preview protection)
// ---------------------------------------------------------------------------

/**
 * FNV-1a 32-bit over a stable projection of every field that matters for
 * staleness (order/date/time/place fields/scheduleType/status/confirmation).
 * Pure, no Node crypto — same input always produces the same 8-hex-digit
 * string. Used to detect "the itinerary changed between Preview and Apply"
 * without adding a Firestore version field or persisting the preview itself.
 */
export function computeItineraryFingerprint(itinerary: readonly ItineraryItem[]): string {
  const projection = [...itinerary]
    .sort((a, b) => a.order - b.order)
    .map((it) => [
      it.order,
      it.date,
      it.time,
      it.placeId,
      it.placeName,
      it.address,
      it.latitude,
      it.longitude,
      it.scheduleType,
      it.status,
      it.placeConfirmed,
    ]);
  const s = JSON.stringify(projection);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Location fingerprint (STEP 13) — binds `currentLocation` into the
// Preview/Apply receipt alongside the itinerary fingerprint, so a client
// can't apply a preview computed for one origin against a since-changed one
// (mobility/scoring may honestly differ). Rounded to ~11m precision — enough
// to detect "meaningfully moved", never meant as a precise location compare.
// ---------------------------------------------------------------------------

export function computeLocationFingerprint(
  location: { latitude: number; longitude: number } | null,
): string {
  if (!location) return "none";
  return `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// Proposal types
// ---------------------------------------------------------------------------

export type ReplanSlotAction = "KEEP" | "REPLACE";

export interface ReplanSlotProposal {
  itineraryOrder: number;
  action: ReplanSlotAction;
  /** the slot as it stands today — never mutated by building this proposal. */
  current: {
    placeId: string | null;
    placeName: string;
    date: string;
    time: string;
    scheduleType: ScheduleType;
  };
  /** `null` when `action === "KEEP"`. */
  proposed: {
    placeId: string | null;
    placeName: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    source: PlaceSource;
    verificationStatus: PlaceVerificationStatus;
    /** TourAPI firstimage, when the source data had one (STEP 12) — never a generated/guessed URL. */
    imageUrl: string | null;
  } | null;
  /** the winning option's full STEP 9 score breakdown — the "why". */
  score: RankedOption;
  /** every option STEP 9 actually compared for this slot (keepCurrent + candidates), for future UI/debugging. */
  options: RankedOption[];
}

export interface ReplanPreview {
  tripId: string;
  /** ISO instant — captured once by the caller (features/replan/replanService), never re-read mid-computation. */
  generatedAt: string;
  /** `computeItineraryFingerprint` of the itinerary this preview was built against. Apply rejects if the live itinerary's fingerprint differs. */
  baseItineraryFingerprint: string;
  /** `computeLocationFingerprint` of the `currentLocation` this preview was built against (STEP 13). Apply rejects if the origin it's given doesn't match — mobility/scoring were computed for a specific origin. */
  baseLocationFingerprint: string;
  slots: ReplanSlotProposal[];
}

// ---------------------------------------------------------------------------
// Per-slot decision
// ---------------------------------------------------------------------------

/**
 * Picks this slot's winner from an already-ranked (STEP 9) option list.
 * `excludedPlaceIds` lets a caller iterating slots in order skip a
 * `placeId` an EARLIER slot already claimed (see `buildReplanPreview`) —
 * this cross-slot policy intentionally lives here, in orchestration, not in
 * STEP 9's scoring/ranking domain.
 *
 * A REPLACE is only proposed when the best eligible candidate beats "keep
 * current" by at least `MIN_IMPROVEMENT_TO_REPLACE` — "a candidate exists"
 * is never enough on its own (AGENTS-spec §9).
 */
export function decideSlotAction(
  ranked: readonly RankedOption[],
  excludedPlaceIds: ReadonlySet<string>,
): { action: ReplanSlotAction; winner: RankedOption } {
  const keepCurrent = ranked.find((r) => r.kind === "keepCurrent");
  // Defensive only: scoringService always includes a keepCurrent option.
  if (!keepCurrent) return { action: "KEEP", winner: ranked[0] };

  const bestEligible = ranked.find(
    (r) => r.kind === "keepCurrent" || r.place.placeId === null || !excludedPlaceIds.has(r.place.placeId),
  );
  if (!bestEligible || bestEligible.kind === "keepCurrent") {
    return { action: "KEEP", winner: keepCurrent };
  }
  if (bestEligible.breakdown.finalScore - keepCurrent.breakdown.finalScore >= MIN_IMPROVEMENT_TO_REPLACE) {
    return { action: "REPLACE", winner: bestEligible };
  }
  return { action: "KEEP", winner: keepCurrent };
}

function buildSlotProposal(
  slot: ItineraryItem,
  ranked: readonly RankedOption[],
  excludedPlaceIds: ReadonlySet<string>,
): ReplanSlotProposal {
  const { action, winner } = decideSlotAction(ranked, excludedPlaceIds);
  return {
    itineraryOrder: slot.order,
    action,
    current: {
      placeId: slot.placeId,
      placeName: slot.placeName,
      date: slot.date,
      time: slot.time,
      scheduleType: slot.scheduleType,
    },
    proposed:
      action === "REPLACE"
        ? {
            placeId: winner.place.placeId,
            placeName: winner.place.placeName,
            address: winner.place.address,
            latitude: winner.place.latitude,
            longitude: winner.place.longitude,
            source: winner.place.source,
            verificationStatus: winner.place.verificationStatus,
            imageUrl: winner.place.imageUrl,
          }
        : null,
    score: winner,
    options: [...ranked],
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface SlotRankingInput {
  itineraryOrder: number;
  ranked: readonly RankedOption[];
}

export interface ReplanPreviewInput {
  tripId: string;
  /** ISO instant — same value used to produce `slotRankings`, captured once by the caller. */
  generatedAt: string;
  /** the FULL itinerary (not just eligible slots) — used for the fingerprint and to look up each slot's current data. */
  itinerary: readonly ItineraryItem[];
  slotRankings: readonly SlotRankingInput[];
  /** same value passed to scoring/mobility for this run (STEP 13) — recorded as `baseLocationFingerprint`, never re-derived. */
  currentLocation?: { latitude: number; longitude: number } | null;
}

/**
 * Builds the full preview: decides KEEP/REPLACE per slot in ascending
 * `itineraryOrder`, threading forward a set of `placeId`s already claimed by
 * an earlier slot so the SAME real place is never proposed for two slots at
 * once (AGENTS-spec §25) — falling back to the next-best eligible option, or
 * KEEP, rather than skipping the slot. Pure; never mutates `input.itinerary`.
 */
export function buildReplanPreview(input: ReplanPreviewInput): ReplanPreview {
  const itemByOrder = new Map(input.itinerary.map((it) => [it.order, it]));
  const usedPlaceIds = new Set<string>();
  const slots: ReplanSlotProposal[] = [];

  const orderedRankings = [...input.slotRankings].sort((a, b) => a.itineraryOrder - b.itineraryOrder);
  for (const { itineraryOrder, ranked } of orderedRankings) {
    const slot = itemByOrder.get(itineraryOrder);
    if (!slot) continue; // defensive — a ranking for an order not in this itinerary snapshot

    const proposal = buildSlotProposal(slot, ranked, usedPlaceIds);
    if (proposal.action === "REPLACE" && proposal.proposed?.placeId) {
      usedPlaceIds.add(proposal.proposed.placeId);
    }
    slots.push(proposal);
  }

  return {
    tripId: input.tripId,
    generatedAt: input.generatedAt,
    baseItineraryFingerprint: computeItineraryFingerprint(input.itinerary),
    baseLocationFingerprint: computeLocationFingerprint(input.currentLocation ?? null),
    slots,
  };
}

// ---------------------------------------------------------------------------
// Public (wire) shape (STEP 13) — what the client actually receives.
// ---------------------------------------------------------------------------

/**
 * A slot as the CLIENT sees it — current/proposed place data + the real
 * mobility info for the winning option, but never the STEP 9 score breakdown
 * (groupSatisfaction, experiencePreservation, per-participant scores, every
 * other candidate considered) — that stays server-side (AGENTS-spec §26: no
 * score dashboard, and per-participant numbers are more sensitive than a
 * single aggregate). `mobility` is `[]` when it was never computed for this
 * option (see `RankedOption.mobility`'s doc comment) or when the slot is
 * KEEP (nothing to travel to — see `ReplanPanel`, which only renders a
 * mobility card for REPLACE).
 */
export interface PublicReplanSlot {
  itineraryOrder: number;
  action: ReplanSlotAction;
  current: ReplanSlotProposal["current"];
  proposed: ReplanSlotProposal["proposed"];
  mobility: MobilityOption[];
}

export interface PublicReplanPreview {
  tripId: string;
  generatedAt: string;
  baseItineraryFingerprint: string;
  baseLocationFingerprint: string;
  slots: PublicReplanSlot[];
}

/** Strips server-internal scoring data before a `ReplanPreview` goes over the wire. Pure. */
export function toPublicReplanPreview(preview: ReplanPreview): PublicReplanPreview {
  return {
    tripId: preview.tripId,
    generatedAt: preview.generatedAt,
    baseItineraryFingerprint: preview.baseItineraryFingerprint,
    baseLocationFingerprint: preview.baseLocationFingerprint,
    slots: preview.slots.map((s) => ({
      itineraryOrder: s.itineraryOrder,
      action: s.action,
      current: s.current,
      proposed: s.proposed,
      mobility: s.score.mobility ?? [],
    })),
  };
}
