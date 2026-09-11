"use client";

import { CheckCircle2, MapPin, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { ItineraryEditSheet } from "@/components/trip/ItineraryEditSheet";
import { PlaceConfirmSheet } from "@/components/trip/PlaceConfirmSheet";
import { TripMap } from "@/components/trip/TripMap";
import { itineraryMarkers } from "@/features/trip";
import type { ItineraryEdit, PlaceChoice } from "@/features/trip";
import type { ItineraryItem, RoutePolylinePoint, Trip } from "@/types";

const fmtDate = (d: string) => d.split("-").join(".");

type Sheet =
  | { kind: "place"; order: number }
  | { kind: "edit"; order: number }
  | null;

/**
 * Itinerary list + location map. `items` is the single source of truth; the map
 * markers are derived from it. Confirm / edit place / edit schedule / delete all
 * PATCH-or-DELETE the server, then update `items` — list and map stay in sync.
 *
 * Rows are connected with a plain vertical line (STEP 14 §8) — a visual flow
 * cue only, never a fabricated travel time between them (no route data is
 * computed for the base itinerary; only Re:Plan candidates get a real one).
 */
export function ItineraryPlaces({
  trip,
  overlayPolyline,
}: {
  trip: Trip;
  /** a Re:Plan candidate's real route geometry to overlay on the map (STEP 13 §11) — see ReplanPanel's `onPolylinePreview`. */
  overlayPolyline?: RoutePolylinePoint[] | null;
}) {
  const [items, setItems] = useState<ItineraryItem[]>(trip.itinerary ?? []);
  const [activeOrder, setActiveOrder] = useState<number | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busyOrder, setBusyOrder] = useState<number | null>(null);

  const markers = useMemo(() => itineraryMarkers(items), [items]);
  const multiDay = useMemo(() => new Set(items.map((i) => i.date)).size > 1, [items]);
  const sheetItem = sheet ? (items.find((i) => i.order === sheet.order) ?? null) : null;

  async function send(order: number, init: RequestInit) {
    const res = await fetch(`/api/trip/${trip.tripId}/itinerary`, {
      headers: { "content-type": "application/json" },
      ...init,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "failed");
    setItems(data.itinerary as ItineraryItem[]);
  }

  const choosePlace = (order: number, place: PlaceChoice) =>
    send(order, { method: "PATCH", body: JSON.stringify({ order, place }) }).then(
      () => setActiveOrder(order),
    );

  const editItem = (order: number, edit: ItineraryEdit) =>
    send(order, { method: "PATCH", body: JSON.stringify({ order, edit }) });

  async function deleteItem(order: number) {
    if (busyOrder !== null) return;
    if (!confirm("이 일정을 삭제할까요?")) return;
    setBusyOrder(order);
    try {
      await send(order, { method: "DELETE", body: JSON.stringify({ order }) });
      setActiveOrder(null);
    } catch {
      alert("삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusyOrder(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <TripMap markers={[]} activeOrder={null} onSelectOrder={() => {}} routePolyline={overlayPolyline} />
        <p className="text-sm text-ink-muted">등록된 일정이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TripMap markers={markers} activeOrder={activeOrder} onSelectOrder={setActiveOrder} routePolyline={overlayPolyline} />

      <ol className="flex flex-col">
        {items.map((item, i) => {
          const active = item.order === activeOrder;
          const hasCoords = item.latitude != null && item.longitude != null;
          const isLast = i === items.length - 1;
          return (
            <li key={item.order} className="relative flex gap-3 pb-3">
              {/* order badge + connecting line (visual flow only — no fabricated time) */}
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    hasCoords
                      ? item.placeConfirmed
                        ? "bg-brand text-brand-ink"
                        : "bg-surface-alt text-ink-muted ring-1 ring-inset ring-line"
                      : "bg-surface-alt text-ink-muted/60 ring-1 ring-inset ring-line"
                  }`}
                >
                  {item.order}
                </span>
                {!isLast && <span className="mt-1 w-px flex-1 bg-line" aria-hidden />}
              </div>

              <div
                className={`min-w-0 flex-1 rounded-xl border p-3 ${
                  active ? "border-brand bg-brand/5" : "border-line bg-surface"
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setActiveOrder((o) => (o === item.order ? null : item.order))
                  }
                  className="flex w-full flex-col items-start gap-0.5 text-left"
                >
                  <span className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="tabular-nums text-ink-muted">
                      {multiDay ? `${fmtDate(item.date)} ` : ""}
                      {item.time}
                    </span>
                    <span className="font-medium text-ink">{item.placeName}</span>
                    {item.scheduleType === "fixed" && (
                      <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs text-ink-muted">
                        고정
                      </span>
                    )}
                  </span>
                  {item.address && (
                    <span className="flex items-center gap-1 truncate text-xs text-ink-muted">
                      <MapPin className="size-3 shrink-0" aria-hidden />
                      {item.address}
                    </span>
                  )}
                  <span className="mt-0.5 text-xs">
                    {item.placeConfirmed ? (
                      <span className="flex items-center gap-1 text-success">
                        <CheckCircle2 className="size-3" aria-hidden />
                        장소 확인됨
                      </span>
                    ) : (
                      <span className="text-ink-muted">장소를 확인해주세요</span>
                    )}
                    {!hasCoords && (
                      <span className="ms-2 text-warning">위치 미확인</span>
                    )}
                  </span>
                </button>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSheet({ kind: "place", order: item.order })}
                    className="flex min-h-11 items-center gap-1 rounded-lg border border-line px-2.5 text-xs text-ink"
                  >
                    <MapPin className="size-3.5" aria-hidden />
                    {item.placeConfirmed ? "장소 수정" : "장소 확인"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSheet({ kind: "edit", order: item.order })}
                    className="flex min-h-11 items-center gap-1 rounded-lg border border-line px-2.5 text-xs text-ink"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    일정 수정
                  </button>
                  <button
                    type="button"
                    disabled={busyOrder !== null}
                    onClick={() => deleteItem(item.order)}
                    aria-label="일정 삭제"
                    className="flex min-h-11 items-center justify-center rounded-lg border border-line px-2.5 text-ink-muted disabled:opacity-40"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {sheet?.kind === "place" && sheetItem && (
        <PlaceConfirmSheet
          tripId={trip.tripId}
          item={sheetItem}
          onClose={() => setSheet(null)}
          onChoose={(choice) => choosePlace(sheetItem.order, choice)}
        />
      )}
      {sheet?.kind === "edit" && sheetItem && (
        <ItineraryEditSheet
          trip={trip}
          item={sheetItem}
          onClose={() => setSheet(null)}
          onSave={(edit) => editItem(sheetItem.order, edit)}
        />
      )}
    </div>
  );
}
