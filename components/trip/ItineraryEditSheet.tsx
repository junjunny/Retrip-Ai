"use client";

import { useState } from "react";

import { tripDates } from "@/features/trip";
import type { ItineraryEdit } from "@/features/trip";
import type { ItineraryItem, ScheduleType, Trip } from "@/types";

const fieldBase =
  "min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-200";

/** Edit an existing item's date / time / place name / fixed-flexible. */
export function ItineraryEditSheet({
  trip,
  item,
  onClose,
  onSave,
}: {
  trip: Trip;
  item: ItineraryItem;
  onClose: () => void;
  onSave: (edit: ItineraryEdit) => Promise<void>;
}) {
  const days = tripDates(trip.startDate, trip.endDate);
  const [date, setDate] = useState(item.date);
  const [time, setTime] = useState(item.time);
  const [placeName, setPlaceName] = useState(item.placeName);
  const [scheduleType, setScheduleType] = useState<ScheduleType>(item.scheduleType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameChanged = placeName.trim() !== item.placeName;

  async function save() {
    if (saving) return;
    if (!time.match(/^([01]\d|2[0-3]):[0-5]\d$/)) {
      setError("시간을 올바른 형식으로 입력해주세요.");
      return;
    }
    if (!placeName.trim()) {
      setError("장소명을 입력해주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    const edit: ItineraryEdit = {};
    if (date !== item.date) edit.date = date;
    if (time !== item.time) edit.time = time;
    if (nameChanged) edit.placeName = placeName.trim();
    if (scheduleType !== item.scheduleType) edit.scheduleType = scheduleType;
    if (Object.keys(edit).length === 0) {
      onClose();
      return;
    }
    try {
      await onSave(edit);
      onClose();
    } catch {
      setError("저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl dark:bg-zinc-900">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">일정 수정</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-9 rounded-lg px-2 text-sm text-zinc-500"
          >
            닫기
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {days.length > 1 && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">날짜</span>
              <select
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${fieldBase} w-full`}
              >
                {days.map((d, i) => (
                  <option key={d} value={d}>
                    Day {i + 1} · {d}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">시간</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={`${fieldBase} w-[8.5rem] px-2`}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">장소명</span>
            <input
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              className={`${fieldBase} w-full`}
            />
            {nameChanged && (
              <span className="text-xs text-amber-600">
                장소명을 바꾸면 장소를 다시 확인해야 해요.
              </span>
            )}
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">일정 종류</span>
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
                  aria-pressed={scheduleType === v}
                  onClick={() => setScheduleType(v)}
                  className={`min-h-10 flex-1 rounded-lg border px-3 text-sm ${
                    scheduleType === v
                      ? "border-zinc-900 bg-zinc-100 font-medium dark:border-zinc-100 dark:bg-zinc-800"
                      : "border-zinc-300 text-zinc-500 dark:border-zinc-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="min-h-11 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
