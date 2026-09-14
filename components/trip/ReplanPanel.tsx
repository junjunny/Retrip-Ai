"use client";

import {
  ArrowRight,
  Bus,
  Car,
  Check,
  CloudRain,
  Footprints,
  Heart,
  ImageOff,
  Lightbulb,
  MapPin,
  Navigation,
  Search,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useState } from "react";

import { PREFERENCE_ICON } from "@/components/trip/preferenceIcons";
import type { PreviewMarker } from "@/components/trip/TripMap";
import { topExperienceHighlights, type ExperienceHighlight } from "@/features/replan";
import { toPlaceSearchResults, type PlaceSearchResult } from "@/features/trip";
import type { SituationMessage } from "@/features/travel-state";
import type {
  ExperienceProfile,
  ItineraryItem,
  MobilityMode,
  MobilityOption,
  RoutePolylinePoint,
} from "@/types";

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
  proposed: {
    placeName: string;
    address: string | null;
    imageUrl: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
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
/** matches SituationKind (features/travel-state/situationMessage.ts) — same icon language page.tsx uses for the passive banner. */
const SITUATION_ICON = { weather: CloudRain, traffic: Car, mixed: CloudRain, crowd: Users } as const;
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
  tripPreference,
  fallbackSituation,
  onApplied,
  onPolylinePreview,
  onPreviewMarker,
  journeyOrigin,
}: {
  tripId: string;
  /** for the "마지막 완료 장소에서 출발" origin shortcut (STEP 13 §6) — never used for anything else here. */
  itinerary: ItineraryItem[];
  /**
   * (STEP 21) The trip's real Trip Preference, exactly as already stored on
   * `Trip` (`types/index.ts`'s `tripPreference: ExperienceProfile | null`) —
   * no new API call, no new preference model. `null` when the traveler never
   * set one; Section C ("무엇을 지키는가") then simply doesn't render rather
   * than inventing a preference (see `features/replan/experienceHighlights`).
   */
  tripPreference?: ExperienceProfile | null;
  /**
   * (STEP 21) The SAME situation page.tsx already shows in its passive
   * banner — for a demo trip this is the scenario's scripted narrative
   * (features/demo/demoScenarios.ts), for an ordinary trip it's the real
   * Travel-State-derived one. Used only when the Preview API's own
   * `situation` (computed from the REAL weatherRisk/trafficBurden this
   * exact preview was scored against) comes back `null` — which happens for
   * a demo trip whenever the real current weather doesn't happen to match
   * the demo's premise. Never overrides a real API result; never invented
   * for an ordinary trip beyond what page.tsx already computed for it.
   */
  fallbackSituation?: SituationMessage | null;
  onApplied: (itinerary: ItineraryItem[]) => void;
  /** lets the trip-level map show the winning candidate's real route geometry (STEP 13 §11) — `null` clears it. */
  onPolylinePreview?: (polyline: RoutePolylinePoint[] | null) => void;
  /** lets the trip-level map show the winning candidate's own pin during Preview (STEP 17 §20) — `null` clears it. */
  onPreviewMarker?: (marker: PreviewMarker | null) => void;
  /**
   * (STEP 17/18) The trip's current itinerary item, already known to be
   * "where the traveler is right now" — pre-fills `origin` with it so
   * neither an ordinary trip nor a demo trip ever shows "출발 — 선택 안 함"
   * without the user having to click "직접 장소 선택" first. `undefined`/
   * `null` before the traveler has a confirmed current item (e.g. a
   * brand-new trip whose first item isn't resolved yet) — origin selection
   * then falls back to exactly as manual as it's always been.
   */
  journeyOrigin?: (LatLng & { placeName: string }) | null;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<ReplanPreview | null>(null);
  const [explanation, setExplanation] = useState<ReplanExplanation | null>(null);
  const [events, setEvents] = useState<ReplanEvent[]>([]);
  // (STEP 21) the SAME real weatherRisk/trafficBurden this preview was
  // already scored against — reused, never a second classification (see
  // app/api/trip/[tripId]/replan/preview/route.ts). Drives Section A only.
  const [situation, setSituation] = useState<SituationMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const highlights: ExperienceHighlight[] = topExperienceHighlights(tripPreference ?? null);

  // --- origin (currentLocation), STEP 13 §6/§7 ---
  const [origin, setOrigin] = useState<(LatLng & { label: string }) | null>(null);
  const [previewOrigin, setPreviewOrigin] = useState<LatLng | null>(null); // snapshot Apply must reuse
  const [originSearchOpen, setOriginSearchOpen] = useState(false);
  const lastCompleted = lastCompletedLocation(itinerary);

  // A manual pick always wins; otherwise (STEP 17/18) fall back to the
  // journey's own current-item location — a derived value, never written
  // into `origin` itself, so it re-derives automatically as the journey
  // moves on without ever overwriting something the user picked by hand.
  const effectiveOrigin =
    origin ?? (journeyOrigin ? { ...journeyOrigin, label: `현재 위치 · ${journeyOrigin.placeName}` } : null);

  // per-slot selected mobility mode (map polyline follows this), STEP 13 §12
  const [selectedMode, setSelectedMode] = useState<Record<number, MobilityMode>>({});

  async function startReplan() {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch(`/api/trip/${tripId}/replan/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentLocation: effectiveOrigin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "failed");
      const p = data.preview as ReplanPreview;
      setPreview(p);
      setPreviewOrigin(effectiveOrigin);
      setExplanation((data.explanation as ReplanExplanation | undefined) ?? null);
      setEvents((data.events as ReplanEvent[] | undefined) ?? []);
      setSituation((data.situation as SituationMessage | undefined) ?? fallbackSituation ?? null);
      setPhase("preview");

      // show the first REPLACE slot's real driving route + candidate pin on the map, if any.
      const firstReplace = p.slots.find((s) => s.action === "REPLACE");
      const driving = firstReplace?.mobility.find((m) => m.mode === "DRIVING" && m.available);
      onPolylinePreview?.(driving?.polyline ?? null);
      onPreviewMarker?.(
        firstReplace?.proposed?.latitude != null && firstReplace.proposed.longitude != null
          ? {
              latitude: firstReplace.proposed.latitude,
              longitude: firstReplace.proposed.longitude,
              label: firstReplace.proposed.placeName,
            }
          : null,
      );
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
    setSituation(null);
    setPhase("idle");
    onPolylinePreview?.(null);
    onPreviewMarker?.(null);
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
            ? "그 사이에 일정이 바뀌어서 이 제안은 이어갈 수 없어요. 다시 한 번 확인해주세요."
            : (data.error ?? "지금은 이어갈 수 없었어요. 잠시 후 다시 시도해주세요."),
        );
        setPhase("error");
        return;
      }
      onApplied(data.itinerary as ItineraryItem[]);
      setPreview(null);
      setExplanation(null);
      setEvents([]);
      setSituation(null);
      setPhase("applied");
      onPolylinePreview?.(null);
      onPreviewMarker?.(null);
    } catch {
      setError("지금은 이어갈 수 없었어요. 잠시 후 다시 시도해주세요.");
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
            origin={effectiveOrigin}
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
        <p className="text-sm text-ink-muted">여행을 이어갈 준비가 됐어요.</p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      {phase === "preview" && preview && (
        <div className="flex flex-col gap-4">
          {preview.slots.length === 0 ? (
            <p className="text-sm text-ink-muted">지금 다시 계획할 수 있는 일정이 없어요.</p>
          ) : (
            <>
              {/* Section A — 여행에 어떤 변화가 생겼는가. Real weatherRisk/
                  trafficBurden only; hidden entirely when there's nothing
                  to say (e.g. a manual Re:Plan with no real signal). */}
              {situation && (
                <div className="flex flex-col gap-1">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                    {(() => {
                      const Icon = SITUATION_ICON[situation.kind] ?? CloudRain;
                      return <Icon className="size-3.5 text-brand" aria-hidden />;
                    })()}
                    {situation.line}
                  </p>
                  {situation.tier === "notable" && situation.impact && (
                    <p className="text-sm text-ink">{situation.impact}</p>
                  )}
                </div>
              )}

              {/* Sections B+D — 영향받는 일정 / 무엇만 바꾸는가: one ordered
                  list of the WHOLE trip's slots so it's obvious only the
                  changed one(s) move and everything else visibly holds still. */}
              <AffectedScheduleOverview slots={preview.slots} />

              {/* Section C — 무엇을 지키는가: real Trip Preference axes only;
                  `highlights` is `[]` (nothing rendered) when there's no real
                  preference data to show — never a fabricated "지켜야 할 경험". */}
              <ExperienceHighlightsRow highlights={highlights} />

              {explanation && (explanation.title || explanation.summary || explanation.cautions.length > 0) && (
                <div className="flex flex-col gap-2 border-t border-line pt-3">
                  {explanation.title && <p className="font-medium text-ink">{explanation.title}</p>}
                  {explanation.summary && <p className="text-sm text-ink-muted">{explanation.summary}</p>}
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

              {/* Section E — 왜 이 장소인가: only the slots that actually change. */}
              <ul className="flex flex-col gap-3">
                {preview.slots
                  .filter((s) => s.action === "REPLACE")
                  .map((s) => {
                    const description = explanation?.placeDescriptions.find(
                      (d) => d.itineraryOrder === s.itineraryOrder,
                    );
                    const reason = explanation?.slotReasons.find((r) => r.itineraryOrder === s.itineraryOrder);
                    const event = events.find((e) => e.itineraryOrder === s.itineraryOrder);
                    const facts = buildReasonFacts({ slot: s, situation, highlights, reason: reason?.reason });

                    return (
                      <li
                        key={s.itineraryOrder}
                        className="flex flex-col gap-3 overflow-hidden rounded-xl border border-line"
                      >
                        <div className="flex items-center gap-1.5 px-3 pt-3 text-xs">
                          <span className="tabular-nums text-ink-muted">{s.current.time}</span>
                          <span className="text-ink-muted">{s.current.placeName}</span>
                          <ArrowRight className="size-3 shrink-0 text-ink-muted" aria-hidden />
                          <span className="font-medium text-ink">{s.proposed?.placeName}</span>
                        </div>

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

                        <div className="flex flex-col gap-2.5 p-3 pt-0">
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

                          {facts.length > 0 && (
                            <ul className="flex flex-col gap-1.5 rounded-lg bg-surface-alt p-2.5">
                              {facts.map((f, i) => {
                                const Icon = f.icon;
                                return (
                                  <li key={i} className="flex items-start gap-1.5 text-xs">
                                    <Icon className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden />
                                    <span className="text-ink">
                                      <span className="font-medium">{f.label}</span>{" "}
                                      <span className="text-ink-muted">— {f.detail}</span>
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      </li>
                    );
                  })}
              </ul>

              <ConsideredFactorsDisclosure situation={situation} highlights={highlights} slots={preview.slots} />
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
                {applying ? "이어가는 중..." : "이 일정으로 이어가기"}
              </button>
              <button
                type="button"
                onClick={keepExisting}
                disabled={applying}
                className="min-h-11 flex-1 rounded-xl border border-line px-4 text-sm text-ink disabled:opacity-60"
              >
                그대로 여행하기
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
 * Sections B+D (STEP 21) — "영향받는 일정" / "무엇만 바꾸는가" as ONE ordered
 * list of the whole trip's slots (not just the changed one's neighbors), so
 * the core message reads without extra copy: only a few rows carry the
 * "변경" mark, everything else stays "그대로". Renders nothing when nothing
 * changed — an empty Preview never claims a change that isn't there.
 */
function AffectedScheduleOverview({ slots }: { slots: ReplanSlotProposal[] }) {
  const changed = slots.filter((s) => s.action === "REPLACE");
  if (changed.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-alt p-3">
      <p className="text-sm font-medium text-ink">
        {changed.length === 1
          ? "이번 변화로 이 일정만 다시 맞춰볼게요."
          : `이번 변화로 이 일정 ${changed.length}개만 다시 맞춰볼게요.`}
      </p>
      <ol className="flex flex-col gap-1.5 text-sm">
        {slots.map((s) => (
          <li key={s.itineraryOrder} className="flex items-center gap-2">
            {s.action === "KEEP" ? (
              <Check className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
            ) : (
              <ArrowRight className="size-3.5 shrink-0 text-brand" aria-hidden />
            )}
            <span className="tabular-nums text-ink-muted">{s.current.time}</span>
            <span className={s.action === "REPLACE" ? "font-medium text-ink" : "text-ink-muted"}>
              {s.action === "REPLACE" ? (s.proposed?.placeName ?? s.current.placeName) : s.current.placeName}
            </span>
            <span className="ms-auto shrink-0 text-xs text-ink-muted">
              {s.action === "REPLACE" ? "변경" : "그대로"}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-ink-muted">나머지 일정은 그대로예요.</p>
    </div>
  );
}

/**
 * Section C (STEP 21) — "원래 여행에서 지키고 싶은 경험": real Trip
 * Preference axes only (`topExperienceHighlights`, features/replan). Renders
 * nothing for `[]` — no highlight row is ever invented for a trip with no
 * real preference data.
 */
function ExperienceHighlightsRow({ highlights }: { highlights: ExperienceHighlight[] }) {
  if (highlights.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-ink-muted">원래 여행에서 지키고 싶은 경험</p>
      <ul className="flex flex-wrap gap-1.5">
        {highlights.map((h) => {
          const Icon = PREFERENCE_ICON[h.key];
          return (
            <li
              key={h.key}
              className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-ink"
            >
              <Icon className="size-3.5 text-brand" aria-hidden />
              {h.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface ReasonFact {
  icon: typeof CloudRain;
  label: string;
  detail: string;
}

/**
 * Section E (STEP 21) — "왜 이 장소인가", as short fact chips instead of a
 * raw score. Every fact is conditioned on real data already present on this
 * slot/preview; a fact whose backing data is missing is simply never added
 * (never a placeholder, never "AI가 골랐어요" filler).
 */
function buildReasonFacts({
  slot,
  situation,
  highlights,
  reason,
}: {
  slot: ReplanSlotProposal;
  situation: SituationMessage | null;
  highlights: ExperienceHighlight[];
  reason?: string;
}): ReasonFact[] {
  const facts: ReasonFact[] = [];
  if (situation && (situation.kind === "weather" || situation.kind === "mixed")) {
    facts.push({ icon: CloudRain, label: "지금 상황에 맞아요", detail: "지금 상황에서도 무리 없이 이어갈 수 있어요." });
  }
  const driving = slot.mobility.find((m) => m.mode === "DRIVING" && m.available);
  if (driving) {
    facts.push({
      icon: Car,
      label: "이동 부담이 적어요",
      detail: `현재 위치에서 실제 이동 경로 기준 약 ${driving.durationMinutes}분이에요.`,
    });
  }
  if (highlights.length > 0) {
    facts.push({
      icon: Heart,
      label: "원래 여행과 잘 이어져요",
      detail: `${highlights.map((h) => h.label).join(", ")} 경험을 최대한 유지해요.`,
    });
  }
  if (reason) {
    facts.push({ icon: Lightbulb, label: "이 장소를 고른 이유", detail: reason });
  }
  return facts;
}

/**
 * §11 — a small, optional, collapsed-by-default disclosure naming only the
 * GENERIC real factor categories actually in play for this preview (never a
 * candidate/score table). Hidden entirely when none apply.
 */
function ConsideredFactorsDisclosure({
  situation,
  highlights,
  slots,
}: {
  situation: SituationMessage | null;
  highlights: ExperienceHighlight[];
  slots: ReplanSlotProposal[];
}) {
  const factors: string[] = [];
  if (highlights.length > 0) factors.push("여행에서 지키고 싶었던 경험");
  if (situation) factors.push("지금 상황");
  if (slots.some((s) => s.mobility.some((m) => m.available))) factors.push("실제 이동 경로");
  if (slots.some((s) => s.action === "REPLACE")) factors.push("남은 일정");
  if (factors.length === 0) return null;
  return (
    <details className="rounded-lg border border-line px-3 text-xs text-ink-muted">
      <summary className="flex min-h-11 cursor-pointer items-center font-medium text-ink">
        이 장소를 고를 때 고려한 것
      </summary>
      <ul className="flex flex-col gap-0.5 pb-2.5">
        {factors.map((f) => (
          <li key={f}>· {f}</li>
        ))}
      </ul>
    </details>
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

function OriginSearch({
  tripId,
  onPick,
}: {
  tripId: string;
  onPick: (loc: LatLng, label: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);

  async function search() {
    if (!query.trim()) return;
    setState("loading");
    try {
      const res = await fetch(`/api/trip/${tripId}/resolve?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setResults(toPlaceSearchResults(data.place));
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
          aria-label="출발할 장소 검색"
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
