"use client";

import { ChevronDown, User } from "lucide-react";
import { useState } from "react";

import { demoDisplayDate, demoDisplayTime, type DemoScenario, type DemoTraveler } from "@/features/demo";
import { topExperienceHighlights } from "@/features/replan";
import { PREFERENCE_ICON } from "@/components/trip/preferenceIcons";
import type { Trip } from "@/types";

/**
 * (STEP 22 §3/§4/§7/§9-12) "여행 설정 확인" — shown once, right after a demo
 * trip is created and every place resolved, BEFORE the journey itself
 * starts. Turns "this demo has a real Trip Preference and 3 real
 * participants" into something a judge actually SEES before the first
 * itinerary item, instead of only ever mattering invisibly inside scoring.
 *
 * Every number here is real: `scenario.travelers` were just seeded through
 * the ordinary `/submit` endpoint (features/demo/demoService.ts), and
 * `scenario.tripPreference` is `buildExperienceProfile` of their own real
 * vectors (features/demo/demoScenarios.ts) — never a separately hand-picked
 * value. The weather section shows the scenario's own DEMO-ONLY simulated
 * outlook (never a real KMA forecast — see `DemoWeatherOutlook`'s doc
 * comment) with an explicit "DEMO 상황" label, so it can never be mistaken
 * for real weather (STEP 22 §3, the DEMO SCENARIO ≠ PRODUCTION boundary).
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
  const days = [...new Set(trip.itinerary.map((i) => i.date))].sort();
  const highlights = topExperienceHighlights(scenario.tripPreference);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-7 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-ink-muted">{scenario.conceptTagline}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{scenario.title}</h1>
        <p className="text-sm tabular-nums text-ink-muted">
          {demoDisplayDate(0)} — {demoDisplayDate(days.length - 1)} · {scenario.cardDuration}
        </p>
      </div>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-sm font-medium text-ink-muted">{scenario.travelers.length}명의 여행</h2>
        <ul className="flex flex-col gap-2">
          {scenario.travelers.map((t) => (
            <TravelerCard key={t.name} traveler={t} />
          ))}
        </ul>
      </section>

      {highlights.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-ink-muted">이번 여행에서 중요한 것</h2>
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
          const outlook = scenario.dailyWeather[i];
          return (
            <div key={date} className="flex flex-col gap-2 rounded-xl border border-line px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-medium text-ink">
                  {demoDisplayDate(i)} <span className="text-ink-muted">· DAY {i + 1}</span>
                </p>
                {outlook && (
                  <div className="flex items-center gap-3 text-xs text-ink-muted">
                    <span>오전 {outlook.am}</span>
                    <span>오후 {outlook.pm}</span>
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
        <p className="text-xs text-ink-muted">
          ※ 위 날씨는 Demo 상황을 위한 예시예요. 실제 여행에서는 그날의 진짜 날씨에 맞춰 같은 과정이 일어나요.
        </p>
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

/**
 * (STEP 22 §9/§10/§33) Collapsed: name, role, top-3 preference labels.
 * Expanded (tap anywhere on the card): every named axis as a bar, in the
 * traveler's own words — never the internal 8-key scoring labels — plus
 * their one-line travel-style sentence. `aria-expanded`/`aria-controls`
 * make the disclosure relationship explicit for assistive tech; a plain
 * inline expand (not a dialog/sheet) reads most naturally at 390px for a
 * list the traveler is already scrolling through.
 */
function TravelerCard({ traveler }: { traveler: DemoTraveler }) {
  const [open, setOpen] = useState(false);
  const panelId = `traveler-${traveler.name}`;
  const topLabels = traveler.displayPreferences.slice(0, 3).map((p) => p.label);

  return (
    <li className="rounded-xl border border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full min-h-11 items-start gap-3 px-3.5 py-3 text-left"
      >
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink-muted">
          <User className="size-4" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
            {traveler.name}
            {traveler.role === "HOST" && (
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-normal text-brand">방장</span>
            )}
          </span>
          <span className="truncate text-sm text-ink-muted">{topLabels.join(" · ")}</span>
        </span>
        <ChevronDown
          className={`mt-1.5 size-4 shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div id={panelId} className="flex flex-col gap-3 border-t border-line px-3.5 py-3.5">
          <ul className="flex flex-col gap-2">
            {traveler.displayPreferences.map(({ label, value }) => (
              <li key={label} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span>{label}</span>
                  <span className="tabular-nums">{value}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${(value / 10) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="text-sm leading-relaxed text-ink">&ldquo;{traveler.blurb}&rdquo;</p>
        </div>
      )}
    </li>
  );
}
