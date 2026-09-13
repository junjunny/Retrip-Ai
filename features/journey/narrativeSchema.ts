/**
 * features/journey/narrativeSchema — the ONLY shape a place narrative may
 * take, plus the validators that gate it before it ever reaches a client.
 * Mirrors features/replan/explanation/explanationSchema.ts's grounding
 * approach exactly: an ungrounded or malformed generation is discarded
 * wholesale (never edited/patched), and the caller falls back to the
 * existing deterministic journey message — never a broken screen.
 */
import type { NarrativeFacts } from "./narrativeFacts";

export interface PlaceNarrative {
  title: string;
  /** 1-2 Korean sentences, grounded in `NarrativeFacts` only. */
  message: string;
  /** internal grounding aid, never required to reach the UI. */
  factsUsed: string[];
}

export const MAX_TITLE_LENGTH = 40;
export const MAX_MESSAGE_LENGTH = 140;
export const MAX_FACTS_USED = 5;
const MAX_FACT_LENGTH = 120;

function isShortString(v: unknown, maxLength: number): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= maxLength;
}

export function isValidPlaceNarrative(v: unknown): v is PlaceNarrative {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!isShortString(o.title, MAX_TITLE_LENGTH)) return false;
  if (!isShortString(o.message, MAX_MESSAGE_LENGTH)) return false;
  if (!Array.isArray(o.factsUsed)) return false;
  if (o.factsUsed.length > MAX_FACTS_USED) return false;
  if (!o.factsUsed.every((f) => typeof f === "string" && f.length <= MAX_FACT_LENGTH)) return false;
  return true;
}

const DURATION_PATTERN = /\d+\s*분/;
const DISTANCE_PATTERN = /\d+(\.\d+)?\s*(km|킬로미터|미터|m\b)/i;
const WEATHER_CLAIM_PATTERN = /(비가|강수|맑음|흐림|눈이|폭우|폭염|기온)/;
const RAW_SCORE_PATTERN = /\d+\s*(점|퍼센트|%|으로\s*(높|낮))/;
/**
 * Unearned tourism-brochure adjectives (STEP 20 §14) — "인기 있는", "꼭 가봐야
 * 할", "최고의", "완벽한" and their close variants. These aren't factual
 * claims `facts` could ever "back up" (no adapter reports popularity), so
 * they're banned outright rather than checked against a fact.
 */
const PROMO_ADJECTIVE_PATTERN = /(인기\s*있는|인기\s*많은|꼭\s*가봐야|반드시\s*가봐야|최고의|최고예요|완벽한|완벽해요)/;

/**
 * A generation that states a travel-time/distance number or a weather
 * condition never present in `facts` is rejected outright — same policy as
 * `explanationSchema.isGrounded` (STEP 11), applied to this second,
 * independent narrative feature. An unearned promotional adjective is
 * rejected unconditionally (no fact could ever ground it).
 */
export function isGroundedNarrative(narrative: PlaceNarrative, facts: NarrativeFacts): boolean {
  const text = `${narrative.title} ${narrative.message}`;

  if (DURATION_PATTERN.test(text) && facts.travelDurationMinutes === undefined) return false;
  if (DISTANCE_PATTERN.test(text) && facts.travelDistanceMeters === undefined) return false;
  // this feature never has a weather signal to ground a claim with (unlike Re:Plan's explanation) — any weather claim is always ungrounded here.
  if (WEATHER_CLAIM_PATTERN.test(text)) return false;
  if (RAW_SCORE_PATTERN.test(text)) return false;
  if (PROMO_ADJECTIVE_PATTERN.test(text)) return false;

  return true;
}
