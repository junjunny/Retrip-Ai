import { appConfig } from "@/config/app";

/**
 * PHASE 0 home page. Intentionally undesigned — it only confirms that the app
 * renders and that Tailwind is wired up. Real UX starts in later phases.
 */
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-white p-8 text-center dark:bg-zinc-950">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {appConfig.name}
      </h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Travel State Engine
      </p>
      <p className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
        Development Environment Ready
      </p>
    </main>
  );
}
