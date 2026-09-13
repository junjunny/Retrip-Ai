"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

import type { ItineraryMarker } from "@/features/trip";
import type { RoutePolylinePoint } from "@/types";

type LMap = import("leaflet").Map;
type LMarker = import("leaflet").Marker;
type LPolyline = import("leaflet").Polyline;

/** A Re:Plan candidate's own location, shown as a distinct "proposed" pin during Preview (STEP 17 §20) — never a fabricated point; only ever the real, already-resolved candidate coordinates. */
export interface PreviewMarker {
  latitude: number;
  longitude: number;
  label: string;
}

/**
 * Read-only location map. Markers are DERIVED from the itinerary (see
 * `itineraryMarkers`) — the map never holds its own place data, so the list and
 * the map can't drift apart. Items with no coordinates get no marker.
 *
 * `routePolyline` (STEP 13 §11) draws ONE real route geometry, e.g. a Re:Plan
 * candidate's driving route — never a straight line synthesized between two
 * points. `null`/`[]`/omitted draws nothing.
 *
 * `currentOrder` (STEP 17) highlights one marker as "where the traveler is
 * right now" and recenters the map on it — demo-journey-only; `null`/omitted
 * for every ordinary trip, which keeps the original fit-all-markers behavior.
 */
export function TripMap({
  markers,
  activeOrder,
  onSelectOrder,
  routePolyline,
  currentOrder,
  previewMarker,
}: {
  markers: ItineraryMarker[];
  activeOrder: number | null;
  onSelectOrder: (order: number) => void;
  routePolyline?: RoutePolylinePoint[] | null;
  currentOrder?: number | null;
  previewMarker?: PreviewMarker | null;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markerRef = useRef<Map<number, LMarker>>(new Map());
  const previewMarkerRef = useRef<LMarker | null>(null);
  const polylineRef = useRef<LPolyline | null>(null);
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
        const isCurrent = currentOrder != null && mk.order === currentOrder;
        const icon = L.divIcon({
          className: "",
          html: `<span class="${badgeClass(active, mk.confirmed, isCurrent, mk.status)}">${mk.order}</span>`,
          iconSize: isCurrent ? [32, 32] : [26, 26],
          iconAnchor: isCurrent ? [16, 16] : [13, 13],
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

      // the Re:Plan candidate's own pin during Preview — a distinct outline
      // marker, never mixed into the itinerary marker list above.
      if (previewMarker) {
        const icon = L.divIcon({
          className: "",
          html: `<span class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-accent bg-surface text-accent">●</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        if (previewMarkerRef.current) {
          previewMarkerRef.current.setLatLng([previewMarker.latitude, previewMarker.longitude]);
          previewMarkerRef.current.setIcon(icon);
        } else {
          previewMarkerRef.current = L.marker([previewMarker.latitude, previewMarker.longitude], {
            icon,
            title: previewMarker.label,
          }).addTo(map);
        }
      } else if (previewMarkerRef.current) {
        previewMarkerRef.current.remove();
        previewMarkerRef.current = null;
      }

      // real route geometry only — never a straight line between two points.
      if (routePolyline && routePolyline.length > 0) {
        const latLngs = routePolyline.map((p) => [p.latitude, p.longitude] as [number, number]);
        if (polylineRef.current) {
          polylineRef.current.setLatLngs(latLngs);
        } else {
          polylineRef.current = L.polyline(latLngs, {
            color: "#31628b",
            weight: 4,
            opacity: 0.85,
            dashArray: "1 8",
            lineCap: "round",
          }).addTo(map);
        }
      } else if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }

      // "현재 장소가 바뀌면 지도 중심도 자연스럽게 변경" (STEP 17 §19) — a demo
      // journey recenters on the current stop instead of the usual
      // fit-everything view; every ordinary trip (currentOrder omitted)
      // keeps the original behavior exactly.
      const current = currentOrder != null ? markers.find((mk) => mk.order === currentOrder) : undefined;
      if (current) {
        map.setView([current.latitude, current.longitude], 15);
      } else if (markers.length === 1) {
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
  }, [markers, activeOrder, routePolyline, currentOrder, previewMarker]);

  // dispose the map on unmount
  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current.clear();
      polylineRef.current = null;
      previewMarkerRef.current = null;
    },
    [],
  );

  if (markers.length === 0) {
    return (
      <div className="flex h-56 w-full items-center justify-center rounded-xl border border-dashed border-line text-sm text-ink-muted">
        위치가 확인된 장소가 아직 없어요.
      </div>
    );
  }

  return (
    <div
      ref={elRef}
      role="application"
      aria-label="여행 장소 지도"
      className="h-56 w-full overflow-hidden rounded-xl border border-line sm:h-72"
    />
  );
}

function badgeClass(
  active: boolean,
  confirmed: boolean,
  isCurrent: boolean,
  status: ItineraryMarker["status"],
): string {
  if (isCurrent) {
    return "flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-accent text-sm font-semibold text-accent-ink shadow-md ring-2 ring-accent/40";
  }
  const base =
    "flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface text-xs font-semibold shadow-sm";
  // a completed stop steps back visually (STEP 17 §19) — the list uses the
  // same muted treatment for the same reason.
  if (status === "completed") return `${base} bg-surface-alt text-ink-muted/70`;
  if (active) return `${base} bg-accent text-accent-ink`;
  if (confirmed) return `${base} bg-brand text-brand-ink`;
  return `${base} bg-line text-ink`;
}
