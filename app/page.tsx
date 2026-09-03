import Link from "next/link";

import { appConfig } from "@/config/app";

/**
 * Minimal landing page (PHASE 1). Just enough to get into trip creation —
 * the real marketing page comes in a later phase.
 */
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white p-8 text-center dark:bg-zinc-950">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {appConfig.name}
      </h1>
      <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
        {appConfig.slogan}
      </p>
      <Link
        href="/trip/create"
        className="mt-2 min-h-12 rounded-lg bg-zinc-900 px-6 py-3 text-base font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
      >
        새 여행 만들기
      </Link>
    </main>
  );
}
