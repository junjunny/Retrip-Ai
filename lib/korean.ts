/**
 * lib/korean — minimal 받침(final-consonant) detection for picking the right
 * Korean particle on a dynamic word (a place name), e.g. "공원으로" vs
 * "학교로". Pure. Non-Hangul input (e.g. ends in a Latin letter/number)
 * defaults to "받침 있음" (안전한 기본값 — most place names here are Korean).
 */
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** jongseong (final consonant) index 8 = ㄹ, which takes "로" like a vowel ending does. */
const RIEUL_JONGSEONG_INDEX = 8;

function hasFinalConsonant(word: string): boolean {
  const ch = word.trim().at(-1);
  if (!ch) return true;
  const code = ch.charCodeAt(0);
  if (code < HANGUL_BASE || code > HANGUL_LAST) return true;
  const jongseongIndex = (code - HANGUL_BASE) % 28;
  return jongseongIndex !== 0 && jongseongIndex !== RIEUL_JONGSEONG_INDEX;
}

/** "로" after a vowel/ㄹ ending, "으로" after any other final consonant — e.g. `${place}${toParticle(place)}` -> "학교로" / "공원으로". */
export function toParticle(word: string): "로" | "으로" {
  return hasFinalConsonant(word) ? "으로" : "로";
}
