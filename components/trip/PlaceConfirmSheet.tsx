"use client";

import { useEffect, useState } from "react";

import {
  placeChoiceFromCandidate,
  placeChoiceFromNormalized,
  type PlaceChoice,
} from "@/features/trip";
import type { ItineraryItem, NormalizedPlace, PlaceCandidate } from "@/types";

type ResolveState =
  | { s: "loading" }
  | { s: "error" }
  | { s: "ok"; place: NormalizedPlace };

/** one pickable option in the "장소 수정" list */
interface Option {
  key: string;
  name: string;
  address: string | null;
  choice: PlaceChoice;
}

function optionsFromPlace(place: NormalizedPlace): Option[] {
  const opts: Option[] = [];
  if (place.verificationStatus !== "unresolved") {
    opts.push({
      key: "primary",
      name: place.placeName,
      address: place.roadAddress ?? place.address,
      choice: placeChoiceFromNormalized(place),
    });
  }
  place.candidates.forEach((c: PlaceCandidate, i) => {
    opts.push({
      key: `c${i}`,
      name: c.name,
      address: c.address,
      choice: placeChoiceFromCandidate(c),
    });
  });
  // de-dupe by name+address
  const seen = new Set<string>();
  return opts.filter((o) => {
    const k = `${o.name}|${o.address ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function PlaceConfirmSheet({
  tripId,
  item,
  onClose,
  onChoose,
}: {
  tripId: string;
  item: ItineraryItem;
  onClose: () => void;
  onChoose: (choice: PlaceChoice) => Promise<void>;
}) {
  const [resolve, setResolve] = useState<ResolveState>({ s: "loading" });
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState(item.placeName);
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function runResolve(q: string) {
    setResolve({ s: "loading" });
    setPicked(null);
    try {
      const res = await fetch(
        `/api/trip/${tripId}/resolve?q=${encodeURIComponent(q)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setResolve({ s: "ok", place: data.place as NormalizedPlace });
    } catch {
      setResolve({ s: "error" });
    }
  }

  useEffect(() => {
    let cancelled = false;
    // defer so the setState in runResolve isn't synchronous within the effect
    Promise.resolve().then(() => {
      if (!cancelled) void runResolve(item.placeName);
    });
    return () => {
      cancelled = true;
    };
    // resolve once per opened item
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.order]);

  async function commit(choice: PlaceChoice) {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onChoose(choice);
      onClose();
    } catch {
      setSaveError("저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
      setSaving(false);
    }
  }

  const place = resolve.s === "ok" ? resolve.place : null;
  const options = place ? optionsFromPlace(place) : [];
  const showConfirm =
    !editing && place?.verificationStatus === "verified" && !!place.latitude;

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl dark:bg-zinc-900">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-zinc-500">
              {item.order}번 · {item.time}
            </p>
            <h3 className="text-base font-semibold">장소 확인</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-9 rounded-lg px-2 text-sm text-zinc-500"
          >
            닫기
          </button>
        </div>

        {resolve.s === "loading" && (
          <p className="py-6 text-center text-sm text-zinc-500">
            장소를 찾는 중...
          </p>
        )}

        {resolve.s === "error" && (
          <div className="flex flex-col gap-3 py-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              장소를 확인하지 못했어요. 직접 검색해주세요.
            </p>
            <SearchBox
              query={query}
              setQuery={setQuery}
              onSearch={() => {
                setEditing(true);
                void runResolve(query);
              }}
            />
          </div>
        )}

        {place && showConfirm && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-zinc-500">장소 정보를 확인했어요.</p>
            <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800">
              <p className="font-medium">{place.placeName}</p>
              {(place.roadAddress ?? place.address) && (
                <p className="mt-0.5 text-sm text-zinc-500">
                  {place.roadAddress ?? place.address}
                </p>
              )}
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">이 장소가 맞나요?</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => commit(placeChoiceFromNormalized(place))}
                className="min-h-11 flex-1 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900"
              >
                {saving ? "저장 중..." : "맞아요"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditing(true)}
                className="min-h-11 flex-1 rounded-lg border border-zinc-300 px-4 text-sm dark:border-zinc-700"
              >
                장소 수정
              </button>
            </div>
          </div>
        )}

        {place && !showConfirm && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {place.verificationStatus === "unresolved"
                ? "장소를 찾지 못했어요. 직접 검색해주세요."
                : "비슷한 장소가 여러 곳 있어요. 맞는 장소를 골라주세요."}
            </p>

            <SearchBox
              query={query}
              setQuery={setQuery}
              onSearch={() => {
                setEditing(true);
                void runResolve(query);
              }}
            />

            {options.length > 0 && (
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {options.map((o) => (
                  <li key={o.key}>
                    <button
                      type="button"
                      onClick={() => setPicked(o.key)}
                      className={`flex w-full flex-col items-start rounded-lg border px-3 py-2 text-left text-sm ${
                        picked === o.key
                          ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800"
                          : "border-zinc-200 dark:border-zinc-700"
                      }`}
                    >
                      <span className="font-medium">{o.name}</span>
                      {o.address && (
                        <span className="text-xs text-zinc-500">{o.address}</span>
                      )}
                      {o.choice.latitude == null && (
                        <span className="text-xs text-amber-600">위치 정보 없음</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              disabled={!picked || saving}
              onClick={() => {
                const o = options.find((x) => x.key === picked);
                if (o) void commit(o.choice);
              }}
              className="min-h-11 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {saving ? "저장 중..." : "이 장소로 선택"}
            </button>
          </div>
        )}

        {saveError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{saveError}</p>
        )}
      </div>
    </div>
  );
}

function SearchBox({
  query,
  setQuery,
  onSearch,
}: {
  query: string;
  setQuery: (v: string) => void;
  onSearch: () => void;
}) {
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (query.trim()) onSearch();
      }}
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="장소 이름으로 검색"
        className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-base outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-200"
      />
      <button
        type="submit"
        className="min-h-11 shrink-0 rounded-lg border border-zinc-300 px-4 text-sm dark:border-zinc-700"
      >
        검색
      </button>
    </form>
  );
}
