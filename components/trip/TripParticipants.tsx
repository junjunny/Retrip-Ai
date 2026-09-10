"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { InviteLink } from "@/components/trip/InviteLink";
import { loadSession } from "@/lib/participantSession";

interface ParticipantsData {
  count: number;
  participants: { nickname: string }[];
}

/**
 * "함께 여행하는 사람" — nickname list + invite link + a CTA to add / edit
 * your own preferences. Preference numbers are never shown here.
 */
export function TripParticipants({ tripId }: { tripId: string }) {
  const [data, setData] = useState<ParticipantsData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/trip/${tripId}/participants`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (!cancelled && d && Array.isArray(d.participants)) {
          setData({ count: d.count ?? d.participants.length, participants: d.participants });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  // did this browser already join? (localStorage — client only)
  const joined = useSyncExternalStore(
    () => () => {},
    () => loadSession(tripId) != null,
    () => false,
  );

  const names = data?.participants.map((p) => p.nickname).filter(Boolean) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-500">함께 여행하는 사람</h2>
        <span className="text-sm text-zinc-500">
          {data ? `${data.count}명` : "–"}
        </span>
      </div>

      {names.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {names.map((n, i) => (
            <li
              key={`${n}-${i}`}
              className="rounded-full bg-zinc-100 px-3 py-1 text-sm dark:bg-zinc-800"
            >
              <span aria-hidden>👤 </span>
              {n}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">아직 참여한 사람이 없어요.</p>
      )}

      <Link
        href={`/trip/${tripId}/join`}
        className="min-h-11 self-start rounded-lg border border-zinc-300 px-4 py-2.5 text-sm dark:border-zinc-700"
      >
        {joined ? "내 여행 선호도 수정하기" : "내 여행 선호도 알려주기"}
      </Link>

      <div className="pt-1">
        <p className="mb-1.5 text-xs text-zinc-500">친구 초대하기</p>
        <InviteLink tripId={tripId} />
      </div>
    </div>
  );
}
