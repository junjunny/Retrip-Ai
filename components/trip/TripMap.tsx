"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

import type { ItineraryMarker } from "@/features/trip";

type LMap = import("leaflet").Map;
type LMarker = import("leaflet").Marker;

/**
 * Read-only location map. Markers are DERIVED from the itinerary (see
 * `itineraryMarkers`) — the map never holds its own place data, so the list and
 * the map can't drift apart. Items with no coordinates get no marker.
 */
export function TripMap({
  markers,
  activeOrder,
  onSelectOrder,
}: {
  markers: ItineraryMarker[];
  activeOrder: number | null;
  onSelectOrder: (order: number) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markerRef = useRef<Map<number, LMarker>>(new Map());
  const onSelectRef = useRef(onSelectOrder);
  useEffect(() => {
    onSelectRef.current = onSelectOrder;
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = await import("leaflet");
      if (cancelled || !elRef.current) return;

      if (!mapRef.current) {
        const created = L.map(elRef.current, { attributionControl: true }).setView(
          [36.5, 127.9],
          6,
        );
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(created);
        mapRef.current = created;
      }
      const map = mapRef.current;
      const live = markerRef.current;

      // drop markers whose item is gone
      for (const [order, m] of live) {
        if (!markers.some((mk) => mk.order === order)) {
          m.remove();
          live.delete(order);
        }
      }

      for (const mk of markers) {
        const active = mk.order === activeOrder;
        const icon = L.divIcon({
          className: "",
          html: `<span class="${badgeClass(active, mk.confirmed)}">${mk.order}</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        const existing = live.get(mk.order);
        if (existing) {
          existing.setLatLng([mk.latitude, mk.longitude]);
          existing.setIcon(icon);
        } else {
          const m = L.marker([mk.latitude, mk.longitude], { icon, title: mk.placeName });
          m.on("click", () => onSelectRef.current(mk.order));
          m.addTo(map);
          live.set(mk.order, m);
        }
      }

      if (markers.length === 1) {
        map.setView([markers[0].latitude, markers[0].longitude], 15);
      } else if (markers.length > 1) {
        map.fitBounds(
          L.latLngBounds(
            markers.map((mk) => [mk.latitude, mk.longitude] as [number, number]),
          ),
          { padding: [36, 36], maxZoom: 15 },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markers, activeOrder]);

  // dispose the map on unmount
  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current.clear();
    },
    [],
  );

  if (markers.length === 0) {
    return (
      <div className="flex h-56 w-full items-center justify-center rounded-xl border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-700">
        위치가 확인된 장소가 아직 없어요.
      </div>
    );
  }

  return (
    <div
      ref={elRef}
      role="application"
      aria-label="여행 장소 지도"
      className="h-56 w-full overflow-hidden rounded-xl border border-zinc-200 sm:h-72 dark:border-zinc-800"
    />
  );
}

function badgeClass(active: boolean, confirmed: boolean): string {
  const base =
    "flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-semibold shadow";
  if (active) return `${base} border-white bg-blue-600 text-white`;
  if (confirmed) return `${base} border-white bg-zinc-900 text-white`;
  return `${base} border-white bg-zinc-400 text-white`;
}
