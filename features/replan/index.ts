/**
 * features/replan — Re:Plan Orchestration (STEP 10): user-triggered only.
 * Nothing in this project calls into here automatically — see
 * AGENTS-spec §0/§32. Preview computes; only an explicit Apply writes.
 *
 * Everything here is pure and browser-safe. The server-only
 * `generateReplanPreview` / `applyReplanPreview` (Firestore + STEP 8/9) live
 * in `./replanService` and must be imported from there directly, never
 * re-exported here.
 */
export {
  MIN_IMPROVEMENT_TO_REPLACE,
  buildReplanPreview,
  computeItineraryFingerprint,
  computeLocationFingerprint,
  decideSlotAction,
  toPublicReplanPreview,
} from "./replan";
export type {
  PublicReplanPreview,
  PublicReplanSlot,
  ReplanPreview,
  ReplanPreviewInput,
  ReplanSlotAction,
  ReplanSlotProposal,
  SlotRankingInput,
} from "./replan";
