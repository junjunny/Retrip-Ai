"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  applyRowPatch,
  createTrip,
  tripDates,
  TripValidationError,
} from "@/features/trip";
import type { ItineraryDraft, ItineraryRow } from "@/features/trip";
import type { ScheduleType } from "@/types";

let rowSeq = 0;
const newRow = (date: string, time = "10:00"): ItineraryRow => ({
  key: `row-${rowSeq++}`,
  date,
  time,
  placeName: "",
  scheduleType: "flexible",
});

const fieldBase =
  "min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-200";
const fieldClass = `${fieldBase} w-full`;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
function dateTab(d: string): string {
  const [, m, day] = d.split("-");
  const wd = WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()] ?? "";
  return `${Number(m)}/${Number(day)} ${wd}`;
}

export function TripCreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rows, setRows] = useState<ItineraryRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const days = useMemo(() => tripDates(startDate, endDate), [startDate, endDate]);
  const activeDate = selectedDate && days.includes(selectedDate) ? selectedDate : days[0] ?? null;
  const dayRows = rows.filter((r) => r.date === activeDate);

  /** keep rows inside the (possibly changed) trip range */
  function reconcileRows(nextDays: string[]) {
    if (nextDays.length === 0) return;
    setRows((rs) =>
      rs.map((r) => (r.date && nextDays.includes(r.date) ? r : { ...r, date: nextDays[0] })),
    );
  }
  function onStart(v: string) {
    setStartDate(v);
    reconcileRows(tripDates(v, endDate));
  }
  function onEnd(v: string) {
    setEndDate(v);
    reconcileRows(tripDates(startDate, v));
  }

  const updateRow = (key: string, patch: Partial<ItineraryDraft>) =>
    setRows((rs) => applyRowPatch(rs, key, patch));
  const addRow = () => {
    if (!activeDate) return;
    setRows((rs) => [...rs, newRow(activeDate)]);
  };
  const removeRow = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

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
        itinerary: rows.map(({ date, time, placeName, scheduleType }) => ({
          date,
          time,
          placeName,
          scheduleType,
        })),
      });
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
          placeholder="부산 2박 3일 여행"
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
          <span className="text-sm font-medium">출발일</span>
          <input
            type="date"
            className={fieldClass}
            value={startDate}
            onChange={(e) => onStart(e.target.value)}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">귀가일</span>
          <input
            type="date"
            className={fieldClass}
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => onEnd(e.target.value)}
          />
        </label>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="text-sm font-medium">여행 일정</legend>

        {days.length === 0 ? (
          <p className="text-sm text-zinc-500">
            출발일과 귀가일을 먼저 선택하면 날짜별로 일정을 추가할 수 있어요.
          </p>
        ) : (
          <>
            {days.length > 1 && (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {days.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDate(d)}
                    className={`min-h-10 shrink-0 rounded-lg border px-3 text-sm ${
                      d === activeDate
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                        : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    Day {i + 1} · {dateTab(d)}
                  </button>
                ))}
              </div>
            )}

            {dayRows.length === 0 && (
              <p className="text-sm text-zinc-500">
                이 날의 일정이 아직 없어요.
              </p>
            )}

            {dayRows.map((row) => (
              <div
                key={row.key}
                className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    aria-label="시간"
                    className={`${fieldBase} w-[8.5rem] shrink-0 px-2`}
                    value={row.time}
                    onChange={(e) => updateRow(row.key, { time: e.target.value })}
                  />
                  <input
                    aria-label="장소명"
                    className={`${fieldBase} min-w-0 flex-1`}
                    value={row.placeName}
                    onChange={(e) => updateRow(row.key, { placeName: e.target.value })}
                    placeholder="해운대해수욕장"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    aria-label="일정 삭제"
                    className="min-h-11 shrink-0 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                  >
                    삭제
                  </button>
                </div>
                <ScheduleTypeToggle
                  value={row.scheduleType ?? "flexible"}
                  onChange={(v) => updateRow(row.key, { scheduleType: v })}
                />
              </div>
            ))}

            <button
              type="button"
              onClick={addRow}
              className="min-h-11 self-start rounded-lg border border-dashed border-zinc-400 px-4 text-sm text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
            >
              + 일정 추가
            </button>
          </>
        )}
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

function ScheduleTypeToggle({
  value,
  onChange,
}: {
  value: ScheduleType;
  onChange: (v: ScheduleType) => void;
}) {
  return (
    <div className="flex gap-2">
      {(
        [
          ["flexible", "유동 일정"],
          ["fixed", "고정 일정"],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`min-h-9 flex-1 rounded-lg border px-3 text-sm ${
            value === v
              ? "border-zinc-900 bg-zinc-100 font-medium dark:border-zinc-100 dark:bg-zinc-800"
              : "border-zinc-300 text-zinc-500 dark:border-zinc-700"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
