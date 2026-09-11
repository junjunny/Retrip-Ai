"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { ItineraryPlaces } from "@/components/trip/ItineraryPlaces";
import { MiniGuide } from "@/components/trip/MiniGuide";
import { ReplanPanel } from "@/components/trip/ReplanPanel";
import { TripParticipants } from "@/components/trip/TripParticipants";
import { getTrip } from "@/features/trip";
import type { ItineraryItem, RoutePolylinePoint, Trip } from "@/types";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "ok"; trip: Trip };

const fmtDate = (d: string) => d.split("-").join(".");

export default function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = use(params);
  const [state, setState] = useState<State>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getTrip(tripId)
      .then((trip) => {
        if (!cancelled) {
          setState(trip ? { status: "ok", trip } : { status: "not-found" });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [tripId, reloadKey]);

  const retry = () => {
    setState({ status: "loading" });
    setReloadKey((k) => k + 1);
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      {state.status === "loading" && (
        <div className="flex flex-col gap-4" aria-busy="true">
          <div className="h-7 w-40 animate-pulse rounded-lg bg-surface-alt" />
          <div className="h-4 w-24 animate-pulse rounded-lg bg-surface-alt" />
          <div className="h-56 w-full animate-pulse rounded-xl bg-surface-alt" />
        </div>
      )}

      {state.status === "error" && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink">
            여행 정보를 불러오지 못했습니다.
          </p>
          <button
            type="button"
            onClick={retry}
            className="min-h-11 rounded-xl border border-line px-4 text-sm text-ink"
          >
            다시 시도
          </button>
        </div>
      )}

      {state.status === "not-found" && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink">
            여행을 찾을 수 없습니다.
          </p>
          <Link
            href="/trip/create"
            className="flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-medium text-brand-ink"
          >
            새 여행 만들기
          </Link>
        </div>
      )}

      {state.status === "ok" && <TripView trip={state.trip} />}
    </main>
  );
}

function TripView({ trip: initialTrip }: { trip: Trip }) {
  const [trip, setTrip] = useState(initialTrip);
  // bump on every Re:Plan apply so ItineraryPlaces remounts with the fresh itinerary as its initial state.
  const [itineraryVersion, setItineraryVersion] = useState(0);
  // a Re:Plan candidate's real route geometry, shown on the same map as the itinerary (STEP 13 §11).
  const [previewPolyline, setPreviewPolyline] = useState<RoutePolylinePoint[] | null>(null);

  const handleReplanApplied = (itinerary: ItineraryItem[]) => {
    setTrip((t) => ({ ...t, itinerary }));
    setItineraryVersion((v) => v + 1);
  };

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-ink-muted">{trip.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{trip.destination}</h1>
        <p className="text-sm tabular-nums text-ink-muted">
          {fmtDate(trip.startDate)} — {fmtDate(trip.endDate)}
        </p>
      </header>

      <MiniGuide tripId={trip.tripId} />

      <section className="flex flex-col gap-3">
        <ItineraryPlaces key={itineraryVersion} trip={trip} overlayPolyline={previewPolyline} />
      </section>

      <section className="border-t border-line pt-4">
        <ReplanPanel
          tripId={trip.tripId}
          itinerary={trip.itinerary}
          onApplied={handleReplanApplied}
          onPolylinePreview={setPreviewPolyline}
        />
      </section>

      <section className="border-t border-line pt-4">
        <TripParticipants tripId={trip.tripId} />
      </section>

      <section className="flex flex-col gap-1 border-t border-line pt-4">
        <h2 className="text-sm font-medium text-ink-muted">Trip ID</h2>
        <p className="font-mono text-lg tracking-widest text-ink">{trip.tripId}</p>
      </section>

      <Link
        href="/trip/create"
        className="text-sm text-ink-muted hover:text-brand hover:underline"
      >
        + 새 여행 만들기
      </Link>
    </article>
  );
}
