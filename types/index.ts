/**
 * Shared domain types for Re:Trip AI.
 *
 * PHASE 0: intentionally minimal. These are placeholders that mark the shape of
 * the domain so later phases have a stable import path (`@/types`). Fields will
 * be filled in phase by phase — do not over-specify them now.
 */

/** A planned trip (Phase 1). */
export interface Trip {
  id: string;
}

/** A member of the traveling group (Phase 2). */
export interface Participant {
  id: string;
}

/** A participant's stated preferences (Phase 2). */
export interface Preference {
  participantId: string;
}

/** The group's aggregated intended experience (Phase 4). */
export interface ExperienceProfile {
  tripId: string;
}

/**
 * Unified snapshot of the current trip conditions — weather, traffic, crowd,
 * etc. — produced by the Travel State Engine (Phase 7).
 */
export interface TravelState {
  tripId: string;
}

/** A candidate re-designed plan produced by the Re:Plan Engine (Phase 8). */
export interface ReplanPlan {
  tripId: string;
}
