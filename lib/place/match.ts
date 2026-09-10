/**
 * Deterministic place matching — TourAPI candidates + Kakao Local candidates →
 * one `NormalizedPlace`. PURE (no I/O, no server-only). No ML.
 *
 * Rule of the house: never confirm `results[0]`. "해운대해수욕장" must not resolve
 * to "다비치안경 해운대해수욕장입구점". "모른다" (`unresolved`, null coords) is a
 * valid outcome.
 */
import type {
  NormalizedPlace,
  PlaceCandidate,
  PlaceConfidence,
  PlaceLocation,
  PlaceSource,
  PlaceVerificationStatus,
  TourismPlace,
} from "@/types";

// ---------- text ----------

/** NFKC, lowercase, strip whitespace + common punctuation. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()[\]{}<>·.,~\-_/'"!?&・]/g, "");
}

/** 0..1 similarity of two place names after normalization. */
export function nameSimilarity(query: string, name: string): number {
  const a = normalizeName(query);
  const b = normalizeName(name);
  if (!a || !b) return 0;
  if (a === b) return 1;
  // containment: the shorter must be a *large* fraction of the longer to count.
  // "해운대해수욕장"(7) in "다비치안경해운대해수욕장입구점"(15) → 0.47, not a match.
  if (b.includes(a)) return a.length / b.length;
  if (a.includes(b)) return b.length / a.length;
  return diceCoefficient(a, b);
}

function diceCoefficient(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let intersection = 0;
  let total = 0;
  for (const [g, c] of A) {
    total += c;
    const bc = B.get(g);
    if (bc) intersection += Math.min(c, bc);
  }
  for (const c of B.values()) total += c;
  return total === 0 ? 0 : (2 * intersection) / total;
}

// ---------- address ----------

const ADDR_TOKEN = /(특별시|광역시|특별자치시|특별자치도|도|시|군|구|읍|면|동|리|가|로|길)$/;

export function addressTokens(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .normalize("NFKC")
    .split(/[\s,()]+/)
    .filter((t) => t.length >= 2 && ADDR_TOKEN.test(t));
}

/** 0..1 — shared administrative tokens (시/도, 시/군/구, 읍/면/동, 로/길). */
export function addressOverlap(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const ta = new Set(addressTokens(a));
  const tb = addressTokens(b);
  if (ta.size === 0 || tb.length === 0) return 0;
  const shared = tb.filter((t) => ta.has(t)).length;
  return shared / Math.min(ta.size, tb.length);
}

// ---------- geo ----------

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// ---------- matcher ----------

export interface PlaceMatchInput {
  /** the name to resolve. */
  query: string;
  /** optional hint (trip destination / existing itinerary address). */
  address?: string | null;
  /** optional hint coordinates (existing itinerary lat/lng). */
  latitude?: number | null;
  longitude?: number | null;
}

const NAME_STRONG = 0.85;
const NAME_WEAK = 0.55;
const DIST_SAME = 150; // m — two coords this close = same place
const DIST_CONFLICT = 600; // m — "matching" names this far apart = conflict

interface Scored {
  source: PlaceSource;
  name: string;
  address: string | null;
  roadAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  nameSim: number;
  addrOverlap: number;
  distToHint: number | null;
  tour: TourismPlace | null;
  kakao: PlaceLocation | null;
}

const rank = (s: Scored) =>
  0.6 * s.nameSim +
  0.25 * s.addrOverlap +
  0.15 * (s.distToHint == null ? 0 : Math.max(0, 1 - s.distToHint / DIST_CONFLICT));

function scoreAll(
  input: PlaceMatchInput,
  tourPlaces: TourismPlace[],
  kakaoPlaces: PlaceLocation[],
): Scored[] {
  const one = (
    source: PlaceSource,
    name: string,
    address: string | null,
    roadAddress: string | null,
    latitude: number | null,
    longitude: number | null,
    tour: TourismPlace | null,
    kakao: PlaceLocation | null,
  ): Scored => ({
    source,
    name,
    address,
    roadAddress,
    latitude,
    longitude,
    tour,
    kakao,
    nameSim: nameSimilarity(input.query, name),
    addrOverlap: addressOverlap(input.address, address),
    distToHint:
      input.latitude != null && input.longitude != null && latitude != null && longitude != null
        ? haversineMeters(input.latitude, input.longitude, latitude, longitude)
        : null,
  });

  return [
    ...tourPlaces.map((t) =>
      one("tour-korservice", t.name, t.address, null, t.latitude, t.longitude, t, null),
    ),
    ...kakaoPlaces.map((k) =>
      one("kakao", k.name, k.address, k.roadAddress, k.latitude, k.longitude, null, k),
    ),
  ].sort((a, b) => rank(b) - rank(a));
}

export function matchPlace(
  input: PlaceMatchInput,
  tourPlaces: TourismPlace[],
  kakaoPlaces: PlaceLocation[],
): NormalizedPlace {
  const query = input.query.trim();
  const scored = scoreAll(input, tourPlaces, kakaoPlaces);
  if (scored.length === 0) return unresolved(query);

  const best = scored[0];
  const bestTour = scored.find((s) => s.source === "tour-korservice") ?? null;
  const bestKakao = scored.find((s) => s.source === "kakao") ?? null;

  // cross-source: do a strong Tour result and a strong Kakao result agree?
  let crossDist: number | null = null;
  if (
    bestTour?.latitude != null &&
    bestKakao?.latitude != null &&
    bestTour.nameSim >= NAME_WEAK &&
    bestKakao.nameSim >= NAME_WEAK
  ) {
    crossDist = haversineMeters(
      bestTour.latitude,
      bestTour.longitude!,
      bestKakao.latitude,
      bestKakao.longitude!,
    );
  }
  const crossAgree = crossDist != null && crossDist <= DIST_SAME;
  const crossConflict = crossDist != null && crossDist > DIST_CONFLICT;

  let confidence: PlaceConfidence;
  let status: PlaceVerificationStatus;
  if (crossAgree) {
    confidence = "high";
    status = "verified";
  } else if (crossConflict) {
    confidence = "medium";
    status = "candidate"; // two names match but locations disagree — confirm nothing
  } else if (
    best.nameSim >= NAME_STRONG &&
    (best.addrOverlap > 0 || (best.distToHint != null && best.distToHint <= DIST_CONFLICT))
  ) {
    confidence = "high";
    status = "verified";
  } else if (best.nameSim >= NAME_WEAK) {
    confidence = "medium";
    status = "candidate";
  } else {
    confidence = "low";
    status = "unresolved";
  }

  if (status === "unresolved") {
    const u = unresolved(query);
    u.candidates = toCandidates(scored, null);
    return u;
  }

  // representative record + which extra source corroborates it
  const primary = crossAgree ? (bestKakao ?? best) : best;
  const tour = crossAgree ? bestTour : primary.source === "tour-korservice" ? primary : null;
  const kakao = crossAgree ? bestKakao : primary.source === "kakao" ? primary : null;
  // prefer Kakao coords (place-search precision) when available
  const coord = crossAgree && bestKakao ? bestKakao : primary;

  const sources: PlaceSource[] = [];
  if (tour?.tour) sources.push("tour-korservice");
  if (kakao?.kakao) sources.push("kakao");

  return {
    query,
    placeName: status === "verified" ? primary.name : query,
    placeId: kakao?.kakao?.id
      ? `kakao:${kakao.kakao.id}`
      : tour?.tour?.id
        ? `tour:${tour.tour.id}`
        : null,
    address: coord.address,
    roadAddress: coord.roadAddress,
    latitude: coord.latitude,
    longitude: coord.longitude,
    tourApiContentId: tour?.tour?.id ?? null,
    tourApiCategoryCode: tour?.tour?.categoryCode ?? null,
    tourApiImageUrl: tour?.tour?.imageUrl ?? null,
    kakaoPlaceId: kakao?.kakao?.id ?? null,
    kakaoCategory: kakao?.kakao?.category ?? null,
    kakaoPlaceUrl: kakao?.kakao?.url ?? null,
    confidence,
    verificationStatus: status,
    sources,
    candidates: toCandidates(scored, primary),
  };
}

function candidatePlaceId(s: Scored): string | null {
  if (s.kakao?.id) return `kakao:${s.kakao.id}`;
  if (s.tour?.id) return `tour:${s.tour.id}`;
  return null;
}

function toCandidates(scored: Scored[], chosen: Scored | null): PlaceCandidate[] {
  return scored
    .filter((s) => s !== chosen)
    .slice(0, 4)
    .map((s) => ({
      source: s.source,
      name: s.name,
      address: s.address,
      latitude: s.latitude,
      longitude: s.longitude,
      placeId: candidatePlaceId(s),
      nameSimilarity: Math.round(s.nameSim * 100) / 100,
      distanceMeters:
        chosen?.latitude != null && s.latitude != null
          ? haversineMeters(chosen.latitude, chosen.longitude!, s.latitude, s.longitude!)
          : null,
    }));
}

function unresolved(query: string): NormalizedPlace {
  return {
    query,
    placeName: query,
    placeId: null,
    address: null,
    roadAddress: null,
    latitude: null,
    longitude: null,
    tourApiContentId: null,
    tourApiCategoryCode: null,
    tourApiImageUrl: null,
    kakaoPlaceId: null,
    kakaoCategory: null,
    kakaoPlaceUrl: null,
    confidence: "low",
    verificationStatus: "unresolved",
    sources: [],
    candidates: [],
  };
}
