# Deterministic Scoring (STEP 9)

`features/scoring/` — see `scoring.ts` for the implementation; this is a short
reference, not a duplicate of the code comments.

## Purpose

STEP 8 (Candidate Generation) answers *"which real places could replace this
FLEXIBLE slot?"*. This answers *"which of those — including doing nothing —
best fits this group, right now?"*. It is a ranking, not a recommendation UI
and not Re:Plan: nothing here changes the itinerary. LLM explanation of *why*
a candidate ranks where it does is a later step; this step is numbers and
structure only.

## The six components (0..100 each, except the two negatives)

| Component | Question it answers | Data source |
|---|---|---|
| Group Satisfaction | Do individual participants like this? | STEP 5 preference vectors |
| Experience Preservation | Does this serve what the group *distinctively* cares about? | STEP 6 Experience Profile |
| Situation Fitness | Does this suit today's real weather/traffic situation? | STEP 7 Travel State |
| Time Fitness | Is there realistically enough time to get there? | real Kakao Mobility duration |
| Travel Burden *(negative)* | Real cost of getting there | real Kakao Mobility duration |
| Minimum Satisfaction Penalty *(negative)* | Is one participant being sacrificed for the average? | Group Satisfaction's per-participant scores |

`finalScore = clamp(0.35·GS + 0.25·EP + 0.15·SF + 0.15·TF − 0.10·TB − penalty, 0, 100)`

Positive weights sum to **0.90** — the theoretical best case is 90, not 100;
`travelBurden`'s 10-point slot is a subtraction-only budget. See
`SCORING_WEIGHTS` and the budget test in `tests/scoring.test.ts`.

## Why Group Satisfaction ≠ Experience Preservation

Both compare a preference-shaped vector against a candidate's category. The
difference is the anchor: Group Satisfaction measures each preference against
the **fixed scale neutral** (`PREFERENCE_NEUTRAL = 5`) — "does this person
like this in absolute terms". Experience Preservation measures the group's
Experience Profile against **its own mean across all 8 axes** — "is this
distinctively what this group is about, relative to everything else they also
somewhat like". Different anchors, different score ranges → not the same
number (verified by a dedicated test).

## Minimum Satisfaction safeguard

Individual scores are computed **before** any aggregate. A candidate whose
group average looks fine but sacrifices one participant is penalized:

```
minimumSatisfactionPenalty = max(0, MIN_SATISFACTION_THRESHOLD − min(participantScores)) × MIN_SATISFACTION_PENALTY_WEIGHT
```

`MIN_SATISFACTION_THRESHOLD = 60`, `MIN_SATISFACTION_PENALTY_WEIGHT = 1.5`.
Worked example: `[95, 95, 30]` (avg 73.3) scores far below `[82, 81, 76]`
(avg 79.7) once the penalty is applied, even though the raw averages are
close — see `tests/scoring.test.ts` §C.

## Unknown data policy

- Every component — two-sided (Group Satisfaction, Experience Preservation) or
  the one-sided cost (Travel Burden) — degrades to `null` in the breakdown
  (kept for transparency/debugging) but to `NEUTRAL_COMPONENT_SCORE` (50) when
  folded into `finalScore`. **STEP 13 fix:** Travel Burden used to fall back to
  0 ("no evidenced cost"), but 0 is the *best possible* travel-burden score —
  an unmeasured route was silently winning that component outright over every
  candidate whose route actually got measured. "Unknown" must never score
  better than "known and cheap"; see `tests/scoring.test.ts`'s "Unknown Travel
  Burden" block for the worked comparison.
- Situation Fitness and Time Fitness never return `null` — they're designed to
  degrade to `NEUTRAL_COMPONENT_SCORE` internally the moment their real input
  (weather/traffic risk, route duration) is missing or `"unknown"`.
- Nothing here ever substitutes a guessed weather condition, traffic level,
  route duration, or opening hour. Visitor-count data and barrier-free data
  are not used in scoring (no accessibility axis exists on the participant
  model yet; visitor counts are daily aggregates, never "how busy is it now").

## Keep Current

`itemToCandidateView(item)` turns the itinerary's own item into a
`CandidatePlace`-shaped input (`category: null` — never inferred) and scores
it through the exact same pipeline. It is never written into
`SlotCandidates.candidates` (STEP 8's contract); it is only ever compared
alongside real candidates in STEP 9's own `RankedOption[]`.

## Determinism

No `Date.now()`, no `Math.random()`, no fetch, no Firestore inside
`scoring.ts` (enforced by a source-scan test). Same input → same
`ScoreBreakdown` → same ranking, always. Ties break: `finalScore` desc →
`travelBurden` asc → `placeId` asc (missing last) → `placeName` asc.
