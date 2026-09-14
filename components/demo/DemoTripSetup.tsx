"use client";

import { Cloud, CloudRain, CloudSnow, Sun, User } from "lucide-react";
import { useEffect, useState } from "react";

import { PREFERENCE_ICON } from "@/components/trip/preferenceIcons";
import { demoDisplayTime, type DemoScenario } from "@/features/demo";
import { topExperienceHighlights } from "@/features/replan";
import type { DailyOutlook, ForecastOutlook, ForecastOutlookKind } from "@/features/travel-state";
import type { Trip } from "@/types";

const fmtDate = (d: string) => d.split("-").join(".");
const OUTLOOK_ICON: Record<ForecastOutlookKind, typeof Sun> = {
  clear: Sun,
  cloudy: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
};

/**
 * (STEP 22 §3/§4/§7/§11) "여행 설정 확인" — shown once, right after a demo
 * trip is created and every place resolved, BEFORE the journey itself
 * starts. Turns "this demo has a real Trip Preference and 3 real
 * participants" into something a judge actually SEES before the first
 * itinerary item, instead of only ever mattering invisibly inside scoring.
 *
 * Every number here is real: `scenario.travelers` were just seeded through
 * the ordinary `/submit` endpoint (features/demo/demoService.ts), and
 * `scenario.tripPreference` is `buildExperienceProfile` of their own real
 * vectors (features/demo/demoScenarios.ts) — never a separately hand-picked
 * value. The weather section calls the real KMA-backed endpoint and shows
 * an honest "아직 확인할 수 없어요" for any date outside its real forecast
 * window — never an invented forecast.
 */
export function DemoTripSetup({
  scenario,
  trip,
  onStart,
}: {
  scenario: DemoScenario;
  trip: Trip;
  onStart: () => void;
}) {
  const [outlook, setOutlook] = useState<DailyOutlook[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/trip/${trip.tripId}/weather-outlook`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setOutlook((data?.days as DailyOutlook[] | undefined) ?? []);
      })
      .catch(() => {
        if (!cancelled) setOutlook([]);
      });
    return () => {
      cancelled = true;
    };
  }, [trip.tripId]);

  const days = [...new Set(trip.itinerary.map((i) => i.date))].sort();
  const outlookByDate = new Map((outlook ?? []).map((d) => [d.date, d]));
  const highlights = topExperienceHighlights(scenario.tripPreference);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-7 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-ink-muted">{scenario.cardDuration}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{scenario.title}</h1>
      </div>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-sm font-medium text-ink-muted">{scenario.travelers.length}명의 여행</h2>
        <ul className="flex flex-col gap-2">
          {scenario.travelers.map((t) => (
            <li key={t.name} className="flex items-start gap-3 rounded-xl border border-line px-3.5 py-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink-muted">
                <User className="size-4" aria-hidden />
              </span>
              <div className="flex flex-col gap-0.5">
                <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  {t.name}
                  {t.role === "HOST" && (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-normal text-brand">방장</span>
                  )}
                </p>
                <p className="text-sm text-ink-muted">{t.blurb}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {highlights.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-ink-muted">우리가 이번 여행에서 중요하게 생각하는 것</h2>
          <ul className="flex flex-wrap gap-1.5">
            {highlights.map((h) => {
              const Icon = PREFERENCE_ICON[h.key];
              return (
                <li
                  key={h.key}
                  className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-ink"
                >
                  <Icon className="size-3.5 text-brand" aria-hidden />
                  {h.label}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-ink-muted">전체 일정</h2>
        {days.map((date, i) => {
          const items = trip.itinerary.filter((it) => it.date === date);
          const dayOutlook = outlookByDate.get(date);
          return (
            <div key={date} className="flex flex-col gap-2 rounded-xl border border-line px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-medium text-ink">
                  DAY {i + 1} <span className="text-ink-muted">· {fmtDate(date)}</span>
                </p>
                {outlook != null && (
                  <div className="flex items-center gap-3 text-xs text-ink-muted">
                    {dayOutlook?.am && <OutlookBadge outlook={dayOutlook.am} label="오전" />}
                    {dayOutlook?.pm && <OutlookBadge outlook={dayOutlook.pm} label="오후" />}
                    {dayOutlook && !dayOutlook.am && !dayOutlook.pm && (
                      <span>아직 정확한 예보를 확인할 수 없어요</span>
                    )}
                  </div>
                )}
              </div>
              <ol className="flex flex-col gap-1 text-sm">
                {items.map((it) => (
                  <li key={it.order} className="flex items-center gap-2">
                    <span className="tabular-nums text-ink-muted">
                      {demoDisplayTime(scenario, it.order) ?? it.time}
                    </span>
                    <span className="text-ink">{it.placeName}</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </section>

      <button
        type="button"
        onClick={onStart}
        className="min-h-11 rounded-xl bg-brand px-4 text-sm font-medium text-brand-ink"
      >
        여행 시작하기
      </button>
    </main>
  );
}

function OutlookBadge({ outlook, label }: { outlook: ForecastOutlook; label: string }) {
  const Icon = OUTLOOK_ICON[outlook.kind];
  return (
    <span className="flex items-center gap-1">
      {label}
      <Icon className="size-3.5" aria-hidden />
      {outlook.label}
    </span>
  );
}
