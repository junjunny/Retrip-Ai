/**
 * features/replan/explanation/explanationSchema — the ONLY shape a Re:Plan
 * explanation may take, plus the validators that gate anything before it
 * reaches the client. Nothing bypasses these: an LLM response that fails
 * either check is treated exactly like an LLM failure (see fallback.ts /
 * explanationService.ts) — never partially trusted, never patched up.
 */
import type { ExplanationFacts } from "./explanationFacts";

export interface SlotReason {
  itineraryOrder: number;
  reason: string;
}

/** Read by mobile users mid-trip — kept short on purpose (§22). */
export interface ReplanExplanation {
  title: string;
  summary: string;
  /** at most MAX_REASONS. */
  reasons: string[];
  /** at most MAX_CAUTIONS; often empty. */
  cautions: string[];
  /** one short line per changed (REPLACE) slot only. */
  slotReasons: SlotReason[];
}

export const MAX_TITLE_LENGTH = 60;
export const MAX_SUMMARY_LENGTH = 200;
export const MAX_REASON_LENGTH = 120;
export const MAX_REASONS = 3;
export const MAX_CAUTIONS = 2;

function isShortString(v: unknown, maxLength: number): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= maxLength;
}
function isShortStringArray(v: unknown, maxItems: number, maxLength: number): v is string[] {
  return Array.isArray(v) && v.length <= maxItems && v.every((x) => typeof x === "string" && x.length <= maxLength);
}

/**
 * Structural validation ONLY (types, lengths, required fields) — not a
 * content/grounding check (see `isGrounded` for that). Anything that fails
 * this is discarded outright, never coerced into shape.
 */
export function isValidReplanExplanation(v: unknown): v is ReplanExplanation {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;

  if (!isShortString(o.title, MAX_TITLE_LENGTH)) return false;
  if (!isShortString(o.summary, MAX_SUMMARY_LENGTH)) return false;
  if (!isShortStringArray(o.reasons, MAX_REASONS, MAX_REASON_LENGTH)) return false;
  if (!isShortStringArray(o.cautions, MAX_CAUTIONS, MAX_REASON_LENGTH)) return false;
  if (!Array.isArray(o.slotReasons)) return false;
  for (const s of o.slotReasons) {
    if (typeof s !== "object" || s === null) return false;
    const sr = s as Record<string, unknown>;
    if (typeof sr.itineraryOrder !== "number") return false;
    if (!isShortString(sr.reason, MAX_REASON_LENGTH)) return false;
  }
  return true;
}

const DURATION_PATTERN = /\d+\s*분/;
const DISTANCE_PATTERN = /\d+(\.\d+)?\s*(km|킬로미터|미터|m\b)/i;
/** Claims specific enough about weather that they need a real weatherRisk signal to back them up. */
const WEATHER_CLAIM_PATTERN = /(비가|강수|맑음|흐림|눈이|폭우|폭염)/;
/**
 * The UI deliberately hides 0..100 component scores (AGENTS-spec §26) — a raw
 * score leaking into prose ("86점", "100으로 높아", "72%") defeats that, even
 * though it isn't technically an invented fact. Rejected the same way an
 * ungrounded fact is: fall back, don't edit the text.
 */
const RAW_SCORE_PATTERN = /\d+\s*(점|퍼센트|%|으로\s*(높|낮))/;

/**
 * A generation whose TEXT states a specific fact class (a travel-time number,
 * a distance number, a concrete weather condition) that `facts` never
 * actually supplied is REJECTED wholesale, not edited — the fallback handles
 * it instead. This is the enforcement behind AGENTS-spec §7/§8: the model may
 * only restate facts it was given, never invent adjacent ones.
 */
export function isGrounded(explanation: ReplanExplanation, facts: ExplanationFacts): boolean {
  const text = [
    explanation.summary,
    ...explanation.reasons,
    ...explanation.cautions,
    ...explanation.slotReasons.map((s) => s.reason),
  ].join(" ");

  const hasDurationFact = facts.slots.some((s) => s.travelDurationMinutes !== undefined);
  if (DURATION_PATTERN.test(text) && !hasDurationFact) return false;

  const hasDistanceFact = facts.slots.some((s) => s.travelDistanceMeters !== undefined);
  if (DISTANCE_PATTERN.test(text) && !hasDistanceFact) return false;

  if (facts.weatherRisk === "unknown" && WEATHER_CLAIM_PATTERN.test(text)) return false;

  if (RAW_SCORE_PATTERN.test(text)) return false;

  // every slotReasons entry must refer to a REPLACE slot this preview actually has
  const replaceOrders = new Set(facts.slots.filter((s) => s.action === "REPLACE").map((s) => s.itineraryOrder));
  if (explanation.slotReasons.some((s) => !replaceOrders.has(s.itineraryOrder))) return false;

  return true;
}
