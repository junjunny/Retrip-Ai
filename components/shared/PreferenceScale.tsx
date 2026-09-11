"use client";

import { PREFERENCE_MAX, PREFERENCE_MIN } from "@/features/participant/participant";

/**
 * A 1..10 picker for one preference axis — shared by the participant JoinForm
 * (STEP 5) and the trip-creation "이번 여행은 어떤 여행인가요?" step (STEP 12).
 * Same 8-axis / 1..10 scale in both places, just a different vector underneath
 * (a participant's usual taste vs. this trip's own).
 */
export function PreferenceScale({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const steps = Array.from(
    { length: PREFERENCE_MAX - PREFERENCE_MIN + 1 },
    (_, i) => PREFERENCE_MIN + i,
  );
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {steps.map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${label} ${n}점`}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={`min-h-11 rounded-lg border text-sm ${
            value === n
              ? "border-zinc-900 bg-zinc-900 font-medium text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-300 text-zinc-500 dark:border-zinc-700"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
