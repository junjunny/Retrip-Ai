"use client";

import {
  ArrowRight,
  Bus,
  Car,
  Footprints,
  ImageOff,
  Lightbulb,
  MapPin,
  Navigation,
  Search,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";

import type { ItineraryItem, MobilityMode, MobilityOption, RoutePolylinePoint } from "@/types";

/**
 * Thin client-side mirror of `PublicReplanPreview`/`PublicReplanSlot`
 * (features/replan/replan.ts's `toPublicReplanPreview`) — the server never
 * sends the STEP 9 score breakdown or the other candidates it considered, so
 * there is nothing to mirror for those; this type IS the full wire shape. No
 * numeric score is used here on purpose — this STEP still ships no score
 * badge, no ranking dashboard (AGENTS-spec §26) — only the STEP 11
 * natural-language explanation, a place detail card, and (STEP 13) real
 * mobility info, all built entirely from real data.
 */
interface ReplanSlotProposal {
  itineraryOrder: number;
  action: "KEEP" | "REPLACE";
  current: { placeName: string; time: string };
  proposed: { placeName: string; address: string | null; imageUrl: string | null } | null;
  mobility: MobilityOption[];
}
interface ReplanPreview {
  baseItineraryFingerprint: string;
  baseLocationFingerprint: string;
  generatedAt: string;
  slots: ReplanSlotProposal[];
}
/** Mirrors features/replan/explanation/explanationSchema.ts's `ReplanExplanation`. */
interface ReplanExplanation {
  title: string;
  summary: string;
  reasons: string[];
  cautions: string[];
  slotReasons: { itineraryOrder: number; reason: string }[];
  placeDescriptions: { itineraryOrder: number; description: string }[];
}
/**
 * "지금 진행 중인 행사" — decided entirely server-side by comparing real dates
 * (features/replan/explanation/explanationFacts.ts's `isEventOngoing`); this
 * component only ever renders what the server already decided, never judges
 * "ongoing" itself. Dates are TourAPI's raw "YYYYMMDD" strings.
 */
interface ReplanEvent {
  itineraryOrder: number;
  startDate: string;
  endDate: string;
}

type Phase = "idle" | "loading" | "preview" | "applying" | "applied" | "error";
type LatLng = { latitude: number; longitude: number };

const MODE_ICON: Record<MobilityMode, typeof Footprints> = { WALK: Footprints, DRIVING: Car, TRANSIT: Bus };
const MODE_LABEL: Record<MobilityMode, string> = { WALK: "도보", DRIVING: "자동차", TRANSIT: "대중교통" };

const fmtEventDate = (yyyymmdd: string) => `${Number(yyyymmdd.slice(4, 6))}/${Number(yyyymmdd.slice(6, 8))}`;
const fmtDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`);

/** the last COMPLETED, coordinate-bearing item — the "출발지" default option (STEP 13 §6, priority 1). */
function lastCompletedLocation(itinerary: ItineraryItem[]): (LatLng & { placeName: string }) | null {
  const done = itinerary.filter((i) => i.status === "completed" && i.latitude != null && i.longitude != null);
  const last = done[done.length - 1];
  return last ? { latitude: last.latitude!, longitude: last.longitude!, placeName: last.placeName } : null;
}

/**
 * [Re:Plan] is a single, always-identical CTA — its label/style never
 * changes based on Travel State (this component doesn't even read Travel
 * State). Nothing here runs unless the user presses the button: no timer, no
 * auto-refresh, no Travel-State-triggered call. Preview only ever computes;
 * only [이 계획 적용] writes anything.
 */
export function ReplanPanel({
  tripId,
  itinerary,
  onApplied,
  onPolylinePreview,
}: {
  tripId: string;
  /** for the "마지막 완료 장소에서 출발" origin shortcut (STEP 13 §6) — never used for anything else here. */
  itinerary: ItineraryItem[];
  onApplied: (itinerary: ItineraryItem[]) => void;
  /** lets the trip-level map show the winning candidate's real route geometry (STEP 13 §11) — `null` clears it. */
  onPolylinePreview?: (polyline: RoutePolylinePoint[] | null) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<ReplanPreview | null>(null);
  const [explanation, setExplanation] = useState<ReplanExplanation | null>(null);
  const [events, setEvents] = useState<ReplanEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  // --- origin (currentLocation), STEP 13 §6/§7 ---
  const [origin, setOrigin] = useState<(LatLng & { label: string }) | null>(null);
  const [previewOrigin, setPreviewOrigin] = useState<LatLng | null>(null); // snapshot Apply must reuse
  const [originSearchOpen, setOriginSearchOpen] = useState(false);
  const lastCompleted = lastCompletedLocation(itinerary);

  // per-slot selected mobility mode (map polyline follows this), STEP 13 §12
  const [selectedMode, setSelectedMode] = useState<Record<number, MobilityMode>>({});

  async function startReplan() {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch(`/api/trip/${tripId}/replan/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentLocation: origin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "failed");
      const p = data.preview as ReplanPreview;
      setPreview(p);
      setPreviewOrigin(origin);
      setExplanation((data.explanation as ReplanExplanation | undefined) ?? null);
      setEvents((data.events as ReplanEvent[] | undefined) ?? []);
      setPhase("preview");

      // show the first REPLACE slot's real driving route on the map, if any.
      const firstReplace = p.slots.find((s) => s.action === "REPLACE");
      const driving = firstReplace?.mobility.find((m) => m.mode === "DRIVING" && m.available);
      onPolylinePreview?.(driving?.polyline ?? null);
      if (firstReplace) setSelectedMode((m) => ({ ...m, [firstReplace.itineraryOrder]: "DRIVING" }));
    } catch {
      setError("계획을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.");
      setPhase("error");
    }
  }

  function keepExisting() {
    // NO WRITE — dismissing the preview never touches the itinerary.
    setPreview(null);
    setExplanation(null);
    setEvents([]);
    setPhase("idle");
    onPolylinePreview?.(null);
  }

  async function applyPlan() {
    if (!preview) return;
    setPhase("applying");
    setError(null);
    try {
      const res = await fetch(`/api/trip/${tripId}/replan/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseItineraryFingerprint: preview.baseItineraryFingerprint,
          baseLocationFingerprint: preview.baseLocationFingerprint,
          generatedAt: preview.generatedAt,
          currentLocation: previewOrigin,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.stale
            ? "일정이 변경되어 이 계획을 적용할 수 없어요. 다시 계획을 생성해주세요."
            : (data.error ?? "적용하지 못했습니다. 잠시 후 다시 시도해주세요."),
        );
        setPhase("error");
        return;
      }
      onApplied(data.itinerary as ItineraryItem[]);
      setPreview(null);
      setExplanation(null);
      setEvents([]);
      setPhase("applied");
      onPolylinePreview?.(null);
    } catch {
      setError("적용하지 못했습니다. 잠시 후 다시 시도해주세요.");
      setPhase("error");
    }
  }

  function pickMode(itineraryOrder: number, mobility: MobilityOption[], mode: MobilityMode) {
    const opt = mobility.find((m) => m.mode === mode);
    if (!opt?.available) return; // unavailable modes are never selectable
    setSelectedMode((m) => ({ ...m, [itineraryOrder]: mode }));
    onPolylinePreview?.(opt.polyline.length > 0 ? opt.polyline : null);
  }

  const changedSlots = preview?.slots.filter((s) => s.action === "REPLACE") ?? [];
  const applying: boolean = phase === "applying";

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-ink-muted">Re:Plan</h2>

      {phase !== "preview" && (
        <>
          <OriginPicker
            tripId={tripId}
            origin={origin}
            lastCompleted={lastCompleted}
            open={originSearchOpen}
            setOpen={setOriginSearchOpen}
            onPick={setOrigin}
            onClear={() => setOrigin(null)}
          />
          {/* This button never changes color, size, or animation based on Travel
              State or any other internal signal (STEP 13/14 constraint) — one
              calm, identical CTA every time. */}
          <button
            type="button"
            onClick={startReplan}
            disabled={phase === "loading"}
            className="min-h-11 self-start rounded-xl border border-line px-4 text-sm text-ink transition-opacity disabled:opacity-60"
          >
            {phase === "loading" ? "확인하는 중..." : "Re:Plan"}
          </button>
        </>
      )}

      {phase === "applied" && (
        <p className="text-sm text-ink-muted">적용되었습니다.</p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {phase === "preview" && preview && (
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
          {preview.slots.length === 0 ? (
            <p className="text-sm text-ink-muted">지금 다시 계획할 수 있는 일정이 없어요.</p>
          ) : (
            <>
              {explanation && (
                <div className="flex flex-col gap-2 border-b border-line pb-3">
                  <p className="font-medium text-ink">{explanation.title}</p>
                  <p className="text-sm text-ink-muted">{explanation.summary}</p>
                  {explanation.reasons.length > 0 && (
                    <ul className="flex flex-col gap-1 text-sm text-ink-muted">
                      {explanation.reasons.map((r, i) => (
                        <li key={i}>· {r}</li>
                      ))}
                    </ul>
                  )}
                  {explanation.cautions.length > 0 && (
                    <ul className="flex flex-col gap-1 text-sm text-warning">
                      {explanation.cautions.map((c, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          {c}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <ul className="flex flex-col gap-3">
                {preview.slots.map((s) => {
                  if (s.action === "KEEP") {
                    return (
                      <li key={s.itineraryOrder} className="text-sm">
                        <span className="tabular-nums text-ink-muted">{s.current.time}</span>{" "}
                        <span className="text-ink">{s.current.placeName} · 기존 유지</span>
                      </li>
                    );
                  }

                  const description = explanation?.placeDescriptions.find((d) => d.itineraryOrder === s.itineraryOrder);
                  const reason = explanation?.slotReasons.find((r) => r.itineraryOrder === s.itineraryOrder);
                  const event = events.find((e) => e.itineraryOrder === s.itineraryOrder);

                  return (
                    <li
                      key={s.itineraryOrder}
                      className="flex flex-col gap-2 overflow-hidden rounded-xl border border-line"
                    >
                      {s.proposed?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- external TourAPI image, no Next/Image domain config for arbitrary hosts
                        <img
                          src={s.proposed.imageUrl}
                          alt={s.proposed.placeName}
                          className="h-40 w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-16 items-center justify-center gap-1.5 bg-surface-alt text-xs text-ink-muted">
                          <ImageOff className="size-3.5" aria-hidden />
                          이미지 없음
                        </div>
                      )}

                      <div className="flex flex-col gap-2.5 p-3">
                        <div className="flex flex-wrap items-center gap-1.5 text-sm">
                          <span className="tabular-nums text-ink-muted">{s.current.time}</span>
                          <span className="text-ink-muted">{s.current.placeName}</span>
                          <ArrowRight className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
                          <span className="font-medium text-ink">{s.proposed?.placeName}</span>
                        </div>
                        {s.proposed?.address && (
                          <p className="flex items-center gap-1 text-xs text-ink-muted">
                            <MapPin className="size-3 shrink-0" aria-hidden />
                            {s.proposed.address}
                          </p>
                        )}
                        {description && (
                          <p className="text-sm leading-relaxed text-ink">{description.description}</p>
                        )}

                        <MobilitySection
                          itineraryOrder={s.itineraryOrder}
                          mobility={s.mobility}
                          selected={selectedMode[s.itineraryOrder] ?? "DRIVING"}
                          onSelect={(mode) => pickMode(s.itineraryOrder, s.mobility, mode)}
                        />

                        {event && (
                          <p className="flex items-center gap-1.5 rounded-lg bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                            <Sparkles className="size-3.5 shrink-0" aria-hidden />
                            지금 진행 중인 행사 · {fmtEventDate(event.startDate)} ~ {fmtEventDate(event.endDate)}
                          </p>
                        )}
                        {reason && (
                          <p className="flex items-start gap-1.5 text-xs text-ink-muted">
                            <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden />
                            {reason.reason}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {changedSlots.length > 0 ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={applyPlan}
                disabled={applying}
                className="min-h-11 flex-1 rounded-xl bg-brand px-4 text-sm font-medium text-brand-ink transition-opacity disabled:opacity-60"
              >
                {applying ? "적용하는 중..." : "이 계획 적용"}
              </button>
              <button
                type="button"
                onClick={keepExisting}
                disabled={applying}
                className="min-h-11 flex-1 rounded-xl border border-line px-4 text-sm text-ink disabled:opacity-60"
              >
                기존 일정 유지
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={keepExisting}
              className="min-h-11 self-start rounded-xl border border-line px-4 text-sm text-ink"
            >
              닫기
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "이동 방법" — always renders all three modes (STEP 13 §5/§10); an
 * unavailable one shows its honest reason instead of a number, and can't be
 * selected (§12). Only ever reflects data the server already fetched for
 * scoring — never triggers a new Kakao Mobility call itself.
 */
function MobilitySection({
  mobility,
  selected,
  onSelect,
}: {
  itineraryOrder: number;
  mobility: MobilityOption[];
  selected: MobilityMode;
  onSelect: (mode: MobilityMode) => void;
}) {
  if (mobility.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-surface-alt p-2.5">
      <p className="text-xs font-medium text-ink-muted">이동 정보</p>
      <div className="flex flex-col gap-1">
        {mobility.map((m) => {
          const Icon = MODE_ICON[m.mode];
          return (
            <button
              key={m.mode}
              type="button"
              disabled={!m.available}
              onClick={() => onSelect(m.mode)}
              className={`flex min-h-11 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                !m.available
                  ? "cursor-not-allowed text-ink-muted/60"
                  : selected === m.mode
                    ? "bg-brand text-brand-ink"
                    : "text-ink hover:bg-surface"
              }`}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="w-14 shrink-0">{MODE_LABEL[m.mode]}</span>
              {m.available ? (
                <span className="tabular-nums">
                  {m.durationMinutes}분 · {fmtDistance(m.distanceMeters!)}
                  {m.trafficLabel ? ` · ${m.trafficLabel}` : ""}
                  {m.transferCount != null ? ` · ${m.transferCount}회 환승` : ""}
                </span>
              ) : (
                <span className="text-xs">{m.failureReason ?? "현재 제공 불가"}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "현재 어디에서 출발하시나요?" (STEP 13 §6, priority 1) — explicit, one-shot, never persisted, never auto-tracked. */
function OriginPicker({
  tripId,
  origin,
  lastCompleted,
  open,
  setOpen,
  onPick,
  onClear,
}: {
  tripId: string;
  origin: (LatLng & { label: string }) | null;
  lastCompleted: (LatLng & { placeName: string }) | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  onPick: (loc: LatLng & { label: string }) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-alt p-3 text-sm">
      <p className="flex items-center gap-1.5 text-xs text-ink-muted">
        <Navigation className="size-3.5" aria-hidden />
        출발지 <span className="text-ink-muted/70">(선택 — 알려주시면 실제 이동 정보를 확인할 수 있어요)</span>
      </p>
      <p className="text-ink">{origin ? origin.label : "선택 안 함"}</p>
      <div className="flex flex-wrap gap-2">
        {lastCompleted && (
          <button
            type="button"
            onClick={() => onPick({ ...lastCompleted, label: `마지막 완료 장소 · ${lastCompleted.placeName}` })}
            className="min-h-11 rounded-lg border border-line bg-surface px-3 text-xs text-ink"
          >
            마지막 완료 장소에서 출발
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="min-h-11 rounded-lg border border-line bg-surface px-3 text-xs text-ink"
        >
          직접 장소 선택
        </button>
        {origin && (
          <button
            type="button"
            onClick={onClear}
            className="min-h-11 rounded-lg border border-line px-3 text-xs text-ink-muted"
          >
            선택 해제
          </button>
        )}
      </div>
      {open && (
        <OriginSearch
          tripId={tripId}
          onPick={(loc, label) => {
            onPick({ ...loc, label });
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

interface ResolvedCandidate {
  key: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
}

function OriginSearch({
  tripId,
  onPick,
}: {
  tripId: string;
  onPick: (loc: LatLng, label: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [results, setResults] = useState<ResolvedCandidate[]>([]);

  async function search() {
    if (!query.trim()) return;
    setState("loading");
    try {
      const res = await fetch(`/api/trip/${tripId}/resolve?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      const place = data.place;
      const opts: ResolvedCandidate[] = [];
      if (place.verificationStatus !== "unresolved" && place.latitude != null) {
        opts.push({ key: "primary", name: place.placeName, address: place.roadAddress ?? place.address, latitude: place.latitude, longitude: place.longitude });
      }
      for (const c of place.candidates ?? []) {
        if (c.latitude != null && c.longitude != null) {
          opts.push({ key: `${opts.length}`, name: c.name, address: c.address, latitude: c.latitude, longitude: c.longitude });
        }
      }
      setResults(opts);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="출발할 장소 이름"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-brand"
        />
        <button type="submit" aria-label="검색" className="flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface px-3 text-ink">
          <Search className="size-3.5" aria-hidden />
        </button>
      </form>
      {state === "loading" && <p className="text-xs text-ink-muted">찾는 중...</p>}
      {state === "error" && <p className="text-xs text-danger">찾지 못했어요. 다시 검색해주세요.</p>}
      {results.length > 0 && (
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {results.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => onPick({ latitude: r.latitude, longitude: r.longitude }, r.name)}
                className="flex w-full flex-col items-start rounded-md border border-line bg-surface px-2 py-1.5 text-left text-xs"
              >
                <span className="font-medium text-ink">{r.name}</span>
                {r.address && <span className="text-ink-muted">{r.address}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
