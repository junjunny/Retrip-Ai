/**
 * PATCH  /api/trip/{tripId}/itinerary
 *   { order, place: { placeId, placeName, address, latitude, longitude } }  — confirm a place
 *   { order, edit:  { date?, time?, placeName?, scheduleType? } }           — edit schedule fields
 * DELETE /api/trip/{tripId}/itinerary   { order }                          — delete an item
 *
 * All go through the Admin SDK (trip doc is client-immutable). A place
 * confirmation never changes order/date/time/scheduleType/status; an edit
 * renumbers and (on a name change) clears the resolved place. Returns { itinerary }.
 */
import {
  deleteItineraryItem,
  editItineraryItem,
  ItineraryItemNotFoundError,
  TripNotFoundError,
  updateItineraryPlace,
} from "@/features/trip/tripAdminService";
import type { ItineraryEdit } from "@/features/trip";
import type { PlaceChoice } from "@/features/trip";
import { DATE_RE, TIME_RE } from "@/features/trip";

const numOrNull = (x: unknown) =>
  typeof x === "number" && Number.isFinite(x) ? x : null;

function parsePlace(v: unknown): PlaceChoice | null {
  if (typeof v !== "object" || v === null) return null;
  const p = v as Record<string, unknown>;
  if (typeof p.placeName !== "string" || !p.placeName.trim()) return null;
  return {
    placeId: typeof p.placeId === "string" ? p.placeId : null,
    placeName: p.placeName,
    address: typeof p.address === "string" ? p.address : null,
    latitude: numOrNull(p.latitude),
    longitude: numOrNull(p.longitude),
  };
}

function parseEdit(v: unknown): ItineraryEdit | "invalid" | null {
  if (typeof v !== "object" || v === null) return null;
  const e = v as Record<string, unknown>;
  const edit: ItineraryEdit = {};
  if (e.date !== undefined) {
    if (typeof e.date !== "string" || !DATE_RE.test(e.date)) return "invalid";
    edit.date = e.date;
  }
  if (e.time !== undefined) {
    if (typeof e.time !== "string" || !TIME_RE.test(e.time)) return "invalid";
    edit.time = e.time;
  }
  if (e.placeName !== undefined) {
    if (typeof e.placeName !== "string" || !e.placeName.trim()) return "invalid";
    edit.placeName = e.placeName;
  }
  if (e.scheduleType !== undefined) {
    if (e.scheduleType !== "fixed" && e.scheduleType !== "flexible") return "invalid";
    edit.scheduleType = e.scheduleType;
  }
  return Object.keys(edit).length > 0 ? edit : "invalid";
}

async function readOrder(req: Request): Promise<{ body: Record<string, unknown>; order: number } | null> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
  const order = typeof body.order === "number" ? body.order : NaN;
  if (!Number.isInteger(order)) return null;
  return { body, order };
}

function mapError(err: unknown): Response {
  if (err instanceof TripNotFoundError || err instanceof ItineraryItemNotFoundError) {
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  const parsed = await readOrder(req);
  if (!parsed) return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  const { body, order } = parsed;

  try {
    if (body.place !== undefined) {
      const place = parsePlace(body.place);
      if (!place) return Response.json({ error: "요청 값을 확인해주세요." }, { status: 400 });
      return Response.json({ itinerary: await updateItineraryPlace(tripId, order, place) });
    }
    if (body.edit !== undefined) {
      const edit = parseEdit(body.edit);
      if (edit === null || edit === "invalid") {
        return Response.json({ error: "수정 값을 확인해주세요." }, { status: 400 });
      }
      return Response.json({ itinerary: await editItineraryItem(tripId, order, edit) });
    }
    return Response.json({ error: "요청 값을 확인해주세요." }, { status: 400 });
  } catch (err) {
    return mapError(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  const parsed = await readOrder(req);
  if (!parsed) return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });

  try {
    return Response.json({
      itinerary: await deleteItineraryItem(tripId, parsed.order),
    });
  } catch (err) {
    return mapError(err);
  }
}
