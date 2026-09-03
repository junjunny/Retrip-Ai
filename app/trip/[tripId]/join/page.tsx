"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { JoinForm } from "@/components/participant/JoinForm";
import { getTrip } from "@/features/trip";
import type { Trip } from "@/types";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "ok"; trip: Trip };

export default function JoinPage({
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

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">여행에 참여하기</h1>
      <div className="mt-6">
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
              onClick={() => setReloadKey((k) => k + 1)}
              className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm dark:border-zinc-700"
            >
              다시 시도
            </button>
          </div>
        )}
        {state.status === "not-found" && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              여행을 찾을 수 없습니다. 초대 링크를 다시 확인해주세요.
            </p>
            <Link href="/" className="text-sm text-zinc-500 hover:underline">
              Re:Trip AI 홈으로
            </Link>
          </div>
        )}
        {state.status === "ok" && <JoinForm tripId={tripId} trip={state.trip} />}
      </div>
    </main>
  );
}
