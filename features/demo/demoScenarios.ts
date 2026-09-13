/**
 * features/demo — STEP 16/17 Demo Mode. A demo trip is a REAL trip (created
 * via the ordinary `features/trip/createTrip`), so the entire rest of the
 * product — candidate generation, deterministic scoring, Kakao Mobility,
 * Re:Plan Preview/Apply — runs completely unmodified. This module only:
 *
 * 1. Holds each scenario's static schedule + a deliberate `tripPreference`
 *    (a plausible, real group preference — never a scoring shortcut; see
 *    module docstring in features/scoring/scoring.ts on why a real,
 *    strongly-weighted preference profile is enough on its own for a
 *    well-matching real candidate to legitimately outscore "keep current",
 *    which always scores category-neutral).
 * 2. Anchors that fixed schedule to "right now" so the situational item is
 *    always eligible for Re:Plan regardless of when a judge opens the demo
 *    (Re:Plan only ever considers TODAY's remaining flexible items — that
 *    rule is untouched, so the demo must arrive already inside it).
 * 3. (STEP 17) Describes the journey narrative — a fixed "Demo Clock" label,
 *    a deterministic per-item traveler message, and which item is "current"
 *    the moment the trip is created — purely presentational bookkeeping the
 *    Trip Detail page reads to show progress. None of it is read by
 *    scoring/candidates/Re:Plan either.
 *
 * Nothing here is read by Travel State, candidate generation, scoring, or
 * Re:Plan — a demo trip earns its result the same way any real trip would.
 */
import { JOURNEY_GENERIC_CLOSING_MESSAGE, JOURNEY_GENERIC_CONTINUE_MESSAGE } from "@/features/trip/journeyMessages";
import { addDays, minutesToTime, timeToMinutes } from "@/lib/kst";
import type { ExperienceProfile, ScheduleType } from "@/types";

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

export interface DemoScenario {
  id: string;
  destination: string;
  title: string;
  /** short scenario name on the /demo card, e.g. "전주". */
  cardTitle: string;
  /** (STEP 17) the card's headline, e.g. "교통 혼잡으로 일정이 달라진 여행" — replaces the old situation-line-as-headline copy; never mentions AI/score/algorithm/"체험". */
  cardHeadline: string;
  /** one line of trip-length context under the card title, e.g. "2박 3일". */
  cardDuration: string;
  /** (STEP 19 §18) one short line on the /demo card naming WHAT changes in this scenario — e.g. "교통 때문에 다음 일정이 밀리는 상황". A scripted preview, never confused with a real trip's own Travel State (§18's explicit "체험 시나리오" framing lives in the page copy, not here). */
  cardDescription: string;
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
  /** a real, plausible "what this group cares about" — feeds Experience Preservation honestly, like any real trip's Trip Preference. */
  tripPreference: ExperienceProfile;
  /** index into `days` of the day containing the trigger item. */
  triggerDayIndex: number;
  /**
   * (STEP 17) The fixed clock reading shown when the traveler first opens
   * this demo — NOT the real system clock, so every judge sees the exact
   * same starting moment regardless of when they run it (spec §4). It sits
   * just before the item immediately preceding the trigger's own scripted
   * time — the story already has the traveler most of the way through the
   * day, arriving at the interesting part quickly.
   */
  demoClockLabel: string;
  days: DemoScenarioItem[][];
}

function neutralProfile(overrides: Partial<ExperienceProfile>): ExperienceProfile {
  return {
    nature: 5,
    culture: 5,
    food: 5,
    cafe: 5,
    shopping: 5,
    activity: 5,
    photo: 5,
    relax: 5,
    ...overrides,
  };
}

// Re-exported for backward compatibility with existing demo call sites —
// the actual definitions live in features/trip/journeyMessages.ts (STEP 18
// §32): the generic journey mechanism must not depend on the demo-specific
// module, so the dependency runs demo -> generic, never the reverse. Used
// here only once Re:Plan has changed a place away from what the scenario
// scripted (i.e. the live place no longer matches `completionMessage`) —
// never invents a fact about the real, emergent replacement.
export const DEMO_GENERIC_CONTINUE_MESSAGE = JOURNEY_GENERIC_CONTINUE_MESSAGE;
export const DEMO_GENERIC_CLOSING_MESSAGE = JOURNEY_GENERIC_CLOSING_MESSAGE;

/**
 * Real-API verification notes (STEP 16 — never hardcode the *result*, only
 * tune the *input*; see the module docstring):
 *
 * - 부산 (해운대해수욕장 -> a real 관광지 within reach, e.g. SEA LIFE
 *   부산아쿠아리움, 131m apart): confirmed via real TourAPI/Kakao Mobility
 *   calls — but a contentTypeId 12 candidate is scored on THREE profile axes
 *   at once (`nature`+`photo`+`relax` all map to code 12 — see
 *   `PREFERENCE_TO_CONTENT_TYPE`), not just `nature` alone. A profile that
 *   only raises `nature` gets its Experience Preservation average diluted by
 *   the other two axes sitting at neutral — raising all three real axes
 *   together (not a scoring change — the same real profile a
 *   nature-and-photo-minded beach group would plausibly report) restores a
 *   comfortable real margin.
 * - 전주 (서학동예술마을 -> a real 문화시설): the specific place named in the
 *   original brief ("국립무형유산원") does not exist in TourAPI's dataset at
 *   all, at any radius — it can never surface through real candidate
 *   generation. `culture`/`photo` bias the search toward contentTypeId
 *   14/15 (문화시설/축제), where REAL nearby candidates do exist (e.g. 전주
 *   부채문화관, 전주공예품전시관, 서학동사진미술관, all within 1km) — the demo
 *   shows whichever one the real deterministic scoring actually picks.
 * - 대전 (한빛탑 -> a real 관광지 within reach): "대청호 명상정원" is 8.7km
 *   away and, separately, `MAX_CANDIDATES_PER_SLOT` (5) caps the pool to the
 *   5 CLOSEST real TourAPI hits — a real query centered on 한빛탑 shows the
 *   closest contentTypeId-12 candidates are all under 700m; anything past
 *   ~1.2km, "대청호 명상정원" included, never reaches the top 5 regardless of
 *   radius. Same `nature`/`photo`/`relax` dilution as 부산 applies, so the
 *   same all-three-axes-raised profile is used. (STEP 17: among the tied
 *   top-5 real candidates the deterministic tie-break — finalScore, then
 *   real travel burden, then placeId — can land on an unglamorous real pick;
 *   that's genuine emergent behavior, not a bug, and is not gamed here.)
 */
export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    id: "jeonju",
    destination: "전주",
    title: "2박 3일 전주 여행",
    cardTitle: "전주",
    cardHeadline: "교통 혼잡으로 일정이 달라진 여행",
    cardDuration: "2박 3일",
    cardDescription: "교통 때문에 다음 일정이 밀리는 상황",
    situationLine: "현재 주변 교통이 혼잡해 이동에 시간이 더 걸리고 있어요.",
    impactLine: "지금 속도라면 다음 일정까지 이동 부담이 커질 수 있어요.",
    tripPreference: neutralProfile({ culture: 10, photo: 8, relax: 6 }),
    triggerDayIndex: 0,
    demoClockLabel: "15:45",
    days: [
      [
        {
          time: "13:00",
          placeName: "현대닭내장",
          scheduleType: "flexible",
          completionMessage: "점심은 괜찮으셨나요? 이제 경기전으로 이동해볼게요.",
        },
        {
          time: "14:00",
          placeName: "경기전",
          scheduleType: "flexible",
          completionMessage: "경기전은 잘 둘러보셨나요? 다음은 전주 한옥마을이에요.",
        },
        {
          time: "15:00",
          placeName: "전주 한옥마을",
          scheduleType: "flexible",
          completionMessage: "한옥마을 구경은 어떠셨나요? 다음 일정은 서학동예술마을이에요.",
        },
        // "서학동예술마을" (no space, no "갤러리" suffix) is the name that
        // actually resolves via Kakao Local — "서학동 예술마을 갤러리"
        // (the literal brief's wording) matches nothing real (STEP 16
        // verification). Same place, the name real search engines know it by.
        {
          time: "16:00",
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
          time: "11:00",
          placeName: "점심",
          scheduleType: "flexible",
          completionMessage: "점심은 맛있게 드셨나요? 다음은 덕진공원이에요.",
        },
        {
          time: "13:00",
          placeName: "덕진공원",
          scheduleType: "flexible",
          completionMessage: "덕진공원은 산책하기 어떠셨나요? 다음은 저녁 식사예요.",
        },
        {
          time: "18:00",
          placeName: "다리미 삼겹살",
          scheduleType: "flexible",
          completionMessage: "삼겹살은 맛있게 드셨나요? 오늘도 여기까지예요.",
        },
        {
          time: "20:00",
          placeName: "전주 호텔원",
          scheduleType: "fixed",
          completionMessage: "둘째 날 여행은 여기까지예요. 마지막 날 일정을 이어가볼게요.",
        },
      ],
      [
        {
          time: "11:00",
          placeName: "또또국수",
          scheduleType: "flexible",
          completionMessage: "아침 식사는 어떠셨나요? 마지막 코스로 이동해볼게요.",
        },
        {
          time: "14:00",
          placeName: "전주월드컵경기장",
          scheduleType: "flexible",
          completionMessage: "즐거운 전주 여행이었나요? 계획이 달라져도 여행은 계속되니까요.",
        },
      ],
    ],
  },
  {
    id: "busan",
    destination: "부산",
    title: "1박 2일 부산 여행",
    cardTitle: "부산",
    cardHeadline: "갑작스러운 소나기로 일정이 달라진 여행",
    cardDuration: "1박 2일",
    cardDescription: "갑작스러운 비로 야외 일정이 흔들리는 상황",
    situationLine: "갑작스러운 소나기가 내리고 있어요.",
    impactLine: "지금 계획대로 진행하면 원래 기대했던 야외 경험과 달라질 수 있어요.",
    // nature/photo/relax all raised together — see the verification note
    // above on why raising `nature` alone leaves too thin a real margin.
    tripPreference: neutralProfile({ nature: 10, photo: 9, relax: 8 }),
    triggerDayIndex: 1,
    demoClockLabel: "12:50",
    days: [
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
          completionMessage: "회는 맛있게 드셨나요? 오늘 일정은 여기까지예요.",
        },
        {
          time: "20:00",
          placeName: "한화리조트 해운대",
          scheduleType: "fixed",
          completionMessage: "첫째 날 여행은 여기까지예요. 둘째 날 일정을 이어가볼게요.",
        },
      ],
      [
        {
          time: "11:00",
          placeName: "수변최고돼지국밥",
          scheduleType: "flexible",
          completionMessage: "돼지국밥은 맛있게 드셨나요? 다음은 해운대해수욕장이에요.",
        },
        {
          time: "13:00",
          placeName: "해운대해수욕장",
          scheduleType: "flexible",
          isTrigger: true,
          completionMessage: "해변에서 잘 쉬셨나요? 오늘 여행은 여기까지예요.",
        },
        {
          time: "18:00",
          placeName: "여행 종료",
          scheduleType: "fixed",
          completionMessage: DEMO_GENERIC_CLOSING_MESSAGE,
        },
      ],
    ],
  },
  {
    id: "daejeon",
    destination: "대전",
    title: "1박 2일 대전 여행",
    cardTitle: "대전",
    cardHeadline: "인파 혼잡으로 일정이 달라진 여행",
    cardDuration: "1박 2일",
    cardDescription: "방문객 증가로 일정의 이동 부담이 커지는 상황",
    situationLine: "연예인 축제로 주변에 많은 인파가 몰리고 있어요.",
    impactLine: "지금 인파라면 남은 일정을 편하게 이어가기 어려울 수 있어요.",
    // nature/photo/relax all raised together — see the verification note
    // above on why raising `nature` alone leaves too thin a real margin.
    tripPreference: neutralProfile({ nature: 10, photo: 9, relax: 8 }),
    triggerDayIndex: 1,
    demoClockLabel: "17:45",
    days: [
      [
        {
          time: "11:30",
          placeName: "광천식당",
          scheduleType: "flexible",
          completionMessage: "식사는 맛있게 드셨나요? 다음은 성심당이에요.",
        },
        {
          time: "14:00",
          placeName: "성심당 본점",
          scheduleType: "flexible",
          completionMessage: "빵은 맛있게 드셨나요? 다음은 대동하늘공원이에요.",
        },
        {
          time: "16:30",
          placeName: "대동하늘공원",
          scheduleType: "flexible",
          completionMessage: "하늘공원 풍경은 어떠셨나요? 오늘 일정은 여기까지예요.",
        },
        {
          time: "19:00",
          placeName: "롯데시티호텔 대전",
          scheduleType: "fixed",
          completionMessage: "첫째 날 여행은 여기까지예요. 둘째 날 일정을 이어가볼게요.",
        },
      ],
      [
        {
          time: "11:00",
          placeName: "한밭수목원",
          scheduleType: "flexible",
          completionMessage: "수목원 산책은 어떠셨나요? 다음은 점심이에요.",
        },
        {
          time: "13:00",
          placeName: "오씨칼국수",
          scheduleType: "flexible",
          completionMessage: "칼국수는 맛있게 드셨나요? 다음은 국립중앙과학관이에요.",
        },
        {
          time: "15:30",
          placeName: "국립중앙과학관",
          scheduleType: "flexible",
          completionMessage: "과학관 관람은 어떠셨나요? 다음은 한빛탑이에요.",
        },
        {
          time: "18:00",
          placeName: "엑스포과학공원 한빛탑",
          scheduleType: "flexible",
          isTrigger: true,
          completionMessage: "한빛탑 주변은 어떠셨나요? 오늘 여행은 여기까지예요.",
        },
        {
          time: "20:00",
          placeName: "여행 종료",
          scheduleType: "fixed",
          completionMessage: DEMO_GENERIC_CLOSING_MESSAGE,
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
 * (STEP 17) The item "current" the moment a demo trip is created — the one
 * immediately before the trigger. Everything before it starts pre-completed
 * (see `demoService.ts`), so a judge lands a few steps into the day, right
 * before the interesting part, instead of walking through an already-done
 * lunch/sightseeing stop first.
 */
export function startingCurrentOrder(scenario: DemoScenario): number {
  return triggerOrder(scenario) - 1;
}

/**
 * The scripted display time for itinerary `order` (1-based), or `null` when
 * `order` is out of the scenario's own range (should never happen for a real
 * demo trip). Decoupled from the item's real stored `time` — see
 * `buildDemoItinerary`'s doc comment.
 */
export function demoDisplayTime(scenario: DemoScenario, order: number): string | null {
  return scenarioFlatItems(scenario)[order - 1]?.time ?? null;
}

/**
 * The traveler-voiced line to show right after completing itinerary `order`.
 * Falls back to a generic line when the LIVE place at this order no longer
 * matches what the scenario scripted (i.e. Re:Plan changed it) — never
 * invents a fact about a real, emergent replacement place. `hasNext` picks
 * the "다음 목적지" vs. closing tone.
 */
export function demoCompletionMessage(
  scenario: DemoScenario,
  order: number,
  livePlaceName: string,
  hasNext: boolean,
): string {
  const scripted = scenarioFlatItems(scenario)[order - 1];
  if (scripted && scripted.placeName === livePlaceName) return scripted.completionMessage;
  return hasNext ? DEMO_GENERIC_CONTINUE_MESSAGE : DEMO_GENERIC_CLOSING_MESSAGE;
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
 * trigger's day, so day-to-day spacing is preserved. The user-visible clock
 * is `demoDisplayTime`, computed separately — this function's output is
 * Re:Plan/sort plumbing only, never shown directly. Pure given `now`.
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
