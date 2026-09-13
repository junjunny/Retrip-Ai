"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DEMO_SCENARIOS, startDemo, type DemoScenario, type DemoStartProgress } from "@/features/demo";

/**
 * /demo — STEP 16. Not an admin/developer panel: three real trips a visitor
 * can try without planning one themselves. Picking a scenario creates a REAL
 * trip through the ordinary trip pipeline and lands on its ordinary detail
 * page — from there, Re:Plan is the exact same button, Preview, and Apply
 * flow as any other trip. Nothing here decides the Re:Plan outcome; see
 * features/demo/demoScenarios.ts.
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
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Re:Trip 먼저 체험하기</h1>
      <p className="mt-1 text-sm text-ink-muted">
        여행 중 상황이 달라지는 순간을 골라보세요. 실제 여행처럼 일정과 지도를 확인하고, 직접 Re:Plan을 눌러볼 수 있어요.
      </p>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <div className="mt-6 flex flex-col divide-y divide-line">
        {DEMO_SCENARIOS.map((s) => (
          <div key={s.id} className="flex flex-col gap-3 py-6 first:pt-0">
            <div>
              <p className="text-xs text-ink-muted">{s.cardDuration}</p>
              <h2 className="text-xl font-semibold text-ink">{s.cardTitle}</h2>
            </div>
            <p className="text-sm leading-relaxed text-ink-muted">{s.situationLine}</p>
            <button
              type="button"
              onClick={() => void start(s)}
              className="flex min-h-12 items-center justify-center gap-1.5 self-start rounded-xl border border-line px-5 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
            >
              체험하기
              <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
