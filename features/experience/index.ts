/**
 * features/experience — group Experience Profile (STEP 6).
 *
 * `buildExperienceProfile` is pure and browser-safe. The server-only
 * `getTripExperienceProfile` (Firestore read) lives in `./experienceService`
 * and must be imported from there directly, never re-exported here.
 */
export { buildExperienceProfile } from "./experienceProfile";
