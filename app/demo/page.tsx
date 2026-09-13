"use client";

import { ArrowRight, Compass, MapPin, RefreshCw, Route } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DEMO_SCENARIOS, startDemo, type DemoScenario, type DemoStartProgress } from "@/features/demo";

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

  async function start(scenario: DemoScenario) {
    setStarting(scenario);
    setError(null);
    try {
      const tripId = await startDemo(scenario, setProgress);
      router.push(`/trip/${tripId}`);
    } catch {
      setError("여행을 준비하지 못했습니다. 잠시 후 다시 시도해주세요.");
      setStarting(null);
      setProgress(null);
    }
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
        달라진 상황에 맞춰, 깨진 부분만 고쳐요
      </h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        여행 중 계획이 달라졌을 때, Re:Trip이 남은 일정만 다시 맞추는 과정을 체험해보세요.
      </p>

      <ol className="mt-6 flex flex-col gap-3">
        {[
          { icon: Route, label: "STEP 1", text: "계획대로 여행합니다." },
          { icon: Compass, label: "STEP 2", text: "날씨·교통 등 상황이 달라집니다." },
          { icon: RefreshCw, label: "STEP 3", text: "[Re:Plan]을 눌러 남은 여행을 다시 맞춥니다." },
        ].map(({ icon: Icon, label, text }) => (
          <li key={label} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-brand">
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="flex flex-col">
              <span className="text-xs font-medium text-ink-muted">{label}</span>
              <span className="text-sm text-ink">{text}</span>
            </span>
          </li>
        ))}
      </ol>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <p className="mt-8 text-sm font-medium text-ink">이제 직접 체험해보세요</p>
      <p className="mt-1 text-xs text-ink-muted">
        아래 세 가지는 체험을 위해 미리 구성한 상황이에요 — 실제 여행에서는 그날의 진짜 날씨·교통에 맞춰 같은 과정이 일어나요.
      </p>

      <div className="mt-4 flex flex-col divide-y divide-line">
        {DEMO_SCENARIOS.map((s) => (
          <div key={s.id} className="flex flex-col gap-3 py-6 first:pt-0">
            <div>
              <h2 className="text-xl leading-snug font-semibold text-ink">{s.cardHeadline}</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {s.cardDuration} · {s.cardTitle}
              </p>
              <p className="mt-1.5 flex items-start gap-1.5 text-sm text-ink">
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden />
                {s.cardDescription}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void start(s)}
              className="flex min-h-12 items-center justify-center gap-1.5 self-start rounded-xl border border-line px-5 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
            >
              {s.cardTitle} 상황 변화 체험
              <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
