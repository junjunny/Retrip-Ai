/**
 * features/demo — STEP 16 Demo Mode. A demo trip is a REAL trip (created via
 * the ordinary `features/trip/createTrip`), so the entire rest of the
 * product — candidate generation, deterministic scoring, Kakao Mobility,
 * Re:Plan Preview/Apply — runs completely unmodified. This module only:
 *
 * 1. Holds the 3 scenarios' static schedule + a deliberate `tripPreference`
 *    (a plausible, real group preference — never a scoring shortcut; see
 *    module docstring in features/scoring/scoring.ts on why a real,
 *    strongly-weighted preference profile is enough on its own for a
 *    well-matching real candidate to legitimately outscore "keep current",
 *    which always scores category-neutral).
 * 2. Anchors that fixed schedule to "right now" so the situational item is
 *    always eligible for Re:Plan regardless of when a judge opens the demo
 *    (Re:Plan only ever considers TODAY's remaining flexible items — that
 *    rule is untouched, so the demo must arrive already inside it).
 *
 * Nothing here is read by Travel State, candidate generation, scoring, or
 * Re:Plan — a demo trip earns its result the same way any real trip would.
 */
import { addDays, minutesToTime, timeToMinutes } from "@/lib/kst";
import type { ExperienceProfile, ScheduleType } from "@/types";

/** How far past "now" the situational item is scheduled — enough slack for a judge to click through Home -> Demo -> Trip Detail -> Re:Plan before the clock passes it. */
export const DEMO_TRIGGER_BUFFER_MINUTES = 20;

export interface DemoScenarioItem {
  /** the schedule's own "HH:mm" — real only for the trigger item, which is recomputed relative to "now" (see `buildDemoItinerary`). */
  time: string;
  placeName: string;
  scheduleType: ScheduleType;
  /** exactly one item per scenario — the slot Re:Plan is meant to be tried on. */
  isTrigger?: true;
}

export interface DemoScenario {
  id: string;
  destination: string;
  title: string;
  /** short scenario name on the /demo card, e.g. "전주". */
  cardTitle: string;
  /** one line of trip-length context under the card title, e.g. "2박 3일". */
  cardDuration: string;
  /** the traveler-voiced situation line — shown on both the /demo card and the trip detail banner. Never mentions AI/score/algorithm. */
  situationLine: string;
  /** a real, plausible "what this group cares about" — feeds Experience Preservation honestly, like any real trip's Trip Preference. */
  tripPreference: ExperienceProfile;
  /** index into `days` of the day containing the trigger item. */
  triggerDayIndex: number;
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
 *   the other two axes sitting at neutral, which independently verified
 *   (see tests/_debug_busan run, STEP 16) landed a real REPLACE margin
 *   *under* `MIN_IMPROVEMENT_TO_REPLACE` — an honest KEEP, but not the
 *   demo's intended "transformation" moment. Raising all three real axes
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
 *   5 CLOSEST real TourAPI hits — a real query centered on 한빛탑 (STEP 16
 *   verification) shows the closest contentTypeId-12 candidates are all
 *   under 700m (유성 관광특구, 대전교통문화연수원, 대전 엑스포 아쿠아리움, …);
 *   anything past ~1.2km, "대청호 명상정원" and "갑천" both included, never
 *   reaches the top 5 regardless of radius. Same `nature`/`photo`/`relax`
 *   dilution as 부산 applies (same contentTypeId 12), so the same
 *   all-three-axes-raised profile is used.
 */
export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    id: "jeonju",
    destination: "전주",
    title: "2박 3일 전주 여행",
    cardTitle: "전주",
    cardDuration: "2박 3일",
    situationLine: "서학동예술마을에 예상보다 많은 인파가 몰렸어요.",
    tripPreference: neutralProfile({ culture: 10, photo: 8, relax: 6 }),
    triggerDayIndex: 0,
    days: [
      [
        { time: "13:00", placeName: "현대닭내장", scheduleType: "flexible" },
        { time: "14:00", placeName: "경기전", scheduleType: "flexible" },
        { time: "15:00", placeName: "전주 한옥마을", scheduleType: "flexible" },
        // "서학동예술마을" (no space, no "갤러리" suffix) is the name that
        // actually resolves via Kakao Local — "서학동 예술마을 갤러리"
        // (the literal brief's wording) matches nothing real (STEP 16
        // verification). Same place, the name real search engines know it by.
        { time: "16:00", placeName: "서학동예술마을", scheduleType: "flexible", isTrigger: true },
        { time: "18:00", placeName: "베테랑 칼국수", scheduleType: "flexible" },
        { time: "20:00", placeName: "숙소", scheduleType: "fixed" },
      ],
      [
        { time: "11:00", placeName: "점심", scheduleType: "flexible" },
        { time: "13:00", placeName: "덕진공원", scheduleType: "flexible" },
        { time: "18:00", placeName: "다리미 삼겹살", scheduleType: "flexible" },
        { time: "20:00", placeName: "전주 호텔원", scheduleType: "fixed" },
      ],
      [
        { time: "11:00", placeName: "또또국수", scheduleType: "flexible" },
        { time: "14:00", placeName: "전주월드컵경기장", scheduleType: "flexible" },
      ],
    ],
  },
  {
    id: "busan",
    destination: "부산",
    title: "1박 2일 부산 여행",
    cardTitle: "부산",
    cardDuration: "1박 2일",
    situationLine: "갑작스러운 소나기가 내렸어요.",
    // nature/photo/relax all raised together — see the verification note
    // above on why raising `nature` alone leaves too thin a real margin.
    tripPreference: neutralProfile({ nature: 10, photo: 9, relax: 8 }),
    triggerDayIndex: 1,
    days: [
      [
        { time: "10:00", placeName: "감천문화마을", scheduleType: "flexible" },
        { time: "12:30", placeName: "자갈치시장", scheduleType: "flexible" },
        { time: "15:00", placeName: "흰여울문화마을", scheduleType: "flexible" },
        { time: "18:00", placeName: "마린횟집 해운대본점", scheduleType: "flexible" },
        { time: "20:00", placeName: "한화리조트 해운대", scheduleType: "fixed" },
      ],
      [
        { time: "11:00", placeName: "수변최고돼지국밥", scheduleType: "flexible" },
        { time: "13:00", placeName: "해운대해수욕장", scheduleType: "flexible", isTrigger: true },
      ],
    ],
  },
  {
    id: "daejeon",
    destination: "대전",
    title: "1박 2일 대전 여행",
    cardTitle: "대전",
    cardDuration: "1박 2일",
    situationLine: "한빛탑 주변에 행사로 인파가 몰리고 있어요.",
    // nature/photo/relax all raised together — see the verification note
    // above on why raising `nature` alone leaves too thin a real margin.
    tripPreference: neutralProfile({ nature: 10, photo: 9, relax: 8 }),
    triggerDayIndex: 1,
    days: [
      [
        { time: "11:30", placeName: "광천식당", scheduleType: "flexible" },
        { time: "14:00", placeName: "성심당 본점", scheduleType: "flexible" },
        { time: "16:30", placeName: "대동하늘공원", scheduleType: "flexible" },
        { time: "19:00", placeName: "유성호텔", scheduleType: "fixed" },
      ],
      [
        { time: "11:00", placeName: "한밭수목원", scheduleType: "flexible" },
        { time: "13:00", placeName: "오씨칼국수", scheduleType: "flexible" },
        { time: "15:30", placeName: "국립중앙과학관", scheduleType: "flexible" },
        { time: "18:00", placeName: "엑스포과학공원 한빛탑", scheduleType: "flexible", isTrigger: true },
      ],
    ],
  },
];

export function getDemoScenario(id: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((s) => s.id === id);
}

export interface BuiltDemoItem {
  date: string;
  time: string;
  placeName: string;
  scheduleType: ScheduleType;
}

/**
 * Anchors a scenario's fixed schedule to `now` (KST): the trigger item is
 * placed at `now + DEMO_TRIGGER_BUFFER_MINUTES` on today's date, and every
 * other day shifts by the same number of calendar days relative to the
 * trigger's day — so the trip's internal day-to-day spacing is preserved,
 * only "which real date is Day 1" moves. Every OTHER item keeps its
 * scripted clock time; if `now` is very late in the day this can leave a
 * same-day item narratively "before" the trigger even though it was
 * originally scheduled after — harmless (Re:Plan only reasons about items
 * at/after `now` anyway) and never breaks the trigger's own eligibility,
 * which is the one guarantee this function exists to make. Pure given `now`.
 */
export function buildDemoItinerary(
  scenario: DemoScenario,
  now: { date: string; time: string },
): BuiltDemoItem[] {
  const triggerTotalMinutes = timeToMinutes(now.time) + DEMO_TRIGGER_BUFFER_MINUTES;
  const roundedMinutes = Math.ceil(triggerTotalMinutes / 5) * 5;
  const dayRollover = Math.floor(roundedMinutes / 1440);
  const triggerDate = dayRollover > 0 ? addDays(now.date, dayRollover) : now.date;
  const triggerTime = minutesToTime(roundedMinutes);

  const out: BuiltDemoItem[] = [];
  scenario.days.forEach((day, dayIndex) => {
    const date = addDays(triggerDate, dayIndex - scenario.triggerDayIndex);
    for (const item of day) {
      out.push({
        date,
        time: item.isTrigger ? triggerTime : item.time,
        placeName: item.placeName,
        scheduleType: item.scheduleType,
      });
    }
  });
  return out;
}
