# Re:Trip AI

> "Your Plan Can Change. Your Trip Doesn't Have To."

Entry for the 2026 관광데이터 활용 공모전 (web/app implementation track).

## Overview

Re:Trip AI is an AI travel co-pilot. During a trip it folds live variables —
weather, traffic, crowding — into a single **Travel State**, judges how far the
trip has drifted from the experience the group originally intended, and then
re-designs the itinerary around the group's preferences and current situation.

## Core Concept

It is not a "recommend a tourist spot" service. The planned pipeline:

```
trip itinerary
  → group preferences
  → tourism data
  → weather
  → traffic
  → Travel State Engine
  → intervention decision
  → Re:Plan Engine
  → best alternative selection
  → LLM explanation
```

Each stage is delivered in its own phase (see below). None of the pipeline logic
exists yet — Phase 0 only establishes the architecture.

## Tech Stack

- **Next.js 16** (App Router) + **React 19**
- **TypeScript** (strict)
- **Tailwind CSS v4**
- **Firebase** (client SDK) / **firebase-admin** (server SDK)
- **ESLint** (`eslint-config-next`)
- **Vitest** (unit tests)

## Project Structure

```
app/          Next.js routes + API Route Handlers
  api/        Browser → Route Handler → external API (keeps secrets server-side)
  trip/       /trip route (Phase 1)
components/
  ui/         Reusable presentational components
features/     Domain logic, decoupled from UI and from each other
  trip/  experience/  travel-state/  replan/
lib/          External-service / infra adapters (no API calls from components)
  firebase/   client.ts (browser)  ·  admin.ts (server-only)
  tourapi/  weather/  kakao/  llm/
types/        Shared domain types (Trip, Participant, Preference, …)
config/       env.ts (env access boundary)  ·  app.ts (static config)
tests/        Vitest specs — engine tests land here
public/       Static assets
```

**Rules**

- External API calls live in `lib/*` or a feature module — never in a page.
- Engines (Travel State, Re:Plan) are pure functions: `input → calculation → output`.
- All `process.env` access goes through `config/env.ts`.
- No `any`.

## Environment Variables

Copy `.env.example` → `.env.local` and fill in values. `.env.local` is
git-ignored and must never be committed.

- `NEXT_PUBLIC_FIREBASE_*` — client Firebase config. Shipped to the browser
  (project identifiers, not secrets; still gated by Firestore Security Rules).
- `FIREBASE_SERVICE_ACCOUNT_KEY` — Admin SDK service account JSON. **Server only.**
- `TOUR_API_KEY`, `WEATHER_API_KEY`, `KAKAO_API_KEY`, `LLM_API_KEY` — server-side
  keys, used only inside `app/api/*` Route Handlers. Never `NEXT_PUBLIC_`.

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

## Development Phases

| Phase | Scope |
| ----- | ----- |
| 0 | Architecture — env, folder structure, Firebase init, API skeleton, types, tests, green build |
| 1 | Trip |
| 2 | Group Preference |
| 3 | TourAPI |
| 4 | Experience Profile |
| 5 | Weather |
| 6 | Kakao Route |
| 7 | Travel State Engine |
| 8 | Re:Plan Engine |
| 9 | LLM |
| 10 | Result UX |
| 11 | Demo Mode |
| 12 | Deployment & QA |

**Current phase: 2 — complete.** (0 architecture, 1 trip + itinerary, 2 login-less
group preference collection.)
