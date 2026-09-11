"use client";

import { useEffect, useState } from "react";

/** Mirrors features/miniGuide/miniGuideSchema.ts's `MiniGuide`. */
interface MiniGuideData {
  headline: string;
  tips: string[];
}

/**
 * "이번 여행 미니 가이드" — read-only, fetched once when the trip detail page
 * loads. Renders nothing when the trip has no tripPreference set (nothing to
 * guide) or the fetch fails — never a broken-looking empty box. No numbers,
 * no dashboard, no place recommendations.
 */
export function MiniGuide({ tripId }: { tripId: string }) {
  const [guide, setGuide] = useState<MiniGuideData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/trip/${tripId}/mini-guide`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.guide) setGuide(data.guide as MiniGuideData);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (!guide) return null;

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
      <h2 className="text-sm font-medium text-zinc-500">🌿 이번 여행 미니 가이드</h2>
      <p className="font-medium">{guide.headline}</p>
      {guide.tips.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
          {guide.tips.map((tip, i) => (
            <li key={i}>· {tip}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
