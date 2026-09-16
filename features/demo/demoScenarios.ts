/**
 * features/demo — STEP 16/17/21/22/23 Demo Mode. A demo trip is a REAL trip
 * (created via the ordinary `features/trip/createTrip`), so the entire rest
 * of the product — itinerary progress, map, mobility, Re:Plan Preview/Apply,
 * Firestore transaction — runs completely unmodified.
 *
 * STEP 23 HARD LOCK: a demo is not "live itinerary generation" — it is one
 * FIXED scenario, replayed identically every time. Every item below carries
 * its own literal calendar date/time (no real-clock anchoring, no
 * nearest-neighbor ordering, no API-driven reconstruction — see
 * demoService.ts's doc comment). Two of a scenario's items carry a
 * `disruption`: a scripted situation the traveler encounters when they reach
 * that item, and its own hard-locked replacement place. `features/demo/
 * demoReplanService.ts` is the ONLY thing that ever turns a disruption into
 * a Re:Plan Preview/Apply result — it reads this fixture directly and never
 * runs real candidate generation/scoring for a demo trip (see that module's
 * doc comment for exactly why, and features/replan/replanService.ts, which
 * this STEP does not touch at all).
 */
import { buildExperienceProfile } from "@/features/experience";
import { PREFERENCE_KEYS, PREFERENCE_MIN, PREFERENCE_NEUTRAL } from "@/features/participant/participant";
import { JOURNEY_GENERIC_CLOSING_MESSAGE, journeyGenericContinueMessage } from "@/features/trip/journeyMessages";
import type { ExperienceProfile, IndoorOutdoor, PreferenceKey, PreferenceVector, ScheduleType, TravelPace } from "@/types";

/** The exact named axis + value a traveler was given (STEP 22/23 §6-9) — shown verbatim in the participant detail view, never collapsed into the internal scoring labels. */
export interface PreferenceDisplayItem {
  label: string;
  value: number;
}

/**
 * One display axis label -> the real `PreferenceKey` it feeds (STEP 22 §9).
 * There are more named concepts across the three cities than the product's
 * 8 real preference axes, so this is an intentional many-to-one mapping —
 * documented here once, reused by `deriveScoringPreferences` for every
 * traveler, never re-decided per person. Grounded in what each real axis
 * already means to Candidate Generation (`PREFERENCE_TO_CONTENT_TYPE`,
 * features/candidate/candidateGeneration.ts): "바다"/"풍경"/"산책"/"골목·산책"/
 * "새로운 장소" are all real-world contentType 12 (관광지) browsing, so they
 * all feed `nature`; "전통체험"/"과학·전시"/"문화·전시"/"과학" are all
 * contentType 14 (문화시설) browsing, so they all feed `culture`.
 */
const DISPLAY_LABEL_TO_KEY: Record<string, PreferenceKey> = {
  "문화·역사": "culture",
  "골목·산책": "nature",
  전통체험: "culture",
  음식: "food",
  "사진·풍경": "photo",
  "카페·휴식": "cafe",
  액티비티: "activity",
  바다: "nature",
  풍경: "nature",
  "여유·휴식": "relax",
  산책: "nature",
  사진: "photo",
  "과학·전시": "culture",
  "새로운 장소": "nature",
  카페: "cafe",
  "문화·전시": "culture",
  과학: "culture",
};

/**
 * Real 1..10 vector for `/submit` (STEP 22 §9) — for every real axis that
 * more than one of a traveler's named labels maps to, this takes the MAX of
 * those ratings: a stated strong interest is never diluted by averaging it
 * with a related-but-weaker one. Any real axis with no mapped label stays
 * at PREFERENCE_NEUTRAL, never invented.
 */
export function deriveScoringPreferences(display: readonly PreferenceDisplayItem[]): PreferenceVector {
  const byKey = new Map<PreferenceKey, number>();
  for (const { label, value } of display) {
    const key = DISPLAY_LABEL_TO_KEY[label];
    if (!key) throw new Error(`demoScenarios: no scoring mapping for display label "${label}"`);
    byKey.set(key, Math.max(byKey.get(key) ?? PREFERENCE_MIN, value));
  }
  return Object.fromEntries(
    PREFERENCE_KEYS.map((k) => [k, byKey.get(k) ?? PREFERENCE_NEUTRAL]),
  ) as PreferenceVector;
}

/**
 * One of a demo trip's 3 real travelers — seeded through the exact SAME
 * `/api/trip/{tripId}/submit` endpoint a human joining via invite link
 * uses (see demoService.ts), so `groupSatisfaction` scoring
 * (features/scoring/scoring.ts) reads their REAL, genuinely different raw
 * preference vectors for a general trip. A demo trip's own Re:Plan never
 * runs that scoring at all (see demoReplanService.ts) — these vectors exist
 * so the pre-trip setup screen can honestly show "what this group cares
 * about" from real stored data, not a fabricated summary.
 */
export interface DemoTraveler {
  name: string;
  role: "HOST" | "MEMBER";
  /** the exact named axes this traveler was given (STEP 22/23 §6-8) — shown verbatim in the participant detail view. */
  displayPreferences: readonly PreferenceDisplayItem[];
  /** derived from `displayPreferences` via `deriveScoringPreferences` — never hand-typed separately, so it can never silently drift from the axes actually shown to the user. */
  preferences: PreferenceVector;
  pace: TravelPace;
  indoorOutdoor: IndoorOutdoor;
  /** one short, natural-language line of what this person cares about — shown on the pre-trip "여행 설정 확인" screen, never a raw 1-10 number there. */
  blurb: string;
}

function traveler(
  name: string,
  role: "HOST" | "MEMBER",
  displayPreferences: readonly PreferenceDisplayItem[],
  pace: TravelPace,
  indoorOutdoor: IndoorOutdoor,
  blurb: string,
): DemoTraveler {
  return { name, role, displayPreferences, preferences: deriveScoringPreferences(displayPreferences), pace, indoorOutdoor, blurb };
}

/**
 * A DEMO-ONLY simulated weather outlook for one day (STEP 22/23 §3) — never
 * fetched from KMA, never presented as a real forecast. This is a
 * SCENARIO-authored condition so a judge can reliably experience the
 * intended situation regardless of what the real weather happens to be when
 * the demo runs. The UI must always carry a "DEMO 상황" style label
 * alongside this data — see components/demo/DemoTripSetup.tsx.
 */
export interface DemoWeatherOutlook {
  am: string;
  pm: string;
}

/**
 * The hard-locked target of one disruption (STEP 23 §13/§14) — canonical
 * source of truth for what Re:Plan shows and writes for this scenario item.
 * `resolveQuery` lets the real search string differ from the display name
 * when that produces a more reliable real match (see 대전's doc note below)
 * — never changes what the user sees, only what's searched.
 */
export interface DemoReplacement {
  placeName: string;
  resolveQuery?: string;
  /**
   * A demo-fixed local image (STEP 24 §1) — served from `public/images/demo/`
   * and referenced by absolute path (e.g. "/images/demo/jeonju/foo.jpg").
   * Always wins over the real TourAPI image when present (see
   * `resolveFixedPlace` in demoReplanService.ts); `undefined` leaves the
   * existing real-image-or-fallback behavior untouched.
   */
  demoImagePath?: string;
  /**
   * A hard-locked driving distance/duration for this one replacement (STEP
   * 24 §2) — used ONLY when the real Kakao Mobility result for this specific
   * candidate is known to be unreliable (see 대청호 명상정원 below); the real
   * route polyline/map is still fetched and shown untouched. Never used to
   * fabricate a route where none exists.
   */
  fixedRoute?: { distanceMeters: number; durationSeconds: number };
}

/** A scripted situation the traveler encounters when they reach this item — see the module doc comment. */
export interface DemoDisruption {
  situationLine: string;
  impactLine: string;
  situationKind: "weather" | "traffic" | "crowd";
  replacement: DemoReplacement;
}

export interface DemoScenarioItem {
  /** literal calendar date, "YYYY-MM-DD" — the real, stored, displayed date; never anchored to "now" (STEP 23 §2/§23). */
  date: string;
  time: string;
  placeName: string;
  scheduleType: ScheduleType;
  /**
   * (STEP 17) One short, traveler-voiced line shown right after this item is
   * marked complete — never a chatbot-length explanation, never an invented
   * fact about the place. See `demoCompletionMessage`.
   */
  completionMessage: string;
  /**
   * A real street address to resolve THIS item by instead of its
   * `placeName` — for a generic/ambiguous name a keyword search can't
   * reliably match (e.g. "전주 숙소") or a chain name that needs pinning to
   * one real branch (e.g. "베테랑"). See the `/resolve?addr=` path.
   */
  resolveAddress?: string;
  /** present on exactly the items the scenario scripts a Re:Plan moment for — see `DemoDisruption`. */
  disruption?: DemoDisruption;
}

export interface DemoScenario {
  id: string;
  destination: string;
  title: string;
  /** short scenario name on the /demo card, e.g. "전주". */
  cardTitle: string;
  /** (STEP 22 §34) one short line naming this city's travel identity, e.g. "골목과 전통을 천천히" — never a long description. */
  conceptTagline: string;
  /** one line of trip-length context under the card title, e.g. "1박 2일". */
  cardDuration: string;
  /** the 3 real travelers on this trip — see `DemoTraveler`. First entry is the host. */
  travelers: readonly [DemoTraveler, DemoTraveler, DemoTraveler];
  /**
   * The group's real Experience Profile — the arithmetic mean of the 3
   * travelers' own vectors above (`buildExperienceProfile`, STEP 6's actual
   * aggregation, never a second formula), rounded to whole integers (see
   * `groupProfile`'s doc comment). Computed once per scenario below, not
   * authored by hand — so it can never disagree with what
   * `groupSatisfaction` scoring independently derives from those same 3
   * vectors via `listPreferenceVectors`.
   */
  tripPreference: ExperienceProfile;
  /** DEMO-ONLY simulated weather, one entry per real calendar day this scenario spans — see `DemoWeatherOutlook`. */
  dailyWeather: readonly DemoWeatherOutlook[];
  days: DemoScenarioItem[][];
}

/** The group's real Experience Profile — see `DemoScenario.tripPreference`'s doc comment. Rounded to whole integers: `createTrip`'s own validation (features/trip/trip.ts, unchanged) requires an integer `tripPreference`, while `buildExperienceProfile`'s group MEAN can be fractional. `groupSatisfaction` scoring (for a general trip) still reads the 3 travelers' own unrounded vectors directly via `listPreferenceVectors`. */
function groupProfile(travelers: readonly DemoTraveler[]): ExperienceProfile {
  const mean = buildExperienceProfile(travelers.map((t) => t.preferences))!;
  return Object.fromEntries(Object.entries(mean).map(([key, value]) => [key, Math.round(value)])) as ExperienceProfile;
}

// Re-exported for backward compatibility with existing demo call sites —
// the actual definitions live in features/trip/journeyMessages.ts (STEP 18
// §32): the generic journey mechanism must not depend on the demo-specific
// module, so the dependency runs demo -> generic, never the reverse. Used
// here only once Re:Plan has changed a place away from what the scenario
// scripted (i.e. the live place no longer matches `completionMessage`) —
// never invents a fact about the real, emergent replacement.
export const DEMO_GENERIC_CLOSING_MESSAGE = JOURNEY_GENERIC_CLOSING_MESSAGE;

/**
 * Real-API verification notes (STEP 16/22/23 — never hardcode the *result*,
 * only tune the *input*):
 *
 * - 서학동 예술마을 (전주 disruption #1): the display name is exactly what
 *   was specified, but its given address ("전북특별자치도 전주시 완산구
 *   공수내로 65 (서서학동)") does not resolve through the real Kakao address
 *   geocoder at all (live-probed, several spelling variants) — this project
 *   never fabricates a coordinate to make a given address "work", so this
 *   item resolves by keyword search on its own name instead, which reaches
 *   the same real, verified place (전북특별자치도 전주시 완산구 서서학동 1-1).
 * - 국립무형유산원 / 한국도로공사 전주수목원 / 부평깡통시장: all resolve
 *   "verified" via the real TourAPI+Kakao cross-check, live-probed.
 * - 씨라이프 부산 아쿠아리움 / 정동문화사: resolve via Kakao only (no TourAPI
 *   contentId) — the grounded LLM explanation degrades gracefully (no
 *   TourAPI overview to summarize), never fabricates one.
 * - "명상정원" (bare) reliably resolves to the real, TourAPI-verified record
 *   at 대전 동구 추동 680 (contentId 3051657); the scenario's own display
 *   name "대청호 명상정원" resolves to a DIFFERENT, lower-confidence Kakao-
 *   only match at a nearby but wrong address — so `resolveQuery: "명상정원"`
 *   is used to reliably hit the correct real place while the display name
 *   stays exactly what the scenario specifies. That same coordinate mismatch
 *   also made its real Kakao Mobility driving distance/time unreliable, so
 *   (STEP 24 §2) this one replacement carries a `fixedRoute` override
 *   (15km / 25min) instead — the real route polyline/map is untouched.
 * - 다리미 삼겹살 / 또또국수 / 롯데시티호텔 대전 (구 "유성호텔"): all pinned by
 *   `resolveAddress` (STEP 24) to the exact real branch the scenario means,
 *   same mechanism 베테랑 already used.
 */
export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    id: "jeonju",
    destination: "전주",
    title: "2박 3일 전주 여행",
    cardTitle: "전주",
    conceptTagline: "골목과 전통을 천천히",
    cardDuration: "2박 3일",
    travelers: [
      traveler(
        "준희",
        "HOST",
        [
          { label: "문화·역사", value: 9 },
          { label: "골목·산책", value: 9 },
          { label: "전통체험", value: 8 },
          { label: "음식", value: 7 },
          { label: "사진·풍경", value: 7 },
          { label: "카페·휴식", value: 5 },
          { label: "액티비티", value: 3 },
        ],
        "slow",
        "balanced",
        "전통문화와 역사적 공간을 깊이 있게 보고 골목과 산책을 통해 도시의 분위기를 느끼는 여행을 선호해요.",
      ),
      traveler(
        "서연",
        "MEMBER",
        [
          { label: "음식", value: 10 },
          { label: "카페·휴식", value: 9 },
          { label: "사진·풍경", value: 8 },
          { label: "골목·산책", value: 7 },
          { label: "문화·역사", value: 6 },
          { label: "전통체험", value: 5 },
          { label: "액티비티", value: 3 },
        ],
        "normal",
        "indoor",
        "맛집과 카페를 중심으로 여유롭게 여행하면서 사진 찍기 좋은 공간을 함께 즐기는 것을 선호해요.",
      ),
      traveler(
        "도윤",
        "MEMBER",
        [
          { label: "사진·풍경", value: 10 },
          { label: "문화·역사", value: 8 },
          { label: "골목·산책", value: 8 },
          { label: "전통체험", value: 7 },
          { label: "카페·휴식", value: 6 },
          { label: "음식", value: 5 },
          { label: "액티비티", value: 4 },
        ],
        "slow",
        "outdoor",
        "사진과 풍경을 가장 중요하게 생각하며 전통문화와 골목길을 함께 경험하는 것을 선호해요.",
      ),
    ],
    get tripPreference() {
      return groupProfile(this.travelers);
    },
    dailyWeather: [
      { am: "맑음", pm: "구름 조금" },
      { am: "맑음", pm: "맑음" },
      { am: "맑음", pm: "맑음" },
    ],
    days: [
      [
        {
          date: "2026-10-01",
          time: "13:00",
          placeName: "현대닭내장",
          scheduleType: "flexible",
          completionMessage: "점심은 괜찮으셨나요? 이제 경기전으로 이동해볼게요.",
        },
        {
          date: "2026-10-01",
          time: "14:00",
          placeName: "경기전",
          scheduleType: "flexible",
          completionMessage: "경기전은 잘 둘러보셨나요? 다음은 전주 한옥마을이에요.",
        },
        {
          date: "2026-10-01",
          time: "15:00",
          placeName: "전주 한옥마을",
          scheduleType: "flexible",
          completionMessage: "한옥마을 구경은 어떠셨나요? 다음 일정은 서학동 예술마을이에요.",
        },
        {
          date: "2026-10-01",
          time: "16:00",
          placeName: "서학동 예술마을",
          scheduleType: "flexible",
          completionMessage: "전시 관람은 어떠셨나요? 이제 저녁을 먹으러 이동해볼게요.",
          disruption: {
            situationLine: "인파 몰림으로 관람이 불편해지고 있어요.",
            impactLine: "지금 인파라면 편하게 둘러보기 어려울 수 있어요.",
            situationKind: "crowd",
            replacement: { placeName: "국립무형유산원", demoImagePath: "/images/demo/jeonju/gungnip-muhyeong-yusanwon.png" },
          },
        },
        {
          date: "2026-10-01",
          time: "18:00",
          placeName: "베테랑",
          scheduleType: "fixed",
          completionMessage: "칼국수는 맛있게 드셨나요? 베테랑은 칼국수가 유명한 곳이에요.",
          resolveAddress: "전북특별자치도 전주시 완산구 교동 84-10",
        },
        {
          date: "2026-10-01",
          time: "20:00",
          placeName: "신라스테이 전주",
          scheduleType: "fixed",
          completionMessage: "오늘 여행은 여기까지예요. 푹 쉬고 내일 일정을 이어가볼게요.",
          resolveAddress: "전북특별자치도 전주시 완산구 현무1길 10",
        },
      ],
      [
        {
          date: "2026-10-02",
          time: "11:00",
          placeName: "메르밀 진미집",
          scheduleType: "flexible",
          completionMessage: "점심은 맛있게 드셨나요? 다음은 덕진공원이에요.",
          resolveAddress: "전북 전주시 덕진구 우아3길 8 1층",
        },
        {
          date: "2026-10-02",
          time: "13:00",
          placeName: "덕진공원",
          scheduleType: "flexible",
          completionMessage: "덕진공원 산책은 어떠셨나요? 다음은 저녁 식사예요.",
          disruption: {
            situationLine: "예상치 못한 행사로 주변 교통이 혼잡해졌어요.",
            impactLine: "지금 속도라면 다음 일정까지 이동 부담이 커질 수 있어요.",
            situationKind: "traffic",
            replacement: { placeName: "한국도로공사 전주수목원" },
          },
        },
        {
          date: "2026-10-02",
          time: "18:00",
          placeName: "다리미 삼겹살",
          scheduleType: "flexible",
          completionMessage: "삼겹살은 맛있게 드셨나요? 둘째 날 여행은 여기까지예요.",
          resolveAddress: "전북특별자치도 완주군 이서면 갈산리 663-4",
        },
        {
          date: "2026-10-02",
          time: "20:00",
          placeName: "전주 호텔원",
          scheduleType: "fixed",
          completionMessage: "둘째 날 여행은 여기까지예요. 마지막 날 일정을 이어가볼게요.",
        },
      ],
      [
        {
          date: "2026-10-03",
          time: "11:00",
          placeName: "또또국수",
          scheduleType: "flexible",
          completionMessage: "아침 식사는 어떠셨나요? 마지막 코스로 이동해볼게요.",
          resolveAddress: "전북특별자치도 완주군 이서면 갈산리 664-9",
        },
        {
          date: "2026-10-03",
          time: "14:00",
          placeName: "전주월드컵경기장",
          scheduleType: "flexible",
          completionMessage: "전북현대 경기는 즐거우셨나요? 계획이 달라져도 여행은 계속되니까요.",
        },
      ],
    ],
  },
  {
    id: "busan",
    destination: "부산",
    title: "1박 2일 부산 여행",
    cardTitle: "부산",
    conceptTagline: "바다와 풍경을 따라",
    cardDuration: "1박 2일",
    travelers: [
      traveler(
        "준호",
        "HOST",
        [
          { label: "바다", value: 10 },
          { label: "풍경", value: 9 },
          { label: "여유·휴식", value: 9 },
          { label: "산책", value: 8 },
          { label: "사진", value: 8 },
          { label: "음식", value: 6 },
          { label: "문화·역사", value: 4 },
        ],
        "slow",
        "outdoor",
        "바다와 풍경을 중심으로 여유롭게 이동하며 부산의 해안 분위기를 충분히 즐기는 여행을 선호해요.",
      ),
      traveler(
        "승찬",
        "MEMBER",
        [
          { label: "사진", value: 10 },
          { label: "풍경", value: 10 },
          { label: "바다", value: 8 },
          { label: "카페·휴식", value: 8 },
          { label: "산책", value: 7 },
          { label: "음식", value: 6 },
          { label: "문화·역사", value: 5 },
        ],
        "normal",
        "outdoor",
        "사진과 풍경을 중요하게 생각하며 바다와 카페를 함께 즐길 수 있는 여행을 선호해요.",
      ),
      traveler(
        "현우",
        "MEMBER",
        [
          { label: "음식", value: 10 },
          { label: "액티비티", value: 9 },
          { label: "바다", value: 7 },
          { label: "산책", value: 6 },
          { label: "풍경", value: 6 },
          { label: "문화·역사", value: 5 },
          { label: "카페·휴식", value: 4 },
        ],
        "fast",
        "balanced",
        "맛집과 활동적인 경험을 좋아하며 부산의 바다와 다양한 체험을 함께 즐기는 것을 선호해요.",
      ),
    ],
    get tripPreference() {
      return groupProfile(this.travelers);
    },
    dailyWeather: [
      { am: "맑음", pm: "소나기" },
      { am: "맑음", pm: "소나기" },
    ],
    days: [
      [
        {
          date: "2026-10-01",
          time: "10:00",
          placeName: "감천문화마을",
          scheduleType: "flexible",
          completionMessage: "감천문화마을은 둘러보시기에 어떠셨나요? 다음은 자갈치 시장이에요.",
        },
        {
          date: "2026-10-01",
          time: "12:30",
          placeName: "자갈치 시장",
          scheduleType: "flexible",
          completionMessage: "자갈치 시장 구경은 어떠셨나요? 다음은 흰여울문화마을이에요.",
          disruption: {
            situationLine: "갑작스러운 소나기가 내리고 있어요.",
            impactLine: "지금 계획대로 진행하면 원래 기대했던 야외 경험과 달라질 수 있어요.",
            situationKind: "weather",
            replacement: { placeName: "부평깡통시장" },
          },
        },
        {
          date: "2026-10-01",
          time: "15:00",
          placeName: "흰여울문화마을",
          scheduleType: "flexible",
          completionMessage: "흰여울문화마을 산책은 어떠셨나요? 저녁 식사로 이동해볼게요.",
        },
        {
          date: "2026-10-01",
          time: "18:00",
          placeName: "마린횟집 해운대본점",
          scheduleType: "flexible",
          completionMessage: "회는 맛있게 드셨나요? 오늘 일정은 여기까지예요.",
        },
        {
          date: "2026-10-01",
          time: "20:00",
          placeName: "한화리조트 해운대",
          scheduleType: "fixed",
          completionMessage: "첫째 날 여행은 여기까지예요. 둘째 날 일정을 이어가볼게요.",
        },
      ],
      [
        {
          date: "2026-10-02",
          time: "11:00",
          placeName: "수변최고돼지국밥",
          scheduleType: "flexible",
          completionMessage: "돼지국밥은 맛있게 드셨나요? 다음은 해운대 해수욕장이에요.",
        },
        {
          date: "2026-10-02",
          time: "13:00",
          placeName: "해운대 해수욕장",
          scheduleType: "flexible",
          completionMessage: "해변에서 잘 쉬셨나요? 즐거운 부산 여행이었나요? 계획이 달라져도 여행은 계속되니까요.",
          disruption: {
            situationLine: "갑작스러운 소나기가 내리고 있어요.",
            impactLine: "지금 계획대로 진행하면 원래 기대했던 야외 경험과 달라질 수 있어요.",
            situationKind: "weather",
            replacement: { placeName: "씨라이프 부산 아쿠아리움", demoImagePath: "/images/demo/busan/sealife-busan-aquarium.png" },
          },
        },
      ],
    ],
  },
  {
    id: "daejeon",
    destination: "대전",
    title: "1박 2일 대전 여행",
    cardTitle: "대전",
    conceptTagline: "과학과 새로운 발견",
    cardDuration: "1박 2일",
    travelers: [
      traveler(
        "현준",
        "HOST",
        [
          { label: "과학·전시", value: 10 },
          { label: "새로운 장소", value: 9 },
          { label: "문화·역사", value: 8 },
          { label: "산책", value: 7 },
          { label: "사진", value: 7 },
          { label: "카페", value: 6 },
          { label: "음식", value: 5 },
        ],
        "normal",
        "indoor",
        "과학·전시와 새로운 장소를 탐방하고 도시의 문화와 역사까지 함께 경험하는 것을 선호해요.",
      ),
      traveler(
        "유나",
        "MEMBER",
        [
          { label: "카페·휴식", value: 10 },
          { label: "사진", value: 9 },
          { label: "새로운 장소", value: 8 },
          { label: "산책", value: 7 },
          { label: "문화·전시", value: 6 },
          { label: "음식", value: 6 },
          { label: "과학", value: 4 },
        ],
        "slow",
        "indoor",
        "카페와 휴식을 중심으로 여유롭게 여행하며 사진과 새로운 장소를 함께 즐기는 것을 선호해요.",
      ),
      traveler(
        "태현",
        "MEMBER",
        [
          { label: "음식", value: 10 },
          { label: "산책", value: 8 },
          { label: "새로운 장소", value: 8 },
          { label: "과학·전시", value: 7 },
          { label: "문화·역사", value: 6 },
          { label: "사진", value: 5 },
          { label: "카페", value: 5 },
        ],
        "normal",
        "balanced",
        "맛있는 음식과 산책을 중요하게 생각하며 새로운 장소와 과학·전시 경험을 함께 즐기는 것을 선호해요.",
      ),
    ],
    get tripPreference() {
      return groupProfile(this.travelers);
    },
    dailyWeather: [
      { am: "맑음", pm: "맑음" },
      { am: "맑음", pm: "맑음" },
    ],
    days: [
      [
        {
          date: "2026-10-01",
          time: "11:30",
          placeName: "광천식당",
          scheduleType: "flexible",
          completionMessage: "식사는 맛있게 드셨나요? 다음은 성심당 본점이에요.",
        },
        {
          date: "2026-10-01",
          time: "14:00",
          placeName: "성심당 본점",
          scheduleType: "flexible",
          completionMessage: "빵은 맛있게 드셨나요? 다음은 대동하늘공원이에요.",
          disruption: {
            situationLine: "대기 줄이 너무 길어지고 있어요.",
            impactLine: "지금 웨이팅이라면 남은 일정의 체력을 지키기 어려울 수 있어요.",
            situationKind: "crowd",
            replacement: { placeName: "정동문화사", demoImagePath: "/images/demo/daejeon/jeongdong-culture.png" },
          },
        },
        {
          date: "2026-10-01",
          time: "16:30",
          placeName: "대동하늘공원",
          scheduleType: "flexible",
          completionMessage: "하늘공원 풍경은 어떠셨나요? 오늘 일정은 여기까지예요.",
        },
        {
          date: "2026-10-01",
          time: "19:00",
          placeName: "롯데시티호텔 대전",
          scheduleType: "fixed",
          completionMessage: "첫째 날 여행은 여기까지예요. 둘째 날 일정을 이어가볼게요.",
          resolveAddress: "대전 유성구 도룡동 4-30",
        },
      ],
      [
        {
          date: "2026-10-02",
          time: "11:00",
          placeName: "한밭수목원",
          scheduleType: "flexible",
          completionMessage: "수목원 산책은 어떠셨나요? 다음은 점심이에요.",
        },
        {
          date: "2026-10-02",
          time: "13:00",
          placeName: "오씨칼국수",
          scheduleType: "flexible",
          completionMessage: "칼국수는 맛있게 드셨나요? 다음은 국립중앙과학관이에요.",
        },
        {
          date: "2026-10-02",
          time: "15:30",
          placeName: "국립중앙과학관",
          scheduleType: "flexible",
          completionMessage: "과학관 관람은 어떠셨나요? 다음은 한빛탑이에요.",
        },
        {
          date: "2026-10-02",
          time: "18:00",
          placeName: "엑스포과학공원 한빛탑",
          scheduleType: "flexible",
          completionMessage: "한빛탑 주변은 어떠셨나요? 즐거운 대전 여행이었나요? 계획이 달라져도 여행은 계속되니까요.",
          disruption: {
            situationLine: "연예인 축제로 주변에 많은 인파가 몰리고 있어요.",
            impactLine: "지금 인파라면 남은 일정을 편하게 이어가기 어려울 수 있어요.",
            situationKind: "crowd",
            // display name per spec; the real search string that reliably
            // matches the correct, TourAPI-verified record differs — see
            // module doc comment above.
            replacement: {
              placeName: "대청호 명상정원",
              resolveQuery: "명상정원",
              fixedRoute: { distanceMeters: 15000, durationSeconds: 25 * 60 },
            },
          },
        },
      ],
    ],
  },
];

export function getDemoScenario(id: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((s) => s.id === id);
}

/** All items across every day, in schedule order — the same order `buildDemoItinerary` emits, so flat index `i` <-> itinerary `order` (i + 1). */
export function scenarioFlatItems(scenario: DemoScenario): DemoScenarioItem[] {
  return scenario.days.flat();
}

/**
 * The traveler-voiced line to show right after completing itinerary `order`.
 * Falls back to a generic line when the LIVE place at this order no longer
 * matches what the scenario scripted (i.e. Re:Plan changed it) — never
 * invents a fact about a real, emergent replacement place. `hasNext` picks
 * the "다음 목적지" vs. closing tone; `nextPlaceName` (when `hasNext`) names
 * that place in the fallback line instead of a bare "다음 여행" (STEP 20 §15).
 */
export function demoCompletionMessage(
  scenario: DemoScenario,
  order: number,
  livePlaceName: string,
  hasNext: boolean,
  nextPlaceName?: string,
): string {
  const scripted = scenarioFlatItems(scenario)[order - 1];
  if (scripted && scripted.placeName === livePlaceName) return scripted.completionMessage;
  return hasNext && nextPlaceName
    ? journeyGenericContinueMessage(nextPlaceName)
    : DEMO_GENERIC_CLOSING_MESSAGE;
}

export interface BuiltDemoItem {
  date: string;
  time: string;
  placeName: string;
  scheduleType: ScheduleType;
  resolveAddress?: string;
}

/**
 * Flattens the scenario's fixed schedule into itinerary-draft rows. Pure,
 * deterministic, no clock — every date/time below is the scenario's own
 * literal value (STEP 23 §2/§23), never anchored to "now". Re:Plan's real
 * eligibility gate (`selectFlexibleSlots`, used by every ordinary trip) is
 * never consulted for a demo trip's Re:Plan at all — see
 * features/demo/demoReplanService.ts — so there is no need to keep any
 * item's date artificially equal to the real server date.
 */
export function buildDemoItinerary(scenario: DemoScenario): BuiltDemoItem[] {
  return scenarioFlatItems(scenario).map((item) => ({
    date: item.date,
    time: item.time,
    placeName: item.placeName,
    scheduleType: item.scheduleType,
    ...(item.resolveAddress ? { resolveAddress: item.resolveAddress } : {}),
  }));
}
