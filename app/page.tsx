import Link from "next/link";

import { appConfig } from "@/config/app";

/**
 * Minimal landing page (PHASE 1). Just enough to get into trip creation —
 * the real marketing page comes in a later phase.
 */
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        {appConfig.name}
      </h1>
      <p className="max-w-xs text-[15px] leading-relaxed text-ink-muted">
        {appConfig.slogan}
      </p>
      <Link
        href="/trip/create"
        className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-brand px-6 text-base font-medium text-brand-ink transition-opacity active:opacity-80"
      >
        새 여행 만들기
      </Link>
    </main>
  );
}
