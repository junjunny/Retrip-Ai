"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { useEscapeToClose } from "@/components/shared/useEscapeToClose";
import { tripDates } from "@/features/trip";
import type { ItineraryEdit } from "@/features/trip";
import type { ItineraryItem, ScheduleType, Trip } from "@/types";

const fieldBase =
  "min-h-11 rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink outline-none focus:border-brand";

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

  useEscapeToClose(onClose);

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="itinerary-edit-heading"
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-ink/40 sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-2xl bg-surface p-5 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 id="itinerary-edit-heading" className="text-base font-semibold text-ink">일정 수정</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-ink-muted"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {days.length > 1 && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">날짜</span>
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
            <span className="text-sm font-medium text-ink">시간</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={`${fieldBase} w-[8.5rem] px-2`}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">장소명</span>
            <input
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              className={`${fieldBase} w-full`}
            />
            {nameChanged && (
              <span className="text-xs text-warning">
                장소명을 바꾸면 장소를 다시 확인해야 해요.
              </span>
            )}
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">일정 종류</span>
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
                  className={`min-h-11 flex-1 rounded-lg border px-3 text-sm transition-colors ${
                    scheduleType === v
                      ? "border-brand bg-brand/10 font-medium text-brand"
                      : "border-line text-ink-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="min-h-11 rounded-xl bg-brand px-4 text-sm font-medium text-brand-ink disabled:opacity-60"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
