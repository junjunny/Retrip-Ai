/**
 * features/trip — pure trip/itinerary logic (no I/O, no Firebase).
 *
 * Everything here is a plain function: input -> calculation -> output, so it can
 * be unit-tested without a browser or Firestore. Firestore access lives in
 * `./tripService`.
 */
import type { ItineraryItem } from "@/types";

/** "HH:mm", 24-hour, leading zeros required (09:00 ok, 9:0 not). */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Raw itinerary row as typed by the user, before normalization. */
export interface ItineraryDraft {
  time: string;
  placeName: string;
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
 * Sorts itinerary items by time and re-assigns `order` from 1. Items with the
 * same time keep their input order (Array.prototype.sort is stable; the explicit
 * index tiebreak makes that guarantee obvious).
 */
export function normalizeItinerary(items: ItineraryDraft[]): ItineraryItem[] {
  return items
    .map((it, index) => ({ it, index }))
    .sort((a, b) => {
      if (a.it.time < b.it.time) return -1;
      if (a.it.time > b.it.time) return 1;
      return a.index - b.index;
    })
    .map(({ it }, i) => ({
      order: i + 1,
      time: it.time,
      placeName: it.placeName.trim(),
    }));
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
