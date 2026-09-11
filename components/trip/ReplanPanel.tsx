"use client";

import { useState } from "react";

import type { ItineraryItem } from "@/types";

/**
 * Thin client-side mirror of `ReplanPreview`/`ReplanSlotProposal`
 * (features/replan/replan.ts) — just enough to render plain text. No score
 * fields are used here on purpose: this STEP ships no score badge, no
 * ranking UI, no LLM explanation (see AGENTS-spec §31).
 */
interface ReplanSlotProposal {
  itineraryOrder: number;
  action: "KEEP" | "REPLACE";
  current: { placeName: string; time: string };
  proposed: { placeName: string } | null;
}
interface ReplanPreview {
  baseItineraryFingerprint: string;
  generatedAt: string;
  slots: ReplanSlotProposal[];
}

type Phase = "idle" | "loading" | "preview" | "applying" | "applied" | "error";

/**
 * [Re:Plan] is a single, always-identical CTA — its label/style never
 * changes based on Travel State (this component doesn't even read Travel
 * State). Nothing here runs unless the user presses the button: no timer, no
 * auto-refresh, no Travel-State-triggered call. Preview only ever computes;
 * only [이 계획 적용] writes anything.
 */
export function ReplanPanel({
  tripId,
  onApplied,
}: {
  tripId: string;
  onApplied: (itinerary: ItineraryItem[]) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<ReplanPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startReplan() {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch(`/api/trip/${tripId}/replan/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "failed");
      setPreview(data.preview as ReplanPreview);
      setPhase("preview");
    } catch {
      setError("계획을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.");
      setPhase("error");
    }
  }

  function keepExisting() {
    // NO WRITE — dismissing the preview never touches the itinerary.
    setPreview(null);
    setPhase("idle");
  }

  async function applyPlan() {
    if (!preview) return;
    setPhase("applying");
    setError(null);
    try {
      const res = await fetch(`/api/trip/${tripId}/replan/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseItineraryFingerprint: preview.baseItineraryFingerprint,
          generatedAt: preview.generatedAt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.stale
            ? "일정이 변경되어 이 계획을 적용할 수 없어요. 다시 계획을 생성해주세요."
            : (data.error ?? "적용하지 못했습니다. 잠시 후 다시 시도해주세요."),
        );
        setPhase("error");
        return;
      }
      onApplied(data.itinerary as ItineraryItem[]);
      setPreview(null);
      setPhase("applied");
    } catch {
      setError("적용하지 못했습니다. 잠시 후 다시 시도해주세요.");
      setPhase("error");
    }
  }

  const changedSlots = preview?.slots.filter((s) => s.action === "REPLACE") ?? [];
  const applying: boolean = phase === "applying";

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-zinc-500">Re:Plan</h2>

      {phase !== "preview" && (
        <button
          type="button"
          onClick={startReplan}
          disabled={phase === "loading"}
          className="min-h-11 self-start rounded-lg border border-zinc-300 px-4 text-sm disabled:opacity-60 dark:border-zinc-700"
        >
          {phase === "loading" ? "확인하는 중..." : "Re:Plan"}
        </button>
      )}

      {phase === "applied" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">적용되었습니다.</p>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {phase === "preview" && preview && (
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          {preview.slots.length === 0 ? (
            <p className="text-sm text-zinc-500">지금 다시 계획할 수 있는 일정이 없어요.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {preview.slots.map((s) => (
                <li key={s.itineraryOrder} className="text-sm">
                  <span className="tabular-nums text-zinc-500">{s.current.time}</span>{" "}
                  {s.action === "KEEP" ? (
                    <span>{s.current.placeName} · 기존 유지</span>
                  ) : (
                    <span>
                      {s.current.placeName} → <span className="font-medium">{s.proposed?.placeName}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {changedSlots.length > 0 ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={applyPlan}
                disabled={applying}
                className="min-h-11 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
              >
                {applying ? "적용하는 중..." : "이 계획 적용"}
              </button>
              <button
                type="button"
                onClick={keepExisting}
                disabled={applying}
                className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm disabled:opacity-60 dark:border-zinc-700"
              >
                기존 일정 유지
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={keepExisting}
              className="min-h-11 self-start rounded-lg border border-zinc-300 px-4 text-sm dark:border-zinc-700"
            >
              닫기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
