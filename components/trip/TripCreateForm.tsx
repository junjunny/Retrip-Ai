"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createTrip, TripValidationError } from "@/features/trip";
import type { ItineraryDraft } from "@/features/trip";

interface Row extends ItineraryDraft {
  key: string;
}

let rowSeq = 0;
const newRow = (time = "", placeName = ""): Row => ({
  key: `row-${rowSeq++}`,
  time,
  placeName,
});

const fieldClass =
  "w-full min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-200";

export function TripCreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rows, setRows] = useState<Row[]>([newRow("14:00")]);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const updateRow = (key: string, patch: Partial<ItineraryDraft>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, newRow()]);
  const removeRow = (key: string) =>
    setRows((rs) => (rs.length <= 1 ? rs : rs.filter((r) => r.key !== key)));

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setErrors([]);
    try {
      const tripId = await createTrip({
        title,
        destination,
        startDate,
        endDate,
        itinerary: rows.map(({ time, placeName }) => ({ time, placeName })),
      });
      // keep `submitting` true through navigation to block a double submit
      router.push(`/trip/${tripId}`);
    } catch (err) {
      setErrors(
        err instanceof TripValidationError
          ? err.errors
          : [
              err instanceof Error
                ? err.message
                : "여행을 만들지 못했습니다. 잠시 후 다시 시도해주세요.",
            ],
      );
      setSubmitting(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">여행 제목</span>
        <input
          className={fieldClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="부산 바다 여행"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">여행 지역</span>
        <input
          className={fieldClass}
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="부산"
        />
      </label>

      <div className="flex flex-col gap-4 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">시작일</span>
          <input
            type="date"
            className={fieldClass}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">종료일</span>
          <input
            type="date"
            className={fieldClass}
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">여행 일정</legend>
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <input
              type="time"
              aria-label="시간"
              className={`${fieldClass} w-28 shrink-0`}
              value={row.time}
              onChange={(e) => updateRow(row.key, { time: e.target.value })}
            />
            <input
              aria-label="장소명"
              className={`${fieldClass} min-w-0 flex-1`}
              value={row.placeName}
              onChange={(e) => updateRow(row.key, { placeName: e.target.value })}
              placeholder="해운대"
            />
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              disabled={rows.length <= 1}
              aria-label="일정 삭제"
              className="min-h-11 shrink-0 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
            >
              삭제
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="min-h-11 self-start rounded-lg border border-dashed border-zinc-400 px-4 text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
        >
          + 일정 추가
        </button>
      </fieldset>

      {errors.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {errors.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="min-h-12 rounded-lg bg-zinc-900 px-4 text-base font-medium text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {submitting ? "여행을 만들고 있습니다..." : "여행 만들기"}
      </button>
    </form>
  );
}
