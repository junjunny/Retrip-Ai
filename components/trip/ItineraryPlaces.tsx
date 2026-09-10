"use client";

import { useMemo, useState } from "react";

import { PlaceConfirmSheet } from "@/components/trip/PlaceConfirmSheet";
import { TripMap } from "@/components/trip/TripMap";
import { itineraryMarkers, type PlaceChoice } from "@/features/trip";
import type { ItineraryItem, Trip } from "@/types";

const fmtDate = (d: string) => d.split("-").join(".");

/**
 * Itinerary list + location map. `items` is the single source of truth; the map
 * markers are derived from it. Confirming / editing a place PATCHes the server,
 * then updates `items` — the map re-derives, so list and map stay in sync.
 */
export function ItineraryPlaces({ trip }: { trip: Trip }) {
  const [items, setItems] = useState<ItineraryItem[]>(trip.itinerary ?? []);
  const [activeOrder, setActiveOrder] = useState<number | null>(null);
  const [editingOrder, setEditingOrder] = useState<number | null>(null);

  const markers = useMemo(() => itineraryMarkers(items), [items]);
  const multiDay = useMemo(
    () => new Set(items.map((i) => i.date)).size > 1,
    [items],
  );
  const editingItem = items.find((i) => i.order === editingOrder) ?? null;

  async function choosePlace(order: number, choice: PlaceChoice) {
    const res = await fetch(`/api/trip/${trip.tripId}/itinerary`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order, place: choice }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "failed");
    setItems(data.itinerary as ItineraryItem[]);
    setActiveOrder(order);
  }

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">등록된 일정이 없습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <TripMap
        markers={markers}
        activeOrder={activeOrder}
        onSelectOrder={setActiveOrder}
      />

      <ol className="flex flex-col gap-2">
        {items.map((item) => {
          const active = item.order === activeOrder;
          const hasCoords = item.latitude != null && item.longitude != null;
          return (
            <li
              key={item.order}
              className={`rounded-xl border p-3 ${
                active
                  ? "border-blue-500 bg-blue-50/50 dark:border-blue-400 dark:bg-blue-950/30"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <button
                type="button"
                onClick={() =>
                  setActiveOrder((o) => (o === item.order ? null : item.order))
                }
                className="flex w-full items-start gap-3 text-left"
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${
                    hasCoords
                      ? item.placeConfirmed
                        ? "bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900"
                        : "bg-zinc-400"
                      : "bg-zinc-300 dark:bg-zinc-700"
                  }`}
                >
                  {item.order}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="tabular-nums text-zinc-500">
                      {multiDay ? `${fmtDate(item.date)} ` : ""}
                      {item.time}
                    </span>
                    <span className="font-medium">{item.placeName}</span>
                    {item.scheduleType === "fixed" && (
                      <span className="rounded bg-zinc-100 px-1.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        고정
                      </span>
                    )}
                  </span>
                  {item.address && (
                    <span className="mt-0.5 block truncate text-xs text-zinc-500">
                      {item.address}
                    </span>
                  )}
                  <span className="mt-0.5 block text-xs">
                    {item.placeConfirmed ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        ✓ 장소 확인됨
                      </span>
                    ) : (
                      <span className="text-zinc-500">장소를 확인해주세요</span>
                    )}
                    {!hasCoords && (
                      <span className="ml-2 text-amber-600">위치 미확인</span>
                    )}
                  </span>
                </span>
              </button>

              <div className="mt-2 flex gap-2 pl-9">
                <button
                  type="button"
                  onClick={() => setEditingOrder(item.order)}
                  className="min-h-9 rounded-lg border border-zinc-300 px-3 text-xs dark:border-zinc-700"
                >
                  {item.placeConfirmed ? "장소 수정" : "장소 확인"}
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {editingItem && (
        <PlaceConfirmSheet
          tripId={trip.tripId}
          item={editingItem}
          onClose={() => setEditingOrder(null)}
          onChoose={(choice) => choosePlace(editingItem.order, choice)}
        />
      )}
    </div>
  );
}
