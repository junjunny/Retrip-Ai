# Re:Trip AI

> "Your Plan Can Change. Your Trip Doesn't Have To."

Entry for the 2026 관광데이터 활용 공모전 (web/app implementation track).

## 1. 문제 정의

여행은 계획대로 흘러가지 않는다 — 비가 오고, 길이 막히고, 예상보다 시간이 남거나
모자란다. 대부분의 여행 서비스는 "장소를 추천"하는 데서 멈춘다. Re:Trip AI는 한
걸음 더 나아가, 지금 이 여행이 원래 계획/그룹의 취향과 얼마나 어긋나 있는지를
계산하고 — 사용자가 원할 때만 — 남은 일정을 그 상황에 맞게 다시 짠다.

## 2. 핵심 기능

- **일정 생성** — 날짜별 FIXED/FLEXIBLE 일정, 장소 확인(TourAPI + Kakao Local
  교차검증), 지도 표시
- **그룹 선호도** — 로그인 없이 참가자별 8축 선호도(1~10) 수집, 그룹 평균
  Experience Profile 계산
- **Travel State** — 계획 대비 지금 상황(지연, 날씨/교통 위험, 선호 편차)을
  내부적으로 계산 (사용자에게 노출되지 않음, 자동 개입 없음)
- **Re:Plan** — 사용자가 [Re:Plan]을 눌렀을 때만 FLEXIBLE 슬롯의 실제 대체
  후보를 생성 → 결정론적으로 점수화 → Preview(읽기 전용) → 명시적 Apply
- **Mobility** — Re:Plan 후보까지의 실제 이동 정보(도보/자동차/대중교통)
- **LLM 설명** — 이미 결정된 결과를 자연어로 설명만 함 (아래 10번 참고)

## 3. Travel State

`features/travel-state` — "계획 대비 지금 상황"을 계산하는 내부 엔진.
scheduleDelay(지연), weatherRisk/trafficBurden(날씨·교통 위험도),
experienceDeviation(선호도와의 이탈, 방문 추적 인프라가 없어 현재 항상 `null`),
preferenceDisagreement(그룹 선호도 분산)를 계산한다. **`status`
(NORMAL/WATCH/INTERVENTION)는 내부 전용이며 UI에 노출되지 않고, 어떤 자동 개입도
트리거하지 않는다.** 실제 KMA 단기예보 + Kakao Mobility 데이터를 쓰지만, 이 데이터
자체는 매 요청마다 새로 계산될 뿐 저장되지 않는다.

## 4. Candidate Generation

`features/candidate` — FLEXIBLE하고 아직 완료되지 않은, 오늘 날짜의 슬롯에 대해
실제 TourAPI 장소를 검색하고 Kakao Local로 교차 검증해 최대 5개의 대체 후보를
만든다. 순위를 매기지 않는다 — "무엇이 가능한가"만 답한다. 그룹 Experience
Profile(또는 이번 여행의 Trip Preference, 아래 7번)로 검색 카테고리를 좁히고,
날씨가 나쁘면 실내 카테고리를 추가하지만 실외를 배제하지는 않는다.

## 5. Deterministic Scoring

`features/scoring` — LLM이 아니라 코드가 후보를 점수화한다. 6개 요소:

```
finalScore = clamp(
  0.35·GroupSatisfaction + 0.25·ExperiencePreservation
  + 0.15·SituationFitness + 0.15·TimeFitness
  − 0.10·TravelBurden − MinimumSatisfactionPenalty,
  0, 100
)
```

- **Minimum Satisfaction 안전장치** — 그룹 평균이 좋아 보여도 한 명의 참가자를
  희생시키는 후보는 벌점을 받는다.
- **Unknown ≠ 알 수 없음이 0점 비용이라는 뜻은 아니다** — 실제 이동 경로를 구하지
  못한 후보는 "이동 비용 0"이 아니라 "중립(50점)"으로 처리된다(STEP 13에서 수정 —
  자세한 내용은 `docs/scoring.md`).
- 점수 숫자는 **어떤 화면에도 노출되지 않는다.**

## 6. Re:Plan

`features/replan` — 사용자가 [Re:Plan]을 누르면:

1. **Preview** (읽기 전용) — 후보 생성 + 점수화를 재사용해 KEEP/REPLACE 제안을
   만든다. 후보가 "현재 유지"보다 최소 5점 이상 앞서야만 REPLACE가 제안된다.
2. 사용자가 **[이 계획 적용]**을 눌러야만 실제로 일정이 바뀐다. **[기존 일정
   유지]**는 아무것도 쓰지 않는다.
3. Apply는 클라이언트가 보낸 장소 데이터를 신뢰하지 않는다 — 서버가 fingerprint
   (일정 + 출발지)만 대조하고 결과를 처음부터 다시 계산해서 쓴다. 일정이나 출발지가
   Preview 때와 달라졌으면 409로 거부한다. 최종 쓰기는 Firestore 트랜잭션으로
   감싸 동시 수정 덮어쓰기를 막는다(외부 API 호출은 트랜잭션 밖에서 처리).

## 7. Trip Preference

Trip 생성 시 "이번 여행은 어떤 여행인가요?" 단계를 실제로 사용한 경우에만 그
8축 벡터가 저장된다 — 건드리지 않으면 `null`이며(과거 여행과 구분 없음), 이때는
참가자 개인 선호도의 평균(Experience Profile)이 대신 쓰인다. Trip Preference가
있으면 그것만 쓰이고 참가자 평균은 아예 조회되지 않는다.

## 8. Mini Guide

Trip Preference가 있을 때만 표시되는, 여행 시작 전 짧은 안내. 특정 장소를
추천하지 않고 "어떤 방식으로 즐기면 좋을지"만 짧게 안내한다. 숫자 점수나 축 값은
LLM에게 절대 전달되지 않는다(축 이름만 전달) — 표시 전용 콘텐츠라 실패 시 조용히
숨겨진다(자동 로드는 "자동 일정 변경 금지"와 무관 — 일정을 바꾸지 않으므로).

## 9. Mobility

`features/mobility` — 도보 🚶 / 자동차 🚗 / 대중교통 🚌 을 하나의
`MobilityOption` 모델로 관리한다. **이 프로젝트의 Kakao API 키는 자동차
길찾기(`/v1/directions`)만 접근 가능하다** — 도보/대중교통 통합 길찾기는 Kakao의
제휴 전용 API라 이 프로젝트에서 호출할 수 없다. 그래서 도보/대중교통은 항상
"제공 불가"로 정직하게 표시되며, 추정치를 실제 데이터처럼 보여주지 않는다.
자동차 경로는 실시간 교통 상태(원활/서행/지체/정체)와 실제 경로 지오메트리를
포함하며, 지도에 실제 route polyline으로 표시된다(가짜 직선 아님). Scoring이 이미
가져온 경로 데이터를 UI도 그대로 재사용한다 — 같은 후보에 대해 Kakao Mobility를
두 번 호출하지 않는다.

## 10. LLM의 역할

**LLM은 절대로 다음을 결정하지 않는다:** 후보 선택, 순위, 점수, Travel State,
교통/이동시간/이동거리 계산, 행사 진행 여부, 일정 변경 여부, Apply 여부. 이 모든
것은 결정론적 코드가 계산한 뒤 **이미 확정된 결과**만 LLM에게 넘겨 자연어로
설명하게 한다(`features/replan/explanation`, `features/miniGuide`). LLM 응답은
스키마 검증 + grounding 검사(사실이 아닌 숫자/구체적 정보 언급 시 거부)를 통과하지
못하면 결정론적 fallback 문구로 대체되며, 이 경로는 **절대 throw하지 않는다.**
Provider: OpenAI `gpt-4o-mini` (`lib/llm/openai.ts`), 프로젝트에서 LLM을 호출하는
유일한 지점 2곳(Re:Plan 설명, Mini Guide).

## 11. 사용 API

| API | 용도 | 상태 |
|---|---|---|
| 한국관광공사 TourAPI (국문 관광정보) | 관광지/문화시설/음식점 등 후보 데이터 | ✅ 실사용 |
| 한국관광공사 TourAPI (상세 정보) | 후보 설명·이미지·행사 기간 | ✅ 실사용 |
| 기상청 단기예보 | 날씨 위험도(Travel State, Situation Fitness) | ✅ 실사용 |
| Kakao Local | 장소 검색/좌표 교차검증 | ✅ 실사용 |
| Kakao Mobility (자동차 길찾기) | 이동 시간/거리/교통상태/경로 | ✅ 실사용 |
| Kakao Mobility (도보/대중교통) | — | ❌ 이 프로젝트 계정으로 접근 불가 (제휴 전용) |
| 한국관광공사 지역별 방문자수(빅데이터) | — | 🟡 어댑터는 있으나 Re:Plan 판단에 미사용 |
| 한국관광공사 무장애 여행 정보 | — | 🟡 어댑터는 있으나 Re:Plan 판단에 미사용 (선호도 축 자체가 없음) |
| OpenAI (`gpt-4o-mini`) | 결정된 결과의 자연어 설명 | ✅ 실사용 |

## 12. Architecture

```
app/          Next.js App Router 라우트 + API Route Handlers
components/   프레젠테이션 컴포넌트
features/     도메인 로직 — 서로/UI와 독립적
  trip/  participant/  experience/  travel-state/
  candidate/  scoring/  replan/  miniGuide/  mobility/
lib/          외부 서비스 어댑터 (server-only) — 외부 응답 → Re:Trip 도메인 모델
  api/tour/  api/weather/  api/kakao/  firebase/  llm/  rateLimit.ts
types/        공유 도메인 타입
config/       env.ts (env 접근 경계)
tests/        Vitest — hermetic + live(`*.firestore.test.ts`, `*.smoke.test.ts`)
```

**규칙**
- 외부 API 호출은 `lib/*`나 feature 모듈에만 존재한다 — 페이지에서 직접 호출하지 않는다.
- 엔진(Travel State, Scoring, Re:Plan 도메인 로직)은 순수 함수: `입력 → 계산 → 출력`.
- 클라이언트가 보낸 place/score 데이터는 Apply 시 신뢰하지 않는다 — 서버가 재계산한다.
- `process.env` 접근은 전부 `config/env.ts`를 거친다.

**접근 제어 / 남용 방지** — 이 프로젝트는 공모전 MVP로, 별도의 로그인 시스템이
없다. 여행 링크(`tripId`, 8자 무작위 문자열)를 아는 사람은 그 여행을 열람·수정할
수 있는 "capability URL" 모델이다 — 링크를 공유한 사람만 접근한다는 전제. 비용이
발생하는 라우트(Re:Plan Preview/Apply, Mini Guide, 장소 검색)에는 요청당 최소
쿨다운 기반 rate limiting이 적용되어 있다(`lib/rateLimit.ts` — 프로세스 로컬
메모리 기반, 다중 인스턴스 배포 시 인스턴스별로만 유효; 실제 남용이 확인되면
공유 스토어로 교체).

## 13. Limitations

**실제 구현되어 정상 동작:** TourAPI, KMA, Kakao Local, Kakao Mobility(자동차),
Firebase, LLM 설명, 결정론적 스코어링, Re:Plan Preview/Apply, 실제 이동 정보 표시.

**현재 제한:**
- GPS 상시 추적 없음 — Re:Plan의 출발지는 사용자가 그때그때 명시적으로 선택한다
  (마지막 완료 장소 또는 직접 검색). 서버에 위치를 영구 저장하지 않는다.
- `experienceDeviation`(방문 완료 여부 기반 이탈도)은 실제 방문 추적 인프라가
  없어 항상 `null` — 억지로 추정하지 않는다.
- 도보/대중교통 이동 정보는 이 프로젝트의 Kakao API 권한으로 제공 불가.
- 지역별 방문자수는 KT/SKT 통신 데이터 기반 **일별 집계**이며, 실시간 현장
  인원과 다르다. Re:Plan 판단에는 쓰이지 않는다.
- 무장애(barrier-free) 데이터는 어댑터만 존재하고 실제 판단 파이프라인에는
  연결되어 있지 않다(선호도 축 자체가 없음).
- 접근 제어는 "링크를 아는 사람은 수정 가능" 모델이다 — 별도 로그인/권한 시스템
  없음(위 12번 참고).

## Tech Stack

- **Next.js 16** (App Router) + **React 19**
- **TypeScript** (strict)
- **Tailwind CSS v4**
- **Firebase** (client SDK) / **firebase-admin** (server SDK)
- **ESLint** (`eslint-config-next`)
- **Vitest** (unit tests)

## Environment Variables

Copy `.env.example` → `.env.local` and fill in values. `.env.local` is
git-ignored and must never be committed.

- `NEXT_PUBLIC_FIREBASE_*` — client Firebase config. Shipped to the browser
  (project identifiers, not secrets; still gated by Firestore Security Rules).
- `FIREBASE_SERVICE_ACCOUNT_KEY` — Admin SDK service account JSON. **Server only.**
- `TOUR_API_KEY_MAIN/VISITOR/ACCESSIBILITY`, `WEATHER_API_KEY` — data.go.kr가
  발급하는 한 개의 서비스 키를 그대로 붙여넣으면 됨 (server-only).
- `KAKAO_API_KEY` — Kakao Local + Mobility REST 키 (server-only).
- `LLM_API_KEY` — OpenAI API 키 (server-only).

## Local Development

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev                  # http://localhost:3000

npm run lint
npm run typecheck
npm run test
npm run build
```

Live integration tests (hit real Firebase/TourAPI/Kakao/LLM):

```bash
node --env-file=.env.local ./node_modules/.bin/vitest run tests/*.firestore.test.ts tests/*.smoke.test.ts
```
