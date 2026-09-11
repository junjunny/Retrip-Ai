/**
 * features/miniGuide — "이번 여행 미니 가이드" (STEP 12): a short, read-only
 * guide to how to enjoy THIS trip, built from its `tripPreference` — never a
 * place recommendation, never a dashboard of numbers.
 *
 * Everything here is pure and browser-safe. The server-only
 * `generateMiniGuide` (LLM I/O) lives in `./miniGuideService` and must be
 * imported from there directly, never re-exported here.
 */
export { MINI_GUIDE_SECONDARY_THRESHOLD, MINI_GUIDE_TOP_THRESHOLD, buildMiniGuideFacts } from "./miniGuideFacts";
export type { MiniGuideFacts } from "./miniGuideFacts";
export {
  MAX_HEADLINE_LENGTH,
  MAX_TIPS,
  MAX_TIP_LENGTH,
  isMiniGuideGrounded,
  isValidMiniGuide,
} from "./miniGuideSchema";
export type { MiniGuide } from "./miniGuideSchema";
export { buildFallbackMiniGuide } from "./fallback";
