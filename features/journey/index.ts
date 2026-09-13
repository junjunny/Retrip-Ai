/**
 * features/journey — STEP 19's grounded "다음 장소" narrative. A second,
 * independent grounded-LLM feature alongside features/replan/explanation
 * (STEP 11) — same pattern (facts -> schema -> service -> grounding check),
 * different job: describing the already-decided NEXT stop, never deciding
 * anything about it.
 */
export { buildNarrativeFacts, NARRATIVE_OVERVIEW_MAX_LENGTH } from "./narrativeFacts";
export type { NarrativeFacts } from "./narrativeFacts";
export { isGroundedNarrative, isValidPlaceNarrative } from "./narrativeSchema";
export type { PlaceNarrative } from "./narrativeSchema";
export { generatePlaceNarrative } from "./narrativeService";
