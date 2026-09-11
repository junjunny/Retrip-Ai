"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PreferenceScale } from "@/components/shared/PreferenceScale";
import {
  INDOOR_OUTDOOR,
  INDOOR_OUTDOOR_LABELS,
  PACES,
  PACE_LABELS,
  PREFERENCE_KEYS,
  PREFERENCE_LABELS,
  PREFERENCE_SCALE_HINTS,
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
    return <p className="text-sm text-ink-muted">참여 정보를 확인하는 중...</p>;
  }

  if (phase === "done") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-lg font-semibold text-ink">참여가 완료되었습니다.</p>
        <p className="text-sm text-ink-muted">
          {nickname}님의 여행 선호도가 저장되었어요.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setAlreadyJoined(true);
              setPhase("form");
            }}
            className="min-h-11 rounded-xl border border-line px-4 text-sm text-ink"
          >
            응답 수정하기
          </button>
          <Link
            href={`/trip/${tripId}`}
            className="flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-medium text-brand-ink"
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
      <section className="flex flex-col gap-1 rounded-xl border border-line bg-surface-alt p-4">
        <p className="text-xs font-medium text-ink-muted">여행</p>
        <p className="font-semibold text-ink">{trip.title}</p>
        <p className="text-sm text-ink-muted">
          {trip.destination} · {fmtDate(trip.startDate)} ~ {fmtDate(trip.endDate)}
        </p>
        {itinerary.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-muted">
            {itinerary.map((it) => (
              <li key={it.order} className="flex gap-2">
                <span className="tabular-nums text-ink-muted">{it.time}</span>
                <span>{it.placeName}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {alreadyJoined && (
        <p className="rounded-xl bg-accent/10 p-3 text-sm text-accent">
          이미 참여하셨습니다. 아래에서 응답을 수정할 수 있어요.
        </p>
      )}
      {notice && (
        <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning">
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
          <span className="text-sm font-medium text-ink">닉네임</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="준희"
            className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink outline-none focus:border-brand"
          />
        </label>

        <fieldset className="flex flex-col gap-4">
          <legend className="text-sm font-medium text-ink">어떤 여행을 좋아하시나요?</legend>
          <p className="text-xs text-ink-muted">
            1 {PREFERENCE_SCALE_HINTS[1]} · 5 {PREFERENCE_SCALE_HINTS[5]} · 10{" "}
            {PREFERENCE_SCALE_HINTS[10]}
          </p>
          {PREFERENCE_KEYS.map((key) => (
            <div key={key} className="flex flex-col gap-1.5">
              <span className="text-sm text-ink">{PREFERENCE_LABELS[key]}</span>
              <PreferenceScale
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
          <ul className="flex flex-col gap-1 rounded-xl bg-danger/10 p-3 text-sm text-danger">
            {errors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-12 rounded-xl bg-brand px-4 text-base font-medium text-brand-ink disabled:opacity-60"
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
      <legend className="text-sm font-medium text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={`min-h-11 rounded-xl border px-4 text-sm transition-colors ${
              value === opt.value
                ? "border-brand bg-brand text-brand-ink"
                : "border-line text-ink-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
