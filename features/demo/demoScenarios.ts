/**
 * features/demo — STEP 16/17/21/22 Demo Mode. A demo trip is a REAL trip
 * (created via the ordinary `features/trip/createTrip`), so the entire rest
 * of the product — candidate generation, deterministic scoring, Kakao
 * Mobility, Re:Plan Preview/Apply — runs completely unmodified. This module
 * only:
 *
 * 1. Holds each scenario's static schedule and its 3 real travelers'
 *    preferences (STEP 22) — seeded through the ordinary `/submit` endpoint
 *    (demoService.ts) so `groupSatisfaction` scoring reads their real,
 *    genuinely different vectors, never a single hand-picked aggregate.
 * 2. Anchors that fixed schedule to "right now" so the situational item is
 *    always eligible for Re:Plan regardless of when a judge opens the demo
 *    (Re:Plan only ever considers TODAY's remaining flexible items — that
 *    rule is untouched, so the demo must arrive already inside it).
 * 3. Describes the journey narrative — a DEMO-ONLY simulated weather
 *    outlook per day and a scripted "10월 N일" display date (STEP 22 §2/§3)
 *    — decoupled from the real anchored date/time exactly the same way
 *    `demoDisplayTime` already decouples the story's own clock reading from
 *    the real Re:Plan-eligibility timestamp. Demo scenario data is NEVER
 *    presented as real weather/traffic data (see `dailyWeather`'s doc
 *    comment) — that boundary is the whole reason this data lives here and
 *    not in features/travel-state.
 *
 * Nothing here is read by Travel State, candidate generation, scoring, or
 * Re:Plan — a demo trip earns its result the same way any real trip would.
 * The one deliberate, narrowly-scoped exception is the 대전 scenario's
 * intended-replacement override — see features/demo/demoReplanOverride.ts's
 * module doc for why and how it stays inside the Demo/Production boundary.
 */
import { buildExperienceProfile } from "@/features/experience";
import { PREFERENCE_KEYS, PREFERENCE_MIN, PREFERENCE_NEUTRAL } from "@/features/participant/participant";
import { JOURNEY_GENERIC_CLOSING_MESSAGE, journeyGenericContinueMessage } from "@/features/trip/journeyMessages";
import { addDays, minutesToTime, timeToMinutes } from "@/lib/kst";
import type { ExperienceProfile, IndoorOutdoor, PreferenceKey, PreferenceVector, ScheduleType, TravelPace } from "@/types";

/** How far past "now" the situational item is scheduled — enough slack for a judge to click through Home -> Demo -> Trip Detail -> Re:Plan before the clock passes it. */
export const DEMO_TRIGGER_BUFFER_MINUTES = 20;

/**
 * (STEP 17) Every item sharing the trigger's calendar day gets its REAL
 * stored `time` anchored to the trigger's real time ± this many minutes per
 * list position — never its own scripted clock reading. Fixes a real STEP 16
 * bug: leaving same-day siblings at their absolute scripted time let an
 * item scheduled LATER in the story (e.g. dinner) sort AHEAD of the trigger
 * once the trigger's own time was pushed to "now" — silently reordering the
 * itinerary. The displayed clock the user sees is a separate, purely
 * cosmetic value (`demoDisplayTime` below) — this constant only has to keep
 * the STORED order (and therefore Firestore's assigned `order`) correct, so
 * it can be small/arbitrary.
 */
const DEMO_SAME_DAY_SPACING_MINUTES = 2;

export interface DemoScenarioItem {
  /** the story's own "HH:mm" — shown to the user via `demoDisplayTime`, decoupled from the real stored time (see `buildDemoItinerary`). */
  time: string;
  placeName: string;
  scheduleType: ScheduleType;
  /** exactly one item per scenario — the slot Re:Plan is meant to be tried on. */
  isTrigger?: true;
  /**
   * (STEP 17) One short, traveler-voiced line shown right after this item is
   * marked complete — never a chatbot-length explanation, never an invented
   * fact about the place. See `demoCompletionMessage`.
   */
  completionMessage: string;
  /**
   * (STEP 17) A real street address to resolve THIS item by instead of its
   * `placeName` — for a generic/ambiguous name a keyword search can't
   * reliably match (e.g. "전주 숙소") or a chain name that needs pinning to
   * one real branch (e.g. "베테랑 칼국수"). See the `/resolve?addr=` path.
   */
  resolveAddress?: string;
}

/** The exact named axis + value a traveler was given (STEP 22 §6-9) — shown verbatim in the participant detail view, never collapsed into the internal scoring labels. */
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
 * preference vectors, not a single hand-picked aggregate. `role` is a
 * demo-only presentational label (which name to show first / call "방장") —
 * it is NEVER written to the real `Participant` Firestore schema, which has
 * no such field (see features/participant/participant.ts) — a demo trip's
 * participant documents are indistinguishable from a real trip's.
 */
export interface DemoTraveler {
  name: string;
  role: "HOST" | "MEMBER";
  /** the exact named axes this traveler was given (STEP 22 §6-8) — shown verbatim in the participant detail view. */
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
 * A DEMO-ONLY simulated weather outlook for one day (STEP 22 §3) — never
 * fetched from KMA, never presented as a real forecast. This is a
 * SCENARIO-authored condition so a judge can reliably experience a
 * variable, regardless of what the real weather happens to be when the
 * demo runs. The UI must always carry a "DEMO 상황" style label alongside
 * this data — see components/demo/DemoTripSetup.tsx.
 */
export interface DemoWeatherOutlook {
  am: string;
  pm: string;
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
  /** the traveler-voiced situation line — shown on the trip detail banner once the traveler reaches the trigger item. Never mentions AI/score/algorithm. */
  situationLine: string;
  /**
   * (STEP 19 §19) "영향" — where the situation actually bites in THIS
   * scripted trip, shown right under `situationLine` in the same
   * 상황→영향→행동 structure a real trip's `buildSituationMessage` uses.
   * Scripted (this is a controlled demo, not a live Travel State reading),
   * but written in the same honest, concrete register — never a raw
   * number that isn't real.
   */
  impactLine: string;
  /** (STEP 21) which icon the situation banner/Preview should use — see `SituationKind`'s doc comment on why "crowd" is demo-only. */
  situationKind: "weather" | "traffic" | "crowd";
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
  /** index into `days` of the day containing the trigger item. */
  triggerDayIndex: number;
  /**
   * (STEP 17) The fixed clock reading shown once the traveler reaches the
   * trigger day's own first item — NOT the real system clock, so every
   * judge sees the exact same starting moment regardless of when they run
   * it (spec §4).
   */
  demoClockLabel: string;
  /** DEMO-ONLY simulated weather, one entry per `days` index — see `DemoWeatherOutlook`. */
  dailyWeather: readonly DemoWeatherOutlook[];
  days: DemoScenarioItem[][];
}

/** The group's real Experience Profile — see `DemoScenario.tripPreference`'s doc comment. Rounded to whole integers: `createTrip`'s own validation (features/trip/trip.ts, unchanged) requires an integer `tripPreference`, while `buildExperienceProfile`'s group MEAN can be fractional. `groupSatisfaction` scoring still reads the 3 travelers' own unrounded vectors directly via `listPreferenceVectors`. */
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
 * Real-API verification notes (STEP 16/22 — never hardcode the *result*,
 * only tune the *input*; see the module docstring):
 *
 * - 전주 (서학동예술마을 -> a real 문화시설): the specific place named in the
 *   original brief ("국립무형유산원") does not exist in TourAPI's dataset at
 *   all, at any radius — it can never surface through real candidate
 *   generation. The group's real culture/photo/nature signal biases the
 *   search toward contentTypeId 12/14/15, where REAL nearby candidates do
 *   exist (e.g. 전주 부채문화관, 전주공예품전시관, 서학동사진미술관, 남천교
 *   청연루, all within 1km) — the demo shows whichever one the real
 *   deterministic scoring actually picks.
 * - 부산 (미포 -> a real 관광지 within reach): 해운대/청사포/미포/광안리 all
 *   verified real via TourAPI+Kakao Local; 미포 resolves at "candidate"
 *   confidence (TourAPI only, no Kakao cross-match) and is pinned by its
 *   real street address to avoid an ambiguous keyword match.
 * - 대전 (대청호자연수변공원 -> real 관광지 in 동구 추동, ~1.1km from the
 *   scenario's own intended-replacement place "명상정원") — see
 *   features/demo/demoReplanOverride.ts for why 대전's intended replacement
 *   is handled as an explicit, narrowly-scoped Demo-scenario connection
 *   rather than left to `locationBasedList2`, which does not index that
 *   specific TourAPI content record from ANY real anchor (verified via live
 *   probe, same class of gap as "국립무형유산원" above).
 */
export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    id: "jeonju",
    destination: "전주",
    title: "1박 2일 전주 여행",
    cardTitle: "전주",
    conceptTagline: "골목과 전통을 천천히",
    cardDuration: "1박 2일",
    situationLine: "현재 주변 교통이 혼잡해 이동에 시간이 더 걸리고 있어요.",
    impactLine: "지금 속도라면 다음 일정까지 이동 부담이 커질 수 있어요.",
    situationKind: "traffic",
    travelers: [
      traveler(
        "민준",
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
        "유명한 곳을 많이 찍는 것보다 전주의 분위기를 느끼는 게 중요해요.",
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
        "전주까지 왔으면 맛있는 음식과 예쁜 카페를 즐기는 게 중요해요.",
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
        "사진으로 남길 수 있는 분위기와 오래된 장소를 좋아해요.",
      ),
    ],
    get tripPreference() {
      return groupProfile(this.travelers);
    },
    triggerDayIndex: 0,
    demoClockLabel: "11:00",
    dailyWeather: [
      { am: "맑음", pm: "흐림" },
      { am: "맑음", pm: "맑음" },
    ],
    days: [
      [
        {
          time: "11:00",
          placeName: "현대닭내장",
          scheduleType: "flexible",
          completionMessage: "점심은 괜찮으셨나요? 이제 경기전으로 이동해볼게요.",
        },
        {
          time: "13:00",
          placeName: "경기전",
          scheduleType: "flexible",
          completionMessage: "경기전은 잘 둘러보셨나요? 다음은 전주 한옥마을이에요.",
        },
        {
          time: "14:00",
          placeName: "전주 한옥마을",
          scheduleType: "flexible",
          completionMessage: "한옥마을 구경은 어떠셨나요? 다음 일정은 서학동예술마을이에요.",
        },
        // "서학동예술마을" (no space, no "갤러리" suffix) is the name that
        // actually resolves via Kakao Local — "서학동 예술마을 갤러리"
        // (the literal brief's wording) matches nothing real (STEP 16
        // verification). Same place, the name real search engines know it by.
        {
          time: "15:30",
          placeName: "서학동예술마을",
          scheduleType: "flexible",
          isTrigger: true,
          completionMessage: "전시 관람은 어떠셨나요? 이제 저녁을 먹으러 이동해볼게요.",
        },
        {
          time: "18:00",
          placeName: "베테랑 칼국수",
          scheduleType: "fixed",
          completionMessage: "칼국수는 맛있게 드셨나요? 베테랑은 칼국수가 유명한 곳이에요.",
          resolveAddress: "전북특별자치도 전주시 완산구 교동 84-10",
        },
        {
          time: "20:00",
          placeName: "전주 숙소",
          scheduleType: "fixed",
          completionMessage: "오늘 여행은 여기까지예요. 푹 쉬고 내일 일정을 이어가볼게요.",
          resolveAddress: "전북특별자치도 전주시 완산구 현무1길 10",
        },
      ],
      [
        {
          time: "10:00",
          placeName: "전주덕진공원",
          scheduleType: "flexible",
          completionMessage: "덕진공원 산책은 어떠셨나요? 다음은 마지막 점심이에요.",
        },
        {
          time: "12:30",
          placeName: "다리미 삼겹살",
          scheduleType: "flexible",
          completionMessage: "즐거운 전주 여행이었나요? 계획이 달라져도 여행은 계속되니까요.",
        },
      ],
    ],
  },
  {
    id: "busan",
    destination: "부산",
    title: "2박 3일 부산 여행",
    cardTitle: "부산",
    conceptTagline: "바다와 풍경을 따라",
    cardDuration: "2박 3일",
    situationLine: "갑작스러운 소나기가 내리고 있어요.",
    impactLine: "지금 계획대로 진행하면 원래 기대했던 야외 경험과 달라질 수 있어요.",
    situationKind: "weather",
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
        "부산까지 왔는데 바다를 안 보면 여행한 느낌이 안 나요.",
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
        "예쁜 풍경을 보고 사진으로 남기는 게 여행의 가장 큰 목적이에요.",
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
          { label: "여유·휴식", value: 4 },
        ],
        "fast",
        "balanced",
        "먹고 놀 게 많으면 만족해요. 너무 느긋한 일정은 지루해요.",
      ),
    ],
    get tripPreference() {
      return groupProfile(this.travelers);
    },
    triggerDayIndex: 0,
    demoClockLabel: "10:00",
    dailyWeather: [
      { am: "맑음", pm: "소나기" },
      { am: "흐림", pm: "맑음" },
      { am: "맑음", pm: "맑음" },
    ],
    days: [
      [
        {
          time: "10:00",
          placeName: "해운대해수욕장",
          scheduleType: "flexible",
          completionMessage: "해변에서 잘 쉬셨나요? 다음은 청사포예요.",
        },
        {
          time: "12:00",
          placeName: "청사포",
          scheduleType: "flexible",
          completionMessage: "청사포는 어떠셨나요? 다음은 미포예요.",
        },
        {
          time: "15:00",
          placeName: "미포",
          scheduleType: "flexible",
          isTrigger: true,
          completionMessage: "미포는 어떠셨나요? 다음은 광안리예요.",
          resolveAddress: "부산광역시 해운대구 달맞이길62번길 3",
        },
        {
          time: "17:30",
          placeName: "광안리",
          scheduleType: "flexible",
          completionMessage: "광안리 야경은 어떠셨나요? 첫째 날 여행은 여기까지예요.",
        },
      ],
      [
        {
          time: "10:00",
          placeName: "감천문화마을",
          scheduleType: "flexible",
          completionMessage: "감천문화마을은 둘러보시기에 어떠셨나요? 다음은 자갈치시장이에요.",
        },
        {
          time: "12:30",
          placeName: "자갈치시장",
          scheduleType: "flexible",
          completionMessage: "자갈치시장 구경은 어떠셨나요? 다음은 흰여울문화마을이에요.",
        },
        {
          time: "15:00",
          placeName: "흰여울문화마을",
          scheduleType: "flexible",
          completionMessage: "흰여울문화마을 산책은 어떠셨나요? 저녁 식사로 이동해볼게요.",
        },
        {
          time: "18:00",
          placeName: "마린횟집 해운대본점",
          scheduleType: "flexible",
          completionMessage: "회는 맛있게 드셨나요? 둘째 날 여행은 여기까지예요.",
        },
        {
          time: "20:00",
          placeName: "한화리조트 해운대",
          scheduleType: "fixed",
          completionMessage: "둘째 날 여행은 여기까지예요. 마지막 날 일정을 이어가볼게요.",
        },
      ],
      [
        {
          time: "11:00",
          placeName: "수변최고돼지국밥",
          scheduleType: "flexible",
          completionMessage: "즐거운 부산 여행이었나요? 계획이 달라져도 여행은 계속되니까요.",
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
    situationLine: "연예인 축제로 주변에 많은 인파가 몰리고 있어요.",
    impactLine: "지금 인파라면 남은 일정을 편하게 이어가기 어려울 수 있어요.",
    situationKind: "crowd",
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
        "대전에서만 할 수 있는 경험을 하고 싶어요. 흔한 관광지는 우선순위가 낮아요.",
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
        "전시도 좋지만 분위기 좋은 공간에서 쉬고 사진 찍는 것도 중요해요.",
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
        "여행은 먹는 재미가 중요하지만, 이것저것 돌아다니며 새로운 곳을 보는 것도 좋아해요.",
      ),
    ],
    get tripPreference() {
      return groupProfile(this.travelers);
    },
    triggerDayIndex: 0,
    demoClockLabel: "12:00",
    dailyWeather: [
      { am: "맑음", pm: "맑음" },
      { am: "맑음", pm: "맑음" },
    ],
    days: [
      [
        {
          time: "12:00",
          placeName: "성심당 본점",
          scheduleType: "flexible",
          completionMessage: "빵은 맛있게 드셨나요? 다음은 국립중앙과학관이에요.",
        },
        {
          time: "15:00",
          placeName: "국립중앙과학관",
          scheduleType: "flexible",
          completionMessage: "과학관 관람은 어떠셨나요? 다음은 대청호자연수변공원이에요.",
        },
        {
          time: "17:00",
          placeName: "대청호자연수변공원",
          scheduleType: "flexible",
          isTrigger: true,
          completionMessage: "대청호 나들이는 어떠셨나요? 오늘 여행은 여기까지예요.",
        },
      ],
      [
        {
          time: "11:00",
          placeName: "한밭수목원",
          scheduleType: "flexible",
          completionMessage: "즐거운 대전 여행이었나요? 계획이 달라져도 여행은 계속되니까요.",
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

/** The trigger item's 1-based itinerary `order`. */
export function triggerOrder(scenario: DemoScenario): number {
  return scenarioFlatItems(scenario).findIndex((it) => it.isTrigger) + 1;
}

/**
 * (STEP 22 §2) The scripted display date for `days` index `dayIndex` — a
 * FIXED "10월 N일" narrative, always starting 2026-10-01, completely
 * decoupled from the REAL anchored calendar date `buildDemoItinerary`
 * assigns for Re:Plan eligibility (exactly the same decoupling
 * `demoDisplayTime` already does for the clock — see its doc comment for
 * why: Re:Plan only ever considers TODAY's remaining flexible items, so the
 * real stored date must track the actual server clock, never a fixed
 * calendar date, while the STORY the traveler sees can still read "10월
 * 1일" no matter when the demo is actually run).
 */
export function demoDisplayDate(dayIndex: number): string {
  return `10월 ${dayIndex + 1}일`;
}

/**
 * (STEP 22 §4) The item "current" the moment a demo trip is created — ALWAYS
 * the very first itinerary item. A demo trip never pre-completes any lead-in
 * item and never starts mid-itinerary; the traveler walks every real "완료
 * -> 다음" step from Day 1's first stop, including however many normal
 * stops precede the trigger.
 */
export const DEMO_STARTING_ORDER = 1;

/**
 * The scripted display time for itinerary `order` (1-based), or `null` when
 * `order` is out of the scenario's own range (should never happen for a real
 * demo trip). Decoupled from the item's real stored `time` — see
 * `buildDemoItinerary`'s doc comment. The very first item additionally shows
 * `demoClockLabel` instead (see app/trip/[tripId]/page.tsx) — a fixed "it's
 * about this time" narrative reading, the same one every judge sees.
 */
export function demoDisplayTime(scenario: DemoScenario, order: number): string | null {
  return scenarioFlatItems(scenario)[order - 1]?.time ?? null;
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
 * Anchors a scenario's fixed schedule to `now` (KST). The trigger item's
 * real stored time is `now + DEMO_TRIGGER_BUFFER_MINUTES` (rounded up to the
 * next 5 minutes), clamped to stay on TODAY — never rolled into tomorrow.
 * Re:Plan's own eligibility gate (`selectFlexibleSlots`, untouched) requires
 * `item.date === (the server's real current date)`; rolling the trigger to
 * "tomorrow" whenever the buffer crossed midnight (an earlier version of
 * this function did exactly that) left a real ~20-minute-wide window, any
 * time `now` fell late enough in the day, where the trigger's stored date
 * was already "tomorrow" while the server's actual clock hadn't reached
 * midnight yet — silently making Re:Plan report zero eligible slots. Every
 * OTHER item sharing the trigger's calendar day is anchored the SAME way and
 * clamped the SAME way, offset from the trigger by its list position ×
 * `DEMO_SAME_DAY_SPACING_MINUTES` — never its own absolute scripted clock
 * reading (a separate STEP 17 fix — see that constant's doc comment for the
 * reordering bug this closes). Items on a DIFFERENT day keep their scripted
 * time; only the calendar date shifts, by the same number of days as the
 * trigger's day, so day-to-day spacing is preserved. The user-visible date
 * is the fixed "10월 N일" story (`demoDisplayDate`) and the user-visible
 * clock is `demoDisplayTime` — this function's output is Re:Plan/sort
 * plumbing only, never shown directly. Pure given `now`.
 */
export function buildDemoItinerary(
  scenario: DemoScenario,
  now: { date: string; time: string },
): BuiltDemoItem[] {
  const triggerDay = scenario.days[scenario.triggerDayIndex];
  const triggerPos = triggerDay.findIndex((it) => it.isTrigger);

  const triggerTotalMinutes = timeToMinutes(now.time) + DEMO_TRIGGER_BUFFER_MINUTES;
  // Clamp to [0, 1439] — the trigger's day is ALWAYS `now.date`, full stop.
  const triggerMinutes = Math.min(Math.ceil(triggerTotalMinutes / 5) * 5, 1439);

  const out: BuiltDemoItem[] = [];
  scenario.days.forEach((day, dayIndex) => {
    const isTriggerDay = dayIndex === scenario.triggerDayIndex;
    const date = isTriggerDay ? now.date : addDays(now.date, dayIndex - scenario.triggerDayIndex);
    day.forEach((item, pos) => {
      const time = isTriggerDay
        ? minutesToTime(
            Math.max(0, Math.min(1439, triggerMinutes + (pos - triggerPos) * DEMO_SAME_DAY_SPACING_MINUTES)),
          )
        : item.time;
      out.push({
        date,
        time,
        placeName: item.placeName,
        scheduleType: item.scheduleType,
        ...(item.resolveAddress ? { resolveAddress: item.resolveAddress } : {}),
      });
    });
  });
  return out;
}
