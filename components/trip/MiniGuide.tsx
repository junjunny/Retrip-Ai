"use client";

import { Sparkles } from "lucide-react";
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
    <section className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface-alt px-4 py-3">
      <h2 className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <Sparkles className="size-3.5 text-brand" aria-hidden />
        이번 여행 미니 가이드
      </h2>
      <p className="text-sm font-medium text-ink">{guide.headline}</p>
      {guide.tips.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-ink-muted">
          {guide.tips.map((tip, i) => (
            <li key={i}>· {tip}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
