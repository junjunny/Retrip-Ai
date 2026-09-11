# StyleSeed — Design Lock
<!-- Selections persist here. This file cannot waive StyleSeed core invariants. -->
- App domain: booking
- Surface: mobile-app
- Surface adapter: product-ui
- Page type: detail
- Output grammar: consumer-service
- Grammar path: built-in:engine/RULESETS.md
- Grammar fallback: consumer-service
- Reference confidence: n/a
- Brand recipe: calm-consumer
- Palette recipe: quiet-mineral
- Key color: #276B5E
- Palette character: calm
- Palette mode: light
- Palette harmony: adjacent
- Surface temperature: warm
- Aesthetic profile: none
- Skin: custom
- Primary action: #276B5E
- Font: Pretendard
- Radius: soft
- Elevation: light=tonal grouping + restrained shadow
- Density: comfortable
- Motion: silk restrained
- Imagery/data role: place photos lead the Re:Plan candidate card; the map is the spatial anchor; no numeric scores are ever surfaced to the user
- Signature move: one calm "이번 여행" contextual line (Mini Guide) that never outweighs the itinerary it sits beside
- Locked: 2026-09-11

## Field notes (not parsed by the resolver — context for the choices above)

- **Page type**: `detail` is the primary lock — the trip detail screen is the core product
  surface (STEP 13 spec). `/trip/create` reads as a `form` page and the place-confirm / Re:Plan
  preview surfaces read as sheets/modals; apply `detail`'s hierarchy discipline to all of them
  (one subject, one primary action, metadata stays tertiary) rather than re-resolving a second lock.
- **Surface**: responsive web, mobile-first (~390px primary target), secondary tablet/desktop.
- **Surface temperature**: `warm`, matching quiet-mineral's warm-neutral canvas (not cool/clinical).
- **Radius**: soft (12–20px outer per calm-consumer, smaller nested radius).
- **Font**: Pretendard (Korean-first product), system sans fallback stack for non-Korean text.

## Why these choices (not defaults)

- **calm-consumer over booking's suggested commerce-operator**: Re:Trip never asks the user
  to pay, book, or confirm a reservation — its one recurring decision is "keep this place, or
  apply the recommended one?", which is a *state + one action* pattern, not a purchase funnel.
  calm-consumer's own reject list ("every service as a rounded card", "chips as decoration",
  "blue as an automatic brand") is a direct match for STEP 14's explicit anti-patterns.
- **quiet-mineral over civic-blue/warm-clay-commerce**: civic-blue reads institutional/bureaucratic
  (wrong feeling for a personal trip); warm-clay-commerce's usage note frames its clay tone around
  "purchase intent", which doesn't exist here. quiet-mineral's green primary + coral accent read as
  "travel/nature/warmth" without borrowing any AI-app color cliché.
- **Motion: silk restrained**: booking domain's own motion guidance calls for "Float/Silk — smooth,
  reassuring transitions between steps... confidence, not flash." Silk (smooth, continuous) reads
  more "reassuring during a plan change" than Float (which leans lighter/playful); `restrained`
  keeps every transition subtle — the `[Re:Plan]` button itself must never animate by state
  regardless of the seed chosen.
- **No aesthetic profile**: `swiss`/`editorial`/`technical`/`minimal-mono`/`brutalist-lite` would each
  push toward a colder or more graphic-design-forward look than "calm and trustworthy" calls for;
  `warm-dtc` was considered but calm-consumer + quiet-mineral already deliver its warmth without an
  extra layer of rules to reconcile.

## Product-specific rules this lock must never override

These come from the product owner's own architecture constraints (STEP 0–13), not from
StyleSeed's method — no visual restyle may violate them:

- The `[Re:Plan]` button is a single, always-identical CTA: no color/size/animation change based
  on internal Travel State, no pulsing, no badge, no "something changed" indicator.
- No score, weight, or internal risk level is ever shown to the user — words and real numbers
  (time, distance, address) only, never a 0–100 value.
- Walk/transit mobility rows show an honest "제공 불가/불러올 수 없음" message, never an invented number.
- Mini Guide is secondary supporting content beside the itinerary — never a hero section, never
  a dashboard.
