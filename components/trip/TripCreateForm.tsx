"use client";

import { AlertCircle, Check, MapPin, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { PreferenceScale } from "@/components/shared/PreferenceScale";
import {
  applyRowPatch,
  confirmDesiredPlaces,
  createTrip,
  distributeDesiredPlaces,
  toPlaceSearchResults,
  tripDates,
  TripValidationError,
  type PlaceSearchResult,
} from "@/features/trip";
import type { ItineraryDraft, ItineraryRow } from "@/features/trip";
import {
  PREFERENCE_KEYS,
  PREFERENCE_LABELS,
  defaultPreferenceVector,
} from "@/features/participant/participant";
import type { DesiredPlace, ExperienceProfile, PreferenceKey, ScheduleType } from "@/types";

let rowSeq = 0;
const newRow = (date: string, time = "10:00"): ItineraryRow => ({
  key: `row-${rowSeq++}`,
  date,
  time,
  placeName: "",
  scheduleType: "flexible",
});

const fieldBase =
  "min-h-11 rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink outline-none transition-colors focus:border-brand";
const fieldClass = `${fieldBase} w-full`;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
function dateTab(d: string): string {
  const [, m, day] = d.split("-");
  const wd = WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()] ?? "";
  return `${Number(m)}/${Number(day)} ${wd}`;
}

/** A section heading in the same "question" voice throughout the form (STEP 15). */
function StepHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-medium text-ink">{children}</h2>;
}

export function TripCreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rows, setRows] = useState<ItineraryRow[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // STEP 18 — "이번 여행에서 가고 싶은 곳", picked before the itinerary exists.
  const [desiredPlaces, setDesiredPlaces] = useState<DesiredPlace[]>([]);
  const [tripPreference, setTripPreference] = useState<ExperienceProfile>(defaultPreferenceVector());
  // STEP 13: the section always holds a default vector for the UI to render,
  // but that default must NOT be saved as if the user chose it — only a real
  // interaction (moving any slider) counts as "used this step". See
  // features/trip/tripService.ts's createTrip.
  const [tripPreferenceTouched, setTripPreferenceTouched] = useState(false);
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
      const manualRows: ItineraryDraft[] = rows.map(({ date, time, placeName, scheduleType }) => ({
        date,
        time,
        placeName,
        scheduleType,
      }));
      // STEP 18 §6/§7: desiredPlaces=[] returns manualRows completely
      // unchanged — a creator who skips this step gets exactly the STEP
      // 1-15 manual-entry behavior, nothing new in the path.
      const itinerary = distributeDesiredPlaces(desiredPlaces, days, manualRows);

      const tripId = await createTrip({
        title,
        destination,
        startDate,
        endDate,
        itinerary,
        tripPreference: tripPreferenceTouched ? tripPreference : undefined,
        desiredPlaces,
      });
      // Best-effort: the desired places' already-known real coordinates get
      // written onto their generated itinerary rows. A failure here still
      // leaves a completely usable trip (those rows just start
      // "장소를 확인해주세요", same as any manually-typed row).
      await confirmDesiredPlaces(tripId, desiredPlaces).catch(() => {});
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
      className="flex flex-col gap-10"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="flex flex-col gap-4">
        <StepHeading>어디로 떠나시나요?</StepHeading>
        <input
          className={`${fieldClass} text-lg`}
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="부산"
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-muted">여행 이름</span>
          <input
            className={fieldClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="부산 2박 3일 여행"
          />
        </label>
      </div>

      <div className="flex flex-col gap-4">
        <StepHeading>언제 떠나시나요?</StepHeading>
        <div className="flex flex-col gap-4 sm:flex-row">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm text-ink-muted">출발일</span>
            <input
              type="date"
              className={fieldClass}
              value={startDate}
              onChange={(e) => onStart(e.target.value)}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm text-ink-muted">귀가일</span>
            <input
              type="date"
              className={fieldClass}
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => onEnd(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <StepHeading>이번 여행에서 가고 싶은 곳</StepHeading>
        <p className="text-sm text-ink-muted">
          먼저 가고 싶은 장소를 골라주세요. 시간과 동선을 고려해 여행 순서를 구성해드려요.
        </p>
        <DesiredPlacePicker value={desiredPlaces} onChange={setDesiredPlaces} />
      </div>

      <fieldset className="flex min-w-0 flex-col gap-4">
        <legend className="w-full">
          <StepHeading>무엇을 할까요?</StepHeading>
        </legend>

        {days.length === 0 ? (
          <p className="text-sm text-ink-muted">
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
                    className={`min-h-11 shrink-0 rounded-full border px-3.5 text-sm transition-colors ${
                      d === activeDate
                        ? "border-brand bg-brand text-brand-ink"
                        : "border-line text-ink-muted"
                    }`}
                  >
                    Day {i + 1} · {dateTab(d)}
                  </button>
                ))}
              </div>
            )}

            {dayRows.length === 0 && (
              <p className="text-sm text-ink-muted">
                이 날의 일정이 아직 없어요.
              </p>
            )}

            <div className="flex flex-col divide-y divide-line">
              {dayRows.map((row) => (
                <div key={row.key} className="flex flex-col gap-2 py-3 first:pt-0">
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
                      className="flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-line px-3 text-ink-muted transition-colors hover:text-danger"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                  <ScheduleTypeToggle
                    value={row.scheduleType ?? "flexible"}
                    onChange={(v) => updateRow(row.key, { scheduleType: v })}
                  />
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addRow}
              className="flex min-h-11 items-center gap-1.5 self-start rounded-xl border border-dashed border-line px-4 text-sm text-ink-muted transition-colors hover:border-brand hover:text-brand"
            >
              <Plus className="size-4" aria-hidden />
              일정 추가
            </button>
          </>
        )}
      </fieldset>

      <details className="group flex flex-col gap-4">
        <summary className="flex cursor-pointer list-none items-baseline justify-between gap-2 marker:content-none">
          <StepHeading>어떤 여행을 하고 싶나요?</StepHeading>
          <span className="shrink-0 text-xs text-ink-muted">선택사항</span>
        </summary>
        <div className="flex flex-col gap-4">
          <p className="text-xs leading-relaxed text-ink-muted">
            나중에 설정하지 않아도 여행은 그대로 만들어져요. 평소 취향이 아니라{" "}
            <strong className="font-medium text-ink">이번 여행</strong>에서 무엇을 중요하게
            생각하는지만 알려주시면, 여행 시작 전 짧은 안내에 반영돼요.
          </p>
          {PREFERENCE_KEYS.map((key) => (
            <div key={key} className="flex flex-col gap-1.5">
              <span className="text-sm text-ink">{PREFERENCE_LABELS[key]}</span>
              <PreferenceScale
                value={tripPreference[key]}
                onChange={(v) => {
                  setTripPreferenceTouched(true);
                  setTripPreference((p) => ({ ...p, [key as PreferenceKey]: v }));
                }}
                label={PREFERENCE_LABELS[key]}
              />
            </div>
          ))}
        </div>
      </details>

      {errors.length > 0 && (
        <div className="flex gap-2 rounded-xl bg-danger/10 p-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <ul className="flex flex-col gap-1">
            {errors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="min-h-14 rounded-2xl bg-brand text-lg font-medium text-brand-ink transition-opacity disabled:opacity-60"
      >
        {submitting ? "여행을 만들고 있습니다..." : "여행 만들기"}
      </button>
    </form>
  );
}

/**
 * "이번 여행에서 가고 싶은 곳" (STEP 18 §3/§4) — searches the same real
 * TourAPI + Kakao Local pipeline every other place lookup in this app uses
 * (`/api/place/search`, a pre-trip sibling of `/api/trip/{id}/resolve`),
 * never a blind first result. Selecting a result stores its ALREADY-REAL
 * coordinates — nothing here ever invents a location. Order here is only a
 * WISH list (§4); `distributeDesiredPlaces` decides the actual itinerary
 * order deterministically by real geography, not by this list's order.
 */
function DesiredPlacePicker({
  value,
  onChange,
}: {
  value: DesiredPlace[];
  onChange: (next: DesiredPlace[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const selectedNames = useMemo(() => new Set(value.map((p) => p.placeName)), [value]);

  async function search() {
    if (!query.trim()) return;
    setState("loading");
    try {
      const res = await fetch(`/api/place/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setResults(toPlaceSearchResults(data.place));
      setState("idle");
    } catch {
      setState("error");
    }
  }

  function add(r: PlaceSearchResult) {
    if (selectedNames.has(r.name)) return;
    const place: DesiredPlace = {
      placeId: r.placeId,
      placeName: r.name,
      address: r.address,
      latitude: r.latitude,
      longitude: r.longitude,
      source: r.source,
      selectedAt: new Date().toISOString(),
    };
    onChange([...value, place]);
  }

  function remove(placeName: string) {
    onChange(value.filter((p) => p.placeName !== placeName));
  }

  return (
    <div className="flex flex-col gap-3">
      {/* a plain div, never a nested <form> — this whole picker lives inside
          Trip Create's own outer <form>, and HTML forbids nesting forms
          (an inner <form>'s submit button silently submits the OUTER form
          instead once the browser auto-corrects the invalid nesting). */}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          aria-label="가고 싶은 장소 검색"
          placeholder="가고 싶은 장소를 검색해보세요"
          className={`${fieldBase} min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={() => void search()}
          aria-label="검색"
          className="flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface px-3 text-ink"
        >
          <Search className="size-4" aria-hidden />
        </button>
      </div>

      {state === "loading" && <p className="text-xs text-ink-muted">찾는 중...</p>}
      {state === "error" && <p className="text-xs text-danger">찾지 못했어요. 다시 검색해주세요.</p>}

      {results.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {results.map((r) => {
            const added = selectedNames.has(r.name);
            return (
              <li key={r.key} className="flex items-center gap-2 px-3 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-ink">{r.name}</span>
                  {r.address && <span className="truncate text-xs text-ink-muted">{r.address}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => add(r)}
                  disabled={added}
                  aria-label={added ? `${r.name} 추가됨` : `${r.name} 추가`}
                  className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border text-sm transition-colors ${
                    added
                      ? "border-line bg-surface-alt text-success"
                      : "border-line text-ink hover:border-brand hover:text-brand"
                  }`}
                >
                  {added ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {value.length > 0 && (
        <ol className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface-alt">
          {value.map((p, i) => (
            <li key={p.placeName} className="flex items-center gap-2 px-3 py-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-ink">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-ink">{p.placeName}</span>
                {p.address && (
                  <span className="flex items-center gap-1 truncate text-xs text-ink-muted">
                    <MapPin className="size-3 shrink-0" aria-hidden />
                    {p.address}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(p.placeName)}
                aria-label={`${p.placeName} 삭제`}
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-line text-ink-muted"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
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
          className={`min-h-11 flex-1 rounded-lg border px-3 text-sm transition-colors ${
            value === v
              ? "border-brand bg-brand/10 font-medium text-brand"
              : "border-line text-ink-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
