/**
 * PATCH /api/trip/{tripId}/itinerary
 * body: { order: number, place: { placeId, placeName, address, latitude, longitude } }
 *
 * Applies a user-confirmed place to one itinerary item (Admin SDK). Never
 * changes order / date / time / scheduleType / status. Returns { itinerary }.
 */
import {
  ItineraryItemNotFoundError,
  TripNotFoundError,
  updateItineraryPlace,
} from "@/features/trip/tripAdminService";
import type { PlaceChoice } from "@/features/trip";

function parsePlace(v: unknown): PlaceChoice | null {
  if (typeof v !== "object" || v === null) return null;
  const p = v as Record<string, unknown>;
  if (typeof p.placeName !== "string" || !p.placeName.trim()) return null;
  const numOrNull = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return {
    placeId: typeof p.placeId === "string" ? p.placeId : null,
    placeName: p.placeName,
    address: typeof p.address === "string" ? p.address : null,
    latitude: numOrNull(p.latitude),
    longitude: numOrNull(p.longitude),
  };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const order = typeof body.order === "number" ? body.order : NaN;
  const place = parsePlace(body.place);
  if (!Number.isInteger(order) || !place) {
    return Response.json({ error: "요청 값을 확인해주세요." }, { status: 400 });
  }

  try {
    const itinerary = await updateItineraryPlace(tripId, order, place);
    return Response.json({ itinerary });
  } catch (err) {
    if (err instanceof TripNotFoundError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof ItineraryItemNotFoundError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    console.error(
      "[api/trip/itinerary]",
      err instanceof Error ? err.message : "unknown error",
    );
    return Response.json(
      { error: "저장에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
