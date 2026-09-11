/**
 * features/replan/explanation — turns an already-decided ReplanPreview into
 * human-readable Korean text (STEP 11). The LLM here never decides anything
 * — see explanationService.ts's docstring. Everything exported here is pure;
 * the server-only `generateReplanExplanation` (LLM I/O) lives in
 * `./explanationService` and must be imported from there directly.
 */
export { OVERVIEW_SNIPPET_MAX_LENGTH, buildExplanationFacts, isEventOngoing } from "./explanationFacts";
export type { ExplanationFacts, SlotFact, SlotPlaceDetail } from "./explanationFacts";
export {
  MAX_CAUTIONS,
  MAX_PLACE_DESCRIPTION_LENGTH,
  MAX_REASON_LENGTH,
  MAX_REASONS,
  MAX_SUMMARY_LENGTH,
  MAX_TITLE_LENGTH,
  isGrounded,
  isValidReplanExplanation,
} from "./explanationSchema";
export type { PlaceDescription, ReplanExplanation, SlotReason } from "./explanationSchema";
export { FALLBACK_HIGH_THRESHOLD, FALLBACK_LOW_BURDEN_THRESHOLD, buildFallbackExplanation } from "./fallback";
