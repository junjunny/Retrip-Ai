"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DemoTripSetup } from "@/components/demo/DemoTripSetup";
import { DEMO_SCENARIOS, startDemo, type DemoScenario, type DemoStartProgress } from "@/features/demo";
import { getTrip } from "@/features/trip";
import type { Trip } from "@/types";

/**
 * /demo — STEP 16, rewritten in STEP 19 §2 to lead with WHAT Re:Trip does
 * before asking a first-time visitor to pick a scenario. Not an admin/
 * developer panel: three real trips a visitor can try without planning one
 * themselves. Picking a scenario creates a REAL trip through the ordinary
 * trip pipeline and lands on its ordinary detail page — from there, Re:Plan
 * is the exact same button, Preview, and Apply flow as any other trip.
 * Nothing here decides the Re:Plan outcome; see features/demo/demoScenarios.ts.
 */
export default function DemoPage() {
  const router = useRouter();
  const [starting, setStarting] = useState<DemoScenario | null>(null);
  const [progress, setProgress] = useState<DemoStartProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  // (STEP 22 §3/§4) the trip exists and every place is resolved, but the
  // journey itself hasn't started yet — the "여행 설정 확인" screen shows
  // first, exactly like a real trip a group planned together and hasn't
  // left for yet. Re:Plan/Preview/Apply are untouched by any of this.
  const [ready, setReady] = useState<{ scenario: DemoScenario; trip: Trip } | null>(null);

  async function start(scenario: DemoScenario) {
    setStarting(scenario);
    setError(null);
    try {
      const tripId = await startDemo(scenario, setProgress);
      const trip = await getTrip(tripId);
      if (!trip) throw new Error("trip not found right after creation");
      setReady({ scenario, trip });
      setStarting(null);
      setProgress(null);
    } catch {
      setError("여행을 준비하지 못했습니다. 잠시 후 다시 시도해주세요.");
      setStarting(null);
      setProgress(null);
    }
  }

  if (ready) {
    return (
      <DemoTripSetup
        scenario={ready.scenario}
        trip={ready.trip}
        onStart={() => router.push(`/trip/${ready.trip.tripId}`)}
      />
    );
  }

  if (starting) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-medium text-ink">{starting.title}을 준비하고 있어요</p>
        <p className="text-sm text-ink-muted">
          {progress ? `장소 ${progress.resolved}/${progress.total} 확인 중...` : "잠시만 기다려주세요..."}
        </p>
        <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface-alt">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{
              width: progress ? `${Math.max(8, (progress.resolved / Math.max(progress.total, 1)) * 100)}%` : "8%",
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/" className="text-sm text-ink-muted hover:text-brand hover:underline">
        ← Re:Trip AI
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
        여행이 계획대로 흘러가지 않아도, 여행의 목적은 잃지 않도록
      </h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        Re:Trip은 전체 일정을 다시 짜지 않아요. 달라진 상황에 영향을 받는 부분만, 원래 여행의 흐름에 맞춰 다시 이어줘요.
      </p>

      <ol className="mt-6 flex flex-col gap-5">
        {[
          { n: "1", text: "원래 계획대로 여행합니다." },
          { n: "2", text: "상황이 달라지면, Re:Trip이 여행의 흐름을 조용히 살펴봐요." },
          { n: "3", text: "원한다면 원래 경험은 유지한 채 일부만 이어갈 수 있어요." },
        ].map(({ n, text }) => (
          <li key={n} className="flex items-baseline gap-4">
            <span className="shrink-0 text-2xl font-semibold tabular-nums text-brand/60">{n}</span>
            <span className="text-sm leading-relaxed text-ink">{text}</span>
          </li>
        ))}
      </ol>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <p className="mt-8 text-sm font-medium text-ink">이제 직접 체험해보세요</p>
      <p className="mt-1 text-xs text-ink-muted">
        아래 세 여행은 체험을 위해 미리 구성했어요 — 실제 여행에서는 그날의 진짜 상황에 맞춰 같은 과정이 일어나요.
      </p>

      <div className="mt-4 flex flex-col divide-y divide-line">
        {DEMO_SCENARIOS.map((s) => (
          <div key={s.id} className="flex flex-col gap-3 py-6 first:pt-0">
            <div>
              <h2 className="text-xl leading-snug font-semibold text-ink">{s.cardTitle}</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {s.cardDuration} · {s.conceptTagline}
              </p>
              <p className="mt-1.5 text-sm text-ink">
                {s.travelers.map((t) => t.name).join(" · ")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void start(s)}
              className="flex min-h-12 items-center justify-center gap-1.5 self-start rounded-xl border border-line px-5 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
            >
              {s.cardTitle} 여행 체험하기
              <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
