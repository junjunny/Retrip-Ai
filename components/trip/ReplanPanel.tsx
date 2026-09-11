"use client";

import { useState } from "react";

import type { ItineraryItem } from "@/types";

/**
 * Thin client-side mirror of `ReplanPreview`/`ReplanSlotProposal`
 * (features/replan/replan.ts) — just enough to render. No numeric score is
 * used here on purpose: this STEP still ships no score badge, no ranking
 * dashboard (AGENTS-spec §26) — only the STEP 11 natural-language explanation
 * and, for STEP 12, a place detail card built entirely from real data.
 */
interface ReplanSlotProposal {
  itineraryOrder: number;
  action: "KEEP" | "REPLACE";
  current: { placeName: string; time: string };
  proposed: { placeName: string; address: string | null; imageUrl: string | null } | null;
}
interface ReplanPreview {
  baseItineraryFingerprint: string;
  generatedAt: string;
  slots: ReplanSlotProposal[];
}
/** Mirrors features/replan/explanation/explanationSchema.ts's `ReplanExplanation`. */
interface ReplanExplanation {
  title: string;
  summary: string;
  reasons: string[];
  cautions: string[];
  slotReasons: { itineraryOrder: number; reason: string }[];
  placeDescriptions: { itineraryOrder: number; description: string }[];
}
/**
 * "지금 진행 중인 행사" — decided entirely server-side by comparing real dates
 * (features/replan/explanation/explanationFacts.ts's `isEventOngoing`); this
 * component only ever renders what the server already decided, never judges
 * "ongoing" itself. Dates are TourAPI's raw "YYYYMMDD" strings.
 */
interface ReplanEvent {
  itineraryOrder: number;
  startDate: string;
  endDate: string;
}

type Phase = "idle" | "loading" | "preview" | "applying" | "applied" | "error";

const fmtEventDate = (yyyymmdd: string) => `${Number(yyyymmdd.slice(4, 6))}/${Number(yyyymmdd.slice(6, 8))}`;

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
  const [explanation, setExplanation] = useState<ReplanExplanation | null>(null);
  const [events, setEvents] = useState<ReplanEvent[]>([]);
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
      setExplanation((data.explanation as ReplanExplanation | undefined) ?? null);
      setEvents((data.events as ReplanEvent[] | undefined) ?? []);
      setPhase("preview");
    } catch {
      setError("계획을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.");
      setPhase("error");
    }
  }

  function keepExisting() {
    // NO WRITE — dismissing the preview never touches the itinerary.
    setPreview(null);
    setExplanation(null);
    setEvents([]);
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
      setExplanation(null);
      setEvents([]);
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
        <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          {preview.slots.length === 0 ? (
            <p className="text-sm text-zinc-500">지금 다시 계획할 수 있는 일정이 없어요.</p>
          ) : (
            <>
              {explanation && (
                <div className="flex flex-col gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
                  <p className="font-medium">{explanation.title}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{explanation.summary}</p>
                  {explanation.reasons.length > 0 && (
                    <ul className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {explanation.reasons.map((r, i) => (
                        <li key={i}>· {r}</li>
                      ))}
                    </ul>
                  )}
                  {explanation.cautions.length > 0 && (
                    <ul className="flex flex-col gap-1 text-sm text-amber-700 dark:text-amber-400">
                      {explanation.cautions.map((c, i) => (
                        <li key={i}>⚠ {c}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <ul className="flex flex-col gap-3">
                {preview.slots.map((s) => {
                  if (s.action === "KEEP") {
                    return (
                      <li key={s.itineraryOrder} className="text-sm">
                        <span className="tabular-nums text-zinc-500">{s.current.time}</span>{" "}
                        <span>{s.current.placeName} · 기존 유지</span>
                      </li>
                    );
                  }

                  const description = explanation?.placeDescriptions.find((d) => d.itineraryOrder === s.itineraryOrder);
                  const reason = explanation?.slotReasons.find((r) => r.itineraryOrder === s.itineraryOrder);
                  const event = events.find((e) => e.itineraryOrder === s.itineraryOrder);

                  return (
                    <li
                      key={s.itineraryOrder}
                      className="flex flex-col gap-2 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
                    >
                      {s.proposed?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- external TourAPI image, no Next/Image domain config for arbitrary hosts
                        <img
                          src={s.proposed.imageUrl}
                          alt={s.proposed.placeName}
                          className="h-40 w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-16 items-center justify-center bg-zinc-100 text-xs text-zinc-400 dark:bg-zinc-800">
                          이미지 없음
                        </div>
                      )}

                      <div className="flex flex-col gap-2 p-3">
                        <div className="text-sm">
                          <span className="tabular-nums text-zinc-500">{s.current.time}</span>{" "}
                          {s.current.placeName} →{" "}
                          <span className="font-medium">{s.proposed?.placeName}</span>
                        </div>
                        {s.proposed?.address && (
                          <p className="text-xs text-zinc-500">{s.proposed.address}</p>
                        )}
                        {description && (
                          <p className="text-sm text-zinc-700 dark:text-zinc-300">{description.description}</p>
                        )}
                        {event && (
                          <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            ✨ 지금 진행 중인 행사 · {fmtEventDate(event.startDate)} ~ {fmtEventDate(event.endDate)}
                          </p>
                        )}
                        {reason && (
                          <p className="text-xs text-zinc-500">💡 {reason.reason}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
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
