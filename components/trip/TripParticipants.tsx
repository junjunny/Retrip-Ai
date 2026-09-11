"use client";

import { User } from "lucide-react";
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
        <h2 className="text-sm font-medium text-ink-muted">함께 여행하는 사람</h2>
        <span className="text-sm text-ink-muted">
          {data ? `${data.count}명` : "–"}
        </span>
      </div>

      {names.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {names.map((n, i) => (
            <li
              key={`${n}-${i}`}
              className="flex items-center gap-1.5 rounded-full bg-surface-alt px-3 py-1 text-sm text-ink"
            >
              <User className="size-3.5 text-ink-muted" aria-hidden />
              {n}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">아직 참여한 사람이 없어요.</p>
      )}

      <Link
        href={`/trip/${tripId}/join`}
        className="flex min-h-11 items-center self-start rounded-xl border border-line px-4 text-sm text-ink"
      >
        {joined ? "내 여행 선호도 수정하기" : "내 여행 선호도 알려주기"}
      </Link>

      <div className="pt-1">
        <p className="mb-1.5 text-xs text-ink-muted">친구 초대하기</p>
        <InviteLink tripId={tripId} />
      </div>
    </div>
  );
}
