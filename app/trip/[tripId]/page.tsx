"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { InviteLink } from "@/components/trip/InviteLink";
import { getTrip } from "@/features/trip";
import type { Trip } from "@/types";

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
        <p className="text-sm text-zinc-500">여행 정보를 불러오는 중...</p>
      )}

      {state.status === "error" && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            여행 정보를 불러오지 못했습니다.
          </p>
          <button
            type="button"
            onClick={retry}
            className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm dark:border-zinc-700"
          >
            다시 시도
          </button>
        </div>
      )}

      {state.status === "not-found" && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            여행을 찾을 수 없습니다.
          </p>
          <Link
            href="/trip/create"
            className="min-h-11 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            새 여행 만들기
          </Link>
        </div>
      )}

      {state.status === "ok" && <TripView trip={state.trip} />}
    </main>
  );
}

function TripView({ trip }: { trip: Trip }) {
  const itinerary = trip.itinerary ?? [];
  const [participantCount, setParticipantCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/trip/${trip.tripId}/participants`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.count === "number") {
          setParticipantCount(data.count);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [trip.tripId]);

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{trip.title}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{trip.destination}</p>
        <p className="text-sm text-zinc-500">
          {fmtDate(trip.startDate)} ~ {fmtDate(trip.endDate)}
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-500">여행 일정</h2>
        {itinerary.length === 0 ? (
          <p className="text-sm text-zinc-500">등록된 일정이 없습니다.</p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {itinerary.map((item) => (
              <li key={item.order} className="flex gap-3 text-sm">
                <span className="w-14 shrink-0 tabular-nums text-zinc-500">
                  {item.time}
                </span>
                <span>{item.placeName}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-500">일행 초대하기</h2>
          <span className="text-sm text-zinc-500">
            참여자 {participantCount ?? "–"}명
          </span>
        </div>
        <InviteLink tripId={trip.tripId} />
      </section>

      <section className="flex flex-col gap-1 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-500">Trip ID</h2>
        <p className="font-mono text-lg tracking-widest">{trip.tripId}</p>
      </section>

      <Link
        href="/trip/create"
        className="text-sm text-zinc-500 hover:underline"
      >
        + 새 여행 만들기
      </Link>
    </article>
  );
}
