"use client";

import { Compass } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";

import { ItineraryPlaces } from "@/components/trip/ItineraryPlaces";
import { MiniGuide } from "@/components/trip/MiniGuide";
import { ReplanPanel } from "@/components/trip/ReplanPanel";
import type { PreviewMarker } from "@/components/trip/TripMap";
import { TripParticipants } from "@/components/trip/TripParticipants";
import {
  demoCompletionMessage,
  demoDisplayTime,
  getDemoScenario,
  scenarioFlatItems,
  startingCurrentOrder,
  triggerOrder,
  type DemoScenario,
} from "@/features/demo";
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

/** The first not-yet-completed item, by ascending `order` — "where the traveler is right now" (STEP 17). `null` once every item is done. */
function firstCurrentOrder(itinerary: ItineraryItem[]): number | null {
  const next = [...itinerary].sort((a, b) => a.order - b.order).find((it) => it.status !== "completed");
  return next?.order ?? null;
}

function TripView({ trip: initialTrip }: { trip: Trip }) {
  const [trip, setTrip] = useState(initialTrip);
  // bump on every Re:Plan apply / demo completion so ItineraryPlaces remounts with the fresh itinerary as its initial state.
  const [itineraryVersion, setItineraryVersion] = useState(0);
  // a Re:Plan candidate's real route geometry + own pin, shown on the same map as the itinerary (STEP 13 §11, STEP 17 §20).
  const [previewPolyline, setPreviewPolyline] = useState<RoutePolylinePoint[] | null>(null);
  const [previewMarker, setPreviewMarker] = useState<PreviewMarker | null>(null);
  // STEP 16 — informational only; nothing about scoring/candidates/Re:Plan reads this.
  const demoScenario = trip.demoScenarioId ? getDemoScenario(trip.demoScenarioId) : undefined;

  // --- STEP 17: demo journey progress (current/completed/next) ---
  // Lags one step behind the real completed-status in Firestore on purpose:
  // completing an item writes immediately, but the DISPLAYED "current" stop
  // only advances once the traveler dismisses that item's message — see
  // `completeCurrentDemoItem`/`advanceDemoJourney`.
  const [displayedCurrentOrder, setDisplayedCurrentOrder] = useState<number | null>(() =>
    demoScenario ? firstCurrentOrder(initialTrip.itinerary) : null,
  );
  const [pendingMessage, setPendingMessage] = useState<{ text: string; hasNext: boolean } | null>(null);
  const [completing, setCompleting] = useState(false);

  const demoDisplayTimes = useMemo(() => {
    if (!demoScenario) return undefined;
    const map: Record<number, string> = {};
    scenarioFlatItems(demoScenario).forEach((it, i) => {
      map[i + 1] = it.time;
    });
    return map;
  }, [demoScenario]);

  const currentItem = displayedCurrentOrder != null
    ? trip.itinerary.find((it) => it.order === displayedCurrentOrder)
    : undefined;
  const atTrigger = demoScenario && displayedCurrentOrder === triggerOrder(demoScenario);
  const demoOrigin =
    demoScenario && currentItem?.latitude != null && currentItem?.longitude != null
      ? { latitude: currentItem.latitude, longitude: currentItem.longitude, placeName: currentItem.placeName }
      : null;

  const handleReplanApplied = (itinerary: ItineraryItem[]) => {
    setTrip((t) => ({ ...t, itinerary }));
    setItineraryVersion((v) => v + 1);
  };

  async function completeCurrentDemoItem() {
    if (!demoScenario || displayedCurrentOrder == null || completing) return;
    const order = displayedCurrentOrder;
    setCompleting(true);
    try {
      const res = await fetch(`/api/trip/${trip.tripId}/itinerary`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order, complete: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const nextItinerary = data.itinerary as ItineraryItem[];
      const liveItem = nextItinerary.find((it) => it.order === order);
      const hasNext = nextItinerary.some((it) => it.order === order + 1);
      setTrip((t) => ({ ...t, itinerary: nextItinerary }));
      setItineraryVersion((v) => v + 1);
      setPendingMessage({
        text: demoCompletionMessage(demoScenario, order, liveItem?.placeName ?? "", hasNext),
        hasNext,
      });
    } finally {
      setCompleting(false);
    }
  }

  function advanceDemoJourney() {
    setPendingMessage(null);
    setDisplayedCurrentOrder(firstCurrentOrder(trip.itinerary));
  }

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-ink-muted">{trip.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{trip.destination}</h1>
        <p className="text-sm tabular-nums text-ink-muted">
          {fmtDate(trip.startDate)} — {fmtDate(trip.endDate)}
        </p>
      </header>

      {demoScenario && (
        <DemoJourneyCard
          scenario={demoScenario}
          startingCurrent={startingCurrentOrder(demoScenario)}
          currentOrder={displayedCurrentOrder}
          currentItem={currentItem}
          pendingMessage={pendingMessage}
          completing={completing}
          onComplete={completeCurrentDemoItem}
          onAdvance={advanceDemoJourney}
        />
      )}

      {atTrigger && !pendingMessage && (
        <section className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface-alt px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <Compass className="size-3.5 text-brand" aria-hidden />
            지금 상황
          </p>
          <p className="text-sm text-ink">{demoScenario.situationLine}</p>
          <Link href="/demo" className="mt-1 self-start text-xs text-ink-muted underline-offset-4 hover:text-brand hover:underline">
            Demo 다시 시작
          </Link>
        </section>
      )}

      <MiniGuide tripId={trip.tripId} />

      <section className="flex flex-col gap-3">
        <ItineraryPlaces
          key={itineraryVersion}
          trip={trip}
          overlayPolyline={previewPolyline}
          previewMarker={previewMarker}
          isDemo={Boolean(demoScenario)}
          currentOrder={displayedCurrentOrder}
          demoDisplayTimes={demoDisplayTimes}
        />
      </section>

      <section className="border-t border-line pt-4">
        <ReplanPanel
          tripId={trip.tripId}
          itinerary={trip.itinerary}
          onApplied={handleReplanApplied}
          onPolylinePreview={setPreviewPolyline}
          onPreviewMarker={setPreviewMarker}
          demoOrigin={demoOrigin}
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

/**
 * (STEP 17) "지금 어디에 있는지" + "여기까지 완료했어요" → a short traveler
 * message → the next stop. Never shows a developer-facing word ("Travel
 * State", "state: CURRENT", a scenario id) — just a plain travel narration.
 */
function DemoJourneyCard({
  scenario,
  startingCurrent,
  currentOrder,
  currentItem,
  pendingMessage,
  completing,
  onComplete,
  onAdvance,
}: {
  scenario: DemoScenario;
  startingCurrent: number;
  currentOrder: number | null;
  currentItem: ItineraryItem | undefined;
  pendingMessage: { text: string; hasNext: boolean } | null;
  completing: boolean;
  onComplete: () => void;
  onAdvance: () => void;
}) {
  if (currentOrder == null || !currentItem) {
    return (
      <section className="flex flex-col gap-1 rounded-xl border border-line bg-surface-alt px-4 py-3">
        <p className="text-sm text-ink">여행이 모두 끝났어요. 계획이 달라져도 여행은 계속되니까요.</p>
      </section>
    );
  }

  const clockLabel = currentOrder === startingCurrent ? scenario.demoClockLabel : demoDisplayTime(scenario, currentOrder);

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-line px-4 py-3.5">
      {pendingMessage ? (
        <>
          <p className="text-sm leading-relaxed text-ink">{pendingMessage.text}</p>
          {pendingMessage.hasNext && (
            <button
              type="button"
              onClick={onAdvance}
              className="min-h-11 self-start rounded-xl bg-brand px-4 text-sm font-medium text-brand-ink"
            >
              다음 일정으로 이동 →
            </button>
          )}
        </>
      ) : (
        <>
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <span className="tabular-nums">{clockLabel}</span>
            <span>· 지금 여행 중</span>
          </p>
          <p className="text-lg font-semibold text-ink">{currentItem.placeName}</p>
          <button
            type="button"
            onClick={onComplete}
            disabled={completing}
            className="min-h-11 self-start rounded-xl border border-line px-4 text-sm text-ink transition-opacity disabled:opacity-60"
          >
            {completing ? "확인하는 중..." : "여기까지 완료했어요 →"}
          </button>
        </>
      )}
    </section>
  );
}
