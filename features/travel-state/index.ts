/**
 * features/travel-state — Travel State Engine (STEP 7): "how is this trip
 * doing against its own plan right now" as an internal snapshot, never a
 * recommendation, score, or Re:Plan trigger. See ./travelState for the domain
 * model and thresholds.
 *
 * Everything here is pure and browser-safe. The server-only
 * `getTripTravelState` (Firestore + external adapters) lives in
 * `./travelStateService` and must be imported from there directly, never
 * re-exported here.
 */
export {
  TRAVEL_STATE_THRESHOLDS,
  buildTravelState,
  computeExperienceDeviation,
  computePreferenceDisagreement,
  computeRemainingScheduleMinutes,
  computeScheduleDelayMinutes,
  computeTrafficBurden,
  computeTravelStateStatus,
  computeWeatherRisk,
  pickNextPendingItem,
} from "./travelState";
export type { TravelStateInput } from "./travelState";
