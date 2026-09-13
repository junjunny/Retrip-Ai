"use client";

import { Car, Compass } from "lucide-react";
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
import { JOURNEY_GENERIC_CLOSING_MESSAGE, JOURNEY_GENERIC_CONTINUE_MESSAGE } from "@/features/trip/journeyMessages";
import type { SituationMessage } from "@/features/travel-state";
import type { ItineraryItem, MobilityOption, RoutePolylinePoint, Trip } from "@/types";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "ok"; trip: Trip };

const fmtDate = (d: string) => d.split("-").join(".");
const fmtDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`);

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

/**
 * The first not-yet-completed item, by ascending `order` — "where the
 * traveler is right now" (STEP 17, generalized to every trip in STEP 18: a
 * brand-new trip with every item still "planned" simply shows its first
 * item as current, the same rule a demo trip's pre-completed lead-in uses).
 * `null` once every item is done.
 */
function firstCurrentOrder(itinerary: ItineraryItem[]): number | null {
  const next = [...itinerary].sort((a, b) => a.order - b.order).find((it) => it.status !== "completed");
  return next?.order ?? null;
}

/** The item after `order` in ascending-order sequence, or `undefined`. */
function itemAfter(itinerary: ItineraryItem[], order: number): ItineraryItem | undefined {
  const sorted = [...itinerary].sort((a, b) => a.order - b.order);
  const i = sorted.findIndex((it) => it.order === order);
  return i >= 0 ? sorted[i + 1] : undefined;
}

/** Which real calendar day (1-based) `date` falls on within the trip. */
function dayNumber(trip: Trip, date: string): number {
  const days = [...new Set(trip.itinerary.map((it) => it.date))].sort();
  const i = days.indexOf(date);
  return i >= 0 ? i + 1 : 1;
}

function TripView({ trip: initialTrip }: { trip: Trip }) {
  const [trip, setTrip] = useState(initialTrip);
  // bump on every Re:Plan apply / journey completion so ItineraryPlaces remounts with the fresh itinerary as its initial state.
  const [itineraryVersion, setItineraryVersion] = useState(0);
  // a Re:Plan candidate's real route geometry + own pin, shown on the same map as the itinerary (STEP 13 §11, STEP 17 §20).
  const [previewPolyline, setPreviewPolyline] = useState<RoutePolylinePoint[] | null>(null);
  const [previewMarker, setPreviewMarker] = useState<PreviewMarker | null>(null);
  // STEP 16 — informational only; nothing about scoring/candidates/Re:Plan reads this.
  const demoScenario = trip.demoScenarioId ? getDemoScenario(trip.demoScenarioId) : undefined;

  // --- STEP 17/18: travel journey progress (current/completed/next) — every
  // trip, demo or not, uses this exact same mechanism (STEP 18 §32). Lags
  // one step behind the real completed-status in Firestore on purpose:
  // completing an item writes immediately, but the DISPLAYED "current" stop
  // only advances once the traveler dismisses that item's message — see
  // `completeCurrentItem`/`advanceJourney`.
  const [displayedCurrentOrder, setDisplayedCurrentOrder] = useState<number | null>(() =>
    firstCurrentOrder(initialTrip.itinerary),
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
  const nextItem = displayedCurrentOrder != null ? itemAfter(trip.itinerary, displayedCurrentOrder) : undefined;
  const nextNextItem = nextItem ? itemAfter(trip.itinerary, nextItem.order) : undefined;

  const journeyOrigin =
    currentItem?.latitude != null && currentItem?.longitude != null
      ? { latitude: currentItem.latitude, longitude: currentItem.longitude, placeName: currentItem.placeName }
      : null;

  const completedCount = trip.itinerary.filter((it) => it.status === "completed").length;

  // real current -> next Kakao Mobility (STEP 18 §9/§11) — one call, only
  // when both ends are confirmed real places; never a straight-line guess.
  // Keeps the fetched data tagged with the pair it answers, so a stale
  // result from a since-superseded pair is simply never shown (derived at
  // render time) rather than requiring a synchronous "clear" at the top of
  // the effect.
  const segmentKey =
    currentItem && nextItem && currentItem.latitude != null && nextItem.latitude != null
      ? `${currentItem.order}:${nextItem.order}`
      : null;
  const [segmentMobilityResult, setSegmentMobilityResult] = useState<{ key: string; mobility: MobilityOption[] } | null>(
    null,
  );
  useEffect(() => {
    if (!segmentKey) return;
    let cancelled = false;
    fetch(`/api/trip/${trip.tripId}/segment-mobility?from=${currentItem!.order}&to=${nextItem!.order}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.mobility) setSegmentMobilityResult({ key: segmentKey, mobility: data.mobility as MobilityOption[] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- segmentKey already encodes both orders; re-deriving currentItem/nextItem here would re-fire on every unrelated field change.
  }, [trip.tripId, segmentKey]);
  const segmentMobility = segmentMobilityResult?.key === segmentKey ? segmentMobilityResult.mobility : null;

  // real weather/traffic-derived situation line for an ORDINARY trip (STEP
  // 18 §19) — a demo trip uses its own scripted `situationLine` instead,
  // exactly like STEP 16/17 (never mixed: the scripted line is fixed
  // narrative for a controlled demo, the real one is genuinely computed).
  const [realSituation, setRealSituation] = useState<SituationMessage | null>(null);
  useEffect(() => {
    if (demoScenario) return;
    let cancelled = false;
    const params = journeyOrigin
      ? `?lat=${journeyOrigin.latitude}&lng=${journeyOrigin.longitude}`
      : "";
    fetch(`/api/trip/${trip.tripId}/situation${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setRealSituation((data?.situation as SituationMessage | null) ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depends on the origin's coordinates, not object identity (a new literal every render).
  }, [demoScenario, trip.tripId, journeyOrigin?.latitude, journeyOrigin?.longitude]);

  const atTrigger = demoScenario ? displayedCurrentOrder === triggerOrder(demoScenario) : true;
  const situationLine = demoScenario ? (atTrigger ? demoScenario.situationLine : null) : realSituation?.line ?? null;

  const handleReplanApplied = (itinerary: ItineraryItem[]) => {
    setTrip((t) => ({ ...t, itinerary }));
    setItineraryVersion((v) => v + 1);
  };

  async function completeCurrentItem() {
    if (displayedCurrentOrder == null || completing) return;
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
      const text = demoScenario
        ? demoCompletionMessage(demoScenario, order, liveItem?.placeName ?? "", hasNext)
        : hasNext
          ? JOURNEY_GENERIC_CONTINUE_MESSAGE
          : JOURNEY_GENERIC_CLOSING_MESSAGE;
      setPendingMessage({ text, hasNext });
    } finally {
      setCompleting(false);
    }
  }

  function advanceJourney() {
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

      <JourneyCard
        trip={trip}
        demoScenario={demoScenario}
        currentOrder={displayedCurrentOrder}
        currentItem={currentItem}
        nextItem={nextItem}
        nextNextItem={nextNextItem}
        completedCount={completedCount}
        segmentMobility={segmentMobility}
        pendingMessage={pendingMessage}
        completing={completing}
        onComplete={completeCurrentItem}
        onAdvance={advanceJourney}
      />

      {situationLine && !pendingMessage && (
        <section className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface-alt px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <Compass className="size-3.5 text-brand" aria-hidden />
            지금 상황
          </p>
          <p className="text-sm text-ink">{situationLine}</p>
          {demoScenario && (
            <Link href="/demo" className="mt-1 self-start text-xs text-ink-muted underline-offset-4 hover:text-brand hover:underline">
              Demo 다시 시작
            </Link>
          )}
        </section>
      )}

      <MiniGuide tripId={trip.tripId} />

      <section className="flex flex-col gap-3">
        <ItineraryPlaces
          key={itineraryVersion}
          trip={trip}
          overlayPolyline={previewPolyline}
          previewMarker={previewMarker}
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
          journeyOrigin={journeyOrigin}
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
 * (STEP 17, generalized to every trip in STEP 18 §17/§32) "지금 여행 중" +
 * progress + "다음"/"그 다음" + real current->next mobility, then "여기까지
 * 완료했어요" → a short traveler message → the next stop. Never a
 * developer-facing word ("Travel State", "state: CURRENT", a scenario id) —
 * just a plain travel narration, identical component for a demo trip and an
 * ordinary one (only the clock label and completion copy differ, and only
 * when a demo scenario is present).
 */
function JourneyCard({
  trip,
  demoScenario,
  currentOrder,
  currentItem,
  nextItem,
  nextNextItem,
  completedCount,
  segmentMobility,
  pendingMessage,
  completing,
  onComplete,
  onAdvance,
}: {
  trip: Trip;
  demoScenario: DemoScenario | undefined;
  currentOrder: number | null;
  currentItem: ItineraryItem | undefined;
  nextItem: ItineraryItem | undefined;
  nextNextItem: ItineraryItem | undefined;
  completedCount: number;
  segmentMobility: MobilityOption[] | null;
  pendingMessage: { text: string; hasNext: boolean } | null;
  completing: boolean;
  onComplete: () => void;
  onAdvance: () => void;
}) {
  const total = trip.itinerary.length;
  const startingCurrent = demoScenario ? startingCurrentOrder(demoScenario) : null;

  if (currentOrder == null || !currentItem) {
    return (
      <section className="flex flex-col gap-1 rounded-xl border border-line bg-surface-alt px-4 py-3">
        <p className="text-sm text-ink">여행이 모두 끝났어요. 계획이 달라져도 여행은 계속되니까요.</p>
      </section>
    );
  }

  const displayTime = (order: number, item: ItineraryItem) =>
    (demoScenario && (order === startingCurrent ? demoScenario.demoClockLabel : demoDisplayTime(demoScenario, order))) ||
    item.time;

  const driving = segmentMobility?.find((m) => m.mode === "DRIVING");

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line px-4 py-3.5">
      <p className="text-xs font-medium text-ink-muted">
        {trip.destination} · DAY {dayNumber(trip, currentItem.date)}
        <span className="ms-2 tabular-nums">· {completedCount} / {total} 일정 완료</span>
      </p>

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
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-ink-muted">지금 여행 중</p>
            <p className="text-lg font-semibold text-ink">{currentItem.placeName}</p>
            <p className="tabular-nums text-xs text-ink-muted">{displayTime(currentOrder, currentItem)}</p>
          </div>

          {nextItem && (
            <>
              {driving && (
                <p className="flex items-center gap-1.5 self-start rounded-lg bg-surface-alt px-2.5 py-1.5 text-xs text-ink-muted">
                  <Car className="size-3.5 shrink-0 text-brand" aria-hidden />
                  {driving.available ? (
                    <span className="tabular-nums">
                      약 {driving.durationMinutes}분 · {fmtDistance(driving.distanceMeters!)}
                      {driving.trafficLabel ? ` · ${driving.trafficLabel}` : ""}
                    </span>
                  ) : (
                    <span>이동정보를 불러올 수 없어요.</span>
                  )}
                </p>
              )}
              <div className="flex flex-col gap-1 border-t border-line pt-2">
                <p className="text-xs font-medium text-ink-muted">다음 일정</p>
                <p className="text-base font-medium text-ink">{nextItem.placeName}</p>
                <p className="tabular-nums text-xs text-ink-muted">{displayTime(nextItem.order, nextItem)}</p>
              </div>
            </>
          )}

          {nextNextItem && (
            <div className="flex items-baseline gap-2 border-t border-line pt-2 text-xs text-ink-muted">
              <span className="font-medium">그 다음</span>
              <span>{nextNextItem.placeName}</span>
            </div>
          )}

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
