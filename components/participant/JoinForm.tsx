"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  INDOOR_OUTDOOR,
  INDOOR_OUTDOOR_LABELS,
  PACES,
  PACE_LABELS,
  PREFERENCE_KEYS,
  PREFERENCE_LABELS,
  PREFERENCE_MAX,
  PREFERENCE_MIN,
  defaultPreferenceVector,
  validateJoinInput,
} from "@/features/participant/participant";
import {
  clearSession,
  loadSession,
  saveSession,
  type ParticipantSession,
} from "@/lib/participantSession";
import type {
  IndoorOutdoor,
  PreferenceKey,
  PreferenceVector,
  TravelPace,
  Trip,
} from "@/types";

const fmtDate = (d: string) => d.split("-").join(".");

type Phase = "loading" | "form" | "done";

export function JoinForm({ tripId, trip }: { tripId: string; trip: Trip }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<ParticipantSession | null>(null);
  const [alreadyJoined, setAlreadyJoined] = useState(false);

  const [nickname, setNickname] = useState("");
  const [prefs, setPrefs] = useState<PreferenceVector>(defaultPreferenceVector());
  const [pace, setPace] = useState<TravelPace>("normal");
  const [indoorOutdoor, setIndoorOutdoor] = useState<IndoorOutdoor>("balanced");

  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Resume a prior submission from this browser, if any.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(loadSession(tripId))
      .then(async (s) => {
        if (cancelled) return;
        if (!s) {
          setPhase("form");
          return;
        }
        const res = await fetch(
          `/api/trip/${tripId}/me?participantId=${encodeURIComponent(
            s.participantId,
          )}&secret=${encodeURIComponent(s.secret)}`,
        );
        if (cancelled) return;
        if (res.status === 401 || res.status === 404) {
          clearSession(tripId);
          setPhase("form");
          return;
        }
        if (!res.ok) {
          setSession(s);
          setNotice(
            "이전 참여 정보를 불러오지 못했습니다. 그대로 저장하면 기존 응답이 갱신됩니다.",
          );
          setPhase("form");
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setSession(s);
        setAlreadyJoined(true);
        setNickname(data.participant?.nickname ?? "");
        if (data.preferences) {
          setPrefs({
            ...defaultPreferenceVector(),
            ...data.preferences.preferences,
          });
          setPace(data.preferences.pace ?? "normal");
          setIndoorOutdoor(data.preferences.indoorOutdoor ?? "balanced");
        }
        setPhase("form");
      })
      .catch(() => {
        if (!cancelled) setPhase("form");
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  async function submit() {
    if (submitting) return;
    const clientErrors = validateJoinInput({
      nickname,
      preferences: prefs,
      pace,
      indoorOutdoor,
    });
    if (clientErrors.length > 0) {
      setErrors(clientErrors);
      return;
    }
    setSubmitting(true);
    setErrors([]);
    setNotice(null);
    try {
      const res = await fetch(`/api/trip/${tripId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          participantId: session?.participantId,
          secret: session?.secret,
          nickname,
          preferences: prefs,
          pace,
          indoorOutdoor,
        }),
      });

      if (res.status === 401) {
        clearSession(tripId);
        setSession(null);
        setErrors(["이전 참여 정보가 만료되었습니다. 다시 '참여하기'를 눌러주세요."]);
        setSubmitting(false);
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(
          Array.isArray(data.details) && data.details.length > 0
            ? data.details
            : [data.error ?? "저장에 실패했습니다. 잠시 후 다시 시도해주세요."],
        );
        setSubmitting(false);
        return;
      }

      const next = { participantId: data.participantId, secret: data.secret };
      saveSession(tripId, next);
      setSession(next);
      setPhase("done");
    } catch {
      setErrors(["네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요."]);
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "loading") {
    return <p className="text-sm text-zinc-500">참여 정보를 확인하는 중...</p>;
  }

  if (phase === "done") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-lg font-semibold">참여가 완료되었습니다.</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {nickname}님의 여행 선호도가 저장되었어요.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setAlreadyJoined(true);
              setPhase("form");
            }}
            className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm dark:border-zinc-700"
          >
            응답 수정하기
          </button>
          <Link
            href={`/trip/${tripId}`}
            className="min-h-11 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            여행 정보 보기
          </Link>
        </div>
      </div>
    );
  }

  const itinerary = trip.itinerary ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-1 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
        <p className="text-xs font-medium text-zinc-500">여행</p>
        <p className="font-semibold">{trip.title}</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {trip.destination} · {fmtDate(trip.startDate)} ~ {fmtDate(trip.endDate)}
        </p>
        {itinerary.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
            {itinerary.map((it) => (
              <li key={it.order} className="flex gap-2">
                <span className="tabular-nums text-zinc-500">{it.time}</span>
                <span>{it.placeName}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {alreadyJoined && (
        <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          이미 참여하셨습니다. 아래에서 응답을 수정할 수 있어요.
        </p>
      )}
      {notice && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          {notice}
        </p>
      )}

      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">닉네임</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="준희"
            className="w-full min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-200"
          />
        </label>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">여행에서 무엇을 좋아하나요?</legend>
          {PREFERENCE_KEYS.map((key) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="w-16 shrink-0 text-sm">{PREFERENCE_LABELS[key]}</span>
              <Scale
                value={prefs[key]}
                onChange={(v) => setPrefs((p) => ({ ...p, [key as PreferenceKey]: v }))}
                label={PREFERENCE_LABELS[key]}
              />
            </div>
          ))}
        </fieldset>

        <Choice
          legend="여행 속도"
          options={PACES.map((p) => ({ value: p, label: PACE_LABELS[p] }))}
          value={pace}
          onChange={setPace}
        />
        <Choice
          legend="실내 / 야외"
          options={INDOOR_OUTDOOR.map((v) => ({
            value: v,
            label: INDOOR_OUTDOOR_LABELS[v],
          }))}
          value={indoorOutdoor}
          onChange={setIndoorOutdoor}
        />

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
          {submitting
            ? "저장하는 중..."
            : alreadyJoined
              ? "응답 수정하기"
              : "여행 참여하기"}
        </button>
      </form>
    </div>
  );
}

function Scale({
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
    <div className="flex gap-1.5">
      {steps.map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${label} ${n}점`}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={`h-9 w-9 rounded-full border text-sm ${
            value === n
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-300 text-zinc-500 dark:border-zinc-700"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function Choice<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={`min-h-11 rounded-lg border px-4 text-sm ${
              value === opt.value
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
