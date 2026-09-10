/**
 * features/trip — pure trip/itinerary logic (no I/O, no Firebase).
 *
 * Everything here is a plain function: input -> calculation -> output, so it can
 * be unit-tested without a browser or Firestore. Firestore access lives in
 * `./tripService`.
 */
import type { ItineraryItem, ScheduleType } from "@/types";

/** "HH:mm", 24-hour, leading zeros required (09:00 ok, 9:0 not). */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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

  if (draft.itinerary.length === 0) {
    errors.push("최소 1개의 일정을 입력해주세요.");
  }
  if (draft.itinerary.some((it) => !it.time)) {
    errors.push("일정의 시간을 입력해주세요.");
  } else if (draft.itinerary.some((it) => !TIME_RE.test(it.time))) {
    errors.push("일정의 시간을 올바른 형식(HH:mm)으로 입력해주세요.");
  }
  if (draft.itinerary.some((it) => !it.placeName.trim())) {
    errors.push("일정의 장소명을 입력해주세요.");
  }

  return errors;
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
