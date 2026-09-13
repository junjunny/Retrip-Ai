/**
 * features/trip — pure trip/itinerary logic (no I/O, no Firebase).
 *
 * Everything here is a plain function: input -> calculation -> output, so it can
 * be unit-tested without a browser or Firestore. Firestore access lives in
 * `./tripService`.
 */
import {
  PREFERENCE_KEYS,
  PREFERENCE_LABELS,
  PREFERENCE_MAX,
  PREFERENCE_MIN,
  coercePreferenceVector,
} from "@/features/participant/participant";
import { minutesToTime } from "@/lib/kst";
import { haversineMeters } from "@/lib/place/match";
import type { DesiredPlace, ExperienceProfile, ItineraryItem, ScheduleType } from "@/types";

/** "HH:mm", 24-hour, leading zeros required (09:00 ok, 9:0 not). */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** "YYYY-MM-DD" (loose — real calendar validity checked separately). */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every "YYYY-MM-DD" from `startDate` to `endDate` inclusive. `[]` when either
 * is missing / malformed / out of order. No timezone math — pure string dates.
 */
export function tripDates(startDate: string, endDate: string): string[] {
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return [];
  if (startDate > endDate) return [];
  const out: string[] = [];
  const cur = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime())) return [];
  // guard against a pathological range
  for (let i = 0; i < 366 && cur <= end; i++) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Raw itinerary row as typed by the user, before normalization. */
export interface ItineraryDraft {
  time: string;
  placeName: string;
  /** "YYYY-MM-DD"; optional — falls back to the trip's startDate. */
  date?: string;
  /** optional — defaults to "flexible". */
  scheduleType?: ScheduleType;
}

/** Raw trip form values, before validation / normalization. */
export interface TripDraft {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  itinerary: ItineraryDraft[];
  /**
   * "이번 여행"의 취향 (STEP 12) — optional in the draft; `createTrip` fills
   * in the all-neutral default when omitted, so a user who never opens this
   * step still creates a trip normally. See types/index.ts's `Trip.tripPreference`.
   */
  tripPreference?: ExperienceProfile;
  /** STEP 16 — set only when this trip is created from `/demo`. See types/index.ts's `Trip.demoScenarioId`. */
  demoScenarioId?: string;
  /** STEP 18 — real places picked in "이번 여행에서 가고 싶은 곳" before the itinerary existed. See types/index.ts's `Trip.desiredPlaces`. */
  desiredPlaces?: DesiredPlace[];
}

/**
 * Returns a list of user-facing (Korean) error messages. Empty list == valid.
 */
export function validateTripDraft(draft: TripDraft): string[] {
  const errors: string[] = [];

  if (!draft.title.trim()) errors.push("여행 제목을 입력해주세요.");
  if (!draft.destination.trim()) errors.push("여행 지역을 입력해주세요.");
  if (!draft.startDate) errors.push("여행 시작일을 선택해주세요.");
  if (!draft.endDate) errors.push("여행 종료일을 선택해주세요.");
  // "YYYY-MM-DD" strings compare chronologically as plain strings.
  if (draft.startDate && draft.endDate && draft.startDate > draft.endDate) {
    errors.push("여행 종료일은 시작일보다 빠를 수 없습니다.");
  }

  // An empty itinerary is allowed (trip basics only). Any item present is checked.
  if (draft.itinerary.some((it) => !it.time)) {
    errors.push("일정의 시간을 입력해주세요.");
  } else if (draft.itinerary.some((it) => !TIME_RE.test(it.time))) {
    errors.push("일정의 시간을 올바른 형식(HH:mm)으로 입력해주세요.");
  }
  if (draft.itinerary.some((it) => !it.placeName.trim())) {
    errors.push("일정의 장소명을 입력해주세요.");
  }

  const days = tripDates(draft.startDate, draft.endDate);
  if (days.length > 0 && draft.itinerary.some((it) => it.date && !days.includes(it.date))) {
    errors.push("여행 기간에 없는 날짜의 일정이 있습니다.");
  }

  if (draft.tripPreference) {
    for (const key of PREFERENCE_KEYS) {
      const v = draft.tripPreference[key];
      if (typeof v !== "number" || !Number.isInteger(v) || v < PREFERENCE_MIN || v > PREFERENCE_MAX) {
        errors.push(`"${PREFERENCE_LABELS[key]}" 여행 취향은 ${PREFERENCE_MIN}~${PREFERENCE_MAX} 사이 값이어야 합니다.`);
      }
    }
  }

  return errors;
}

/**
 * Reads a stored `tripPreference` field back into an `ExperienceProfile`.
 * `null`/`undefined`/non-object (a trip created before STEP 12, where the
 * field is simply absent) -> `null` — never a fabricated default standing in
 * for "this feature didn't exist yet" (see types/index.ts's `Trip.tripPreference`
 * doc comment). A present-but-partial/out-of-range value is defensively
 * normalized via `coercePreferenceVector` (missing axis -> neutral,
 * out-of-range -> clamp), same policy STEP 5/6 already use for participant
 * preferences. Pure.
 */
export function coerceTripPreference(value: unknown): ExperienceProfile | null {
  if (value === null || value === undefined || typeof value !== "object") return null;
  return coercePreferenceVector(value as Partial<Record<(typeof PREFERENCE_KEYS)[number], unknown>>);
}

/** Reads a stored `demoScenarioId` field. Any non-string -> `null` (STEP 16). Pure. */
export function coerceDemoScenarioId(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** Reads a stored `desiredPlaces` array. Any malformed entry (missing name/coords) is dropped, never guessed. `[]` for a missing/non-array field (every trip before STEP 18). Pure. */
export function coerceDesiredPlaces(value: unknown): DesiredPlace[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): DesiredPlace[] => {
    if (typeof raw !== "object" || raw === null) return [];
    const p = raw as Record<string, unknown>;
    if (typeof p.placeName !== "string" || !p.placeName.trim()) return [];
    if (typeof p.latitude !== "number" || typeof p.longitude !== "number") return [];
    return [
      {
        placeId: typeof p.placeId === "string" ? p.placeId : null,
        placeName: p.placeName,
        address: typeof p.address === "string" ? p.address : null,
        latitude: p.latitude,
        longitude: p.longitude,
        source: p.source === "tour-korservice" ? "tour-korservice" : "kakao",
        selectedAt: typeof p.selectedAt === "string" ? p.selectedAt : "",
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// desiredPlaces -> itinerary rows (STEP 18)
// ---------------------------------------------------------------------------

/** The minimum a desired place needs to be placed into an itinerary — a resolved, real coordinate pair. */
export interface DesiredPlaceInput {
  placeName: string;
  latitude: number;
  longitude: number;
}

/** Suggested first stop of a day, and the gap between consecutive desired-place stops — a scheduling default, same spirit as a manually-added row defaulting to "10:00" (NEVER a travel-time estimate; see `distributeDesiredPlaces`'s doc comment). */
const DESIRED_PLACE_DAY_START_MINUTES = 10 * 60;
const DESIRED_PLACE_GAP_MINUTES = 90;

/**
 * Orders places by greedy real-distance nearest-neighbor, starting from the
 * first one — deterministic, using only real coordinates (`haversineMeters`,
 * the same distance function candidate generation already uses). Never an
 * LLM/AI ordering decision (AGENTS-spec, STEP 18 §6).
 */
export function nearestNeighborOrder<T extends { latitude: number; longitude: number }>(
  places: readonly T[],
): T[] {
  if (places.length <= 1) return [...places];
  const remaining = [...places];
  const route: T[] = [remaining.shift()!];
  while (remaining.length > 0) {
    const last = route[route.length - 1];
    let bestIndex = 0;
    let bestDistance = Infinity;
    remaining.forEach((p, i) => {
      const d = haversineMeters(last.latitude, last.longitude, p.latitude, p.longitude);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    });
    route.push(remaining.splice(bestIndex, 1)[0]);
  }
  return route;
}

/**
 * Turns "장소들을 골랐다" into itinerary rows, WITHOUT replacing anything the
 * user already typed manually (STEP 18 §7/§8): `existingRows` (fixed or
 * flexible) pass through completely unchanged, and desired-place rows only
 * ever fill (date,time) slots not already occupied by one — nudged forward
 * in 5-minute steps until free, so a desired place can never silently
 * overwrite a fixed reservation. `desiredPlaces: []` returns `existingRows`
 * as-is: the STEP 1-15 manual-entry path is completely untouched.
 *
 * Places are split across `days` in order (chunked, not round-robin) and
 * ordered within each day by `nearestNeighborOrder` — real geography, never
 * an LLM route decision. Every generated row is `scheduleType: "flexible"`
 * (a desired place is a wish, never a fixed booking) and gets a scheduling
 * default start time + a fixed gap between stops — NEVER a travel-time
 * ESTIMATE (straight-line distance / average speed is explicitly banned,
 * STEP 18 §10): the real gap between stops is only ever known once real
 * Kakao Mobility runs, after the trip and its itinerary already exist.
 */
export function distributeDesiredPlaces(
  desiredPlaces: readonly DesiredPlaceInput[],
  days: readonly string[],
  existingRows: readonly ItineraryDraft[],
): ItineraryDraft[] {
  if (desiredPlaces.length === 0 || days.length === 0) return [...existingRows];

  const perDay = Math.ceil(desiredPlaces.length / days.length);
  const occupied = new Set(existingRows.map((r) => `${r.date || days[0]} ${r.time}`));
  const generated: ItineraryDraft[] = [];

  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const date = days[dayIndex];
    const chunk = desiredPlaces.slice(dayIndex * perDay, (dayIndex + 1) * perDay);
    if (chunk.length === 0) continue;

    let minutes = DESIRED_PLACE_DAY_START_MINUTES;
    for (const place of nearestNeighborOrder(chunk)) {
      while (occupied.has(`${date} ${minutesToTime(minutes)}`)) minutes += 5;
      const time = minutesToTime(minutes);
      occupied.add(`${date} ${time}`);
      generated.push({ date, time, placeName: place.placeName, scheduleType: "flexible" });
      minutes += DESIRED_PLACE_GAP_MINUTES;
    }
  }
  return [...existingRows, ...generated];
}

/**
 * Sorts itinerary items by (date, time) and re-assigns `order` from 1. Items
 * with the same date+time keep their input order (stable sort + explicit index
 * tiebreak). New place fields start null/default; a later step resolves them.
 */
export function normalizeItinerary(
  items: ItineraryDraft[],
  tripStartDate: string,
): ItineraryItem[] {
  return items
    .map((it, index) => ({ it, index, date: it.date || tripStartDate }))
    .sort((a, b) => {
      const ka = `${a.date} ${a.it.time}`;
      const kb = `${b.date} ${b.it.time}`;
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return a.index - b.index;
    })
    .map(({ it, date }, i) => ({
      order: i + 1,
      date,
      time: it.time,
      placeId: null,
      placeName: it.placeName.trim(),
      address: null,
      latitude: null,
      longitude: null,
      scheduleType: it.scheduleType ?? "flexible",
      status: "planned" as const,
      placeConfirmed: false,
    }));
}

/**
 * Reads a stored itinerary array. Phase 1/2 items were `{ order, time,
 * placeName }` — fill the newer fields with safe defaults (`date` ←
 * `tripStartDate`, `scheduleType` "flexible", `status` "planned",
 * `placeConfirmed` false, place fields null). Missing / non-array -> [].
 * Pure — no Firestore import.
 */
export function coerceItinerary(
  value: unknown,
  tripStartDate: string,
): ItineraryItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (it): it is Record<string, unknown> =>
        typeof it === "object" &&
        it !== null &&
        typeof (it as { time?: unknown }).time === "string" &&
        typeof (it as { placeName?: unknown }).placeName === "string" &&
        typeof (it as { order?: unknown }).order === "number",
    )
    .map(
      (it): ItineraryItem => ({
        order: it.order as number,
        date:
          typeof it.date === "string" && it.date
            ? (it.date as string)
            : tripStartDate,
        time: it.time as string,
        placeId: typeof it.placeId === "string" ? (it.placeId as string) : null,
        placeName: it.placeName as string,
        address: typeof it.address === "string" ? (it.address as string) : null,
        latitude: typeof it.latitude === "number" ? (it.latitude as number) : null,
        longitude:
          typeof it.longitude === "number" ? (it.longitude as number) : null,
        scheduleType: it.scheduleType === "fixed" ? "fixed" : "flexible",
        status: it.status === "completed" ? "completed" : "planned",
        placeConfirmed: it.placeConfirmed === true,
      }),
    )
    .sort(
      (a, b) =>
        `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`) ||
        a.order - b.order,
    );
}

/** Re-sort by (date, time) and re-assign `order` from 1 (whole-trip order). Pure. */
export function renumberItinerary(items: ItineraryItem[]): ItineraryItem[] {
  return items
    .map((it, index) => ({ it, index }))
    .sort((a, b) => {
      const ka = `${a.it.date} ${a.it.time}`;
      const kb = `${b.it.date} ${b.it.time}`;
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return a.index - b.index;
    })
    .map(({ it }, i) => ({ ...it, order: i + 1 }));
}

/** Fields a user may edit on an existing itinerary item (NOT the place fields). */
export interface ItineraryEdit {
  date?: string;
  time?: string;
  placeName?: string;
  scheduleType?: ScheduleType;
}

/**
 * Apply a schedule edit to the item with `order`, then renumber.
 * If `placeName` changes, the resolved-place fields are cleared and
 * `placeConfirmed` goes back to `false` — the place must be confirmed again.
 * `status` is never touched here. Pure.
 */
export function applyItineraryEdit(
  items: ItineraryItem[],
  order: number,
  edit: ItineraryEdit,
): ItineraryItem[] {
  const patched = items.map((it) => {
    if (it.order !== order) return it;
    const nextName =
      edit.placeName !== undefined ? edit.placeName.trim() : it.placeName;
    const nameChanged = nextName !== it.placeName;
    return {
      ...it,
      date: edit.date ?? it.date,
      time: edit.time ?? it.time,
      scheduleType: edit.scheduleType ?? it.scheduleType,
      placeName: nextName || it.placeName,
      ...(nameChanged
        ? {
            placeId: null,
            address: null,
            latitude: null,
            longitude: null,
            placeConfirmed: false,
          }
        : {}),
    };
  });
  return renumberItinerary(patched);
}

/** Remove the item with `order`, then renumber. Pure. */
export function removeItineraryItem(
  items: ItineraryItem[],
  order: number,
): ItineraryItem[] {
  return renumberItinerary(items.filter((it) => it.order !== order));
}

/**
 * Marks one item `status: "completed"` (STEP 17 — the demo journey's "여기까지
 * 완료했어요" step, though nothing about it is demo-specific: it's the same
 * `status` field STEP 13's candidate filtering already reads). Never touches
 * date/time/place/order — a completed item is otherwise unchanged. Pure.
 */
export function markItemCompleted(items: ItineraryItem[], order: number): ItineraryItem[] {
  return items.map((it) => (it.order === order ? { ...it, status: "completed" as const } : it));
}

/** An itinerary draft row with a stable React key (used by the create form). */
export interface ItineraryRow extends ItineraryDraft {
  key: string;
}

/** Patch one row of the itinerary editor by key. Pure. */
export function applyRowPatch(
  rows: ItineraryRow[],
  key: string,
  patch: Partial<ItineraryDraft>,
): ItineraryRow[] {
  return rows.map((r) => (r.key === key ? { ...r, ...patch } : r));
}

/** Remove one row, but never below a single row (itinerary must stay ≥ 1). Pure. */
export function dropRow(rows: ItineraryRow[], key: string): ItineraryRow[] {
  return rows.length <= 1 ? rows : rows.filter((r) => r.key !== key);
}

/**
 * Short, shareable, collision-resistant trip id, e.g. "8F3K2A91".
 * ponytail: modulo bias over a 31-char alphabet is negligible for collision
 * purposes (31^8 ≈ 8.5e11 space); createTrip also retries on the rare clash.
 * Switch to rejection sampling only if IDs ever need to be uniform.
 */
export function generateTripId(length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 ambiguity
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let id = "";
  for (const byte of bytes) id += alphabet[byte % alphabet.length];
  return id;
}
