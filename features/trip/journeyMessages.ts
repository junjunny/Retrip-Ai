/**
 * features/trip/journeyMessages — generic traveler-voiced lines for the
 * journey card's "여기까지 완료했어요" step (STEP 17/18), used by ANY trip
 * that has no more specific line to show for the item just completed. An
 * ordinary trip uses these directly; a demo scenario uses its own scripted
 * per-item message and falls back to these only once Re:Plan has changed a
 * place away from what the scenario scripted (see
 * `features/demo/demoScenarios.ts`'s `demoCompletionMessage`) — so this
 * module intentionally has NO dependency on `features/demo` (the general
 * journey mechanism must not depend on the demo-specific one, STEP 18 §32).
 */

/** Shown after completing an item with nothing more specific to say. */
export const JOURNEY_GENERIC_CONTINUE_MESSAGE = "여기까지 잘 다녀오셨나요? 다음 목적지로 이동해볼게요.";
/** Same, but for the trip's last item — no "다음 목적지" to point to. */
export const JOURNEY_GENERIC_CLOSING_MESSAGE = "즐거운 여행이었나요? 계획이 달라져도 여행은 계속되니까요.";
