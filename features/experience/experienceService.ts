/**
 * features/experience/experienceService — reads a trip's stored preferences and
 * derives the group Experience Profile.
 *
 * SERVER ONLY (pulls preference docs via the Admin SDK). The Profile is not
 * persisted: it is a deterministic function of the preferences, so it is
 * recomputed on demand.
 */
import "server-only";

import { listPreferenceVectors } from "@/features/participant/participantService";
import type { ExperienceProfile } from "@/types";

import { buildExperienceProfile } from "./experienceProfile";

/** `null` until at least one participant has submitted their preferences. */
export async function getTripExperienceProfile(
  tripId: string,
): Promise<ExperienceProfile | null> {
  return buildExperienceProfile(await listPreferenceVectors(tripId));
}
