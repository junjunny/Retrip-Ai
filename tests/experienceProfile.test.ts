/**
 * STEP 6 — buildExperienceProfile (pure, hermetic). No Firestore, no network.
 */
import { describe, expect, it } from "vitest";

import { buildExperienceProfile } from "@/features/experience";
import {
  PREFERENCE_KEYS,
  PREFERENCE_MAX,
  PREFERENCE_MIN,
  PREFERENCE_NEUTRAL,
  defaultPreferenceVector,
} from "@/features/participant/participant";
import type { PreferenceKey, PreferenceVector } from "@/types";

const vec = (over: Partial<Record<PreferenceKey, number>> = {}): PreferenceVector => ({
  ...defaultPreferenceVector(),
  ...over,
});

describe("buildExperienceProfile", () => {
  it("TEST 1 — 0 participants → null (no fabricated profile)", () => {
    expect(buildExperienceProfile([])).toBeNull();
  });

  it("TEST 2 — 1 participant → that participant's vector", () => {
    const p = vec({ nature: 10, food: 2, photo: 9 });
    expect(buildExperienceProfile([p])).toEqual(p);
  });

  it("TEST 3 — 2 participants → per-axis mean", () => {
    const profile = buildExperienceProfile([
      vec({ nature: 10, food: 4 }),
      vec({ nature: 4, food: 10 }),
    ]);
    expect(profile!.nature).toBe(7);
    expect(profile!.food).toBe(7);
    // untouched axes stay at the neutral default
    expect(profile!.relax).toBe(PREFERENCE_NEUTRAL);
  });

  it("TEST 4 — 3 participants, integer mean", () => {
    const profile = buildExperienceProfile([
      vec({ nature: 1 }),
      vec({ nature: 3 }),
      vec({ nature: 5 }),
    ]);
    expect(profile!.nature).toBe(3);
  });

  it("TEST 5 — fractional mean is rounded to 2 dp", () => {
    const profile = buildExperienceProfile([
      vec({ nature: 1 }),
      vec({ nature: 2 }),
      vec({ nature: 4 }),
    ]);
    expect(profile!.nature).toBe(2.33); // 7 / 3 = 2.3333…
  });

  it("TEST 6 — all 8 axes are computed", () => {
    const profile = buildExperienceProfile([
      vec({ nature: 2, culture: 4, food: 6, cafe: 8, shopping: 10, activity: 1, photo: 3, relax: 5 }),
      vec({ nature: 4, culture: 6, food: 8, cafe: 10, shopping: 2, activity: 3, photo: 5, relax: 7 }),
    ]);
    expect(Object.keys(profile!).sort()).toEqual([...PREFERENCE_KEYS].sort());
    expect(profile).toEqual({
      nature: 3, culture: 5, food: 7, cafe: 9, shopping: 6, activity: 2, photo: 4, relax: 6,
    });
  });

  it("TEST 7 — mean stays correct as the group grows", () => {
    const many = Array.from({ length: 7 }, (_, i) => vec({ food: i + 1 })); // 1..7
    expect(buildExperienceProfile(many)!.food).toBe(4); // (1+…+7)/7
  });

  it("TEST 8 — legacy 6-axis vector: missing cafe/photo count as neutral", () => {
    const legacy = { nature: 8, culture: 2, food: 6, shopping: 4, activity: 5, relax: 3 };
    const profile = buildExperienceProfile([legacy, vec({ nature: 2 })]);
    expect(profile!.nature).toBe(5); // (8 + 2) / 2
    expect(profile!.cafe).toBe(PREFERENCE_NEUTRAL); // (5 + 5) / 2
    expect(profile!.photo).toBe(PREFERENCE_NEUTRAL);
  });

  it("TEST 9 — order of participants does not change the result", () => {
    const a = vec({ nature: 1, food: 9 });
    const b = vec({ nature: 7, food: 3 });
    const c = vec({ nature: 4, food: 6 });
    expect(buildExperienceProfile([a, b, c])).toEqual(buildExperienceProfile([c, a, b]));
    expect(buildExperienceProfile([a, b, c])).toEqual(buildExperienceProfile([b, c, a]));
  });

  it("TEST 10 — out-of-range / non-numeric values are clamped, not trusted blindly", () => {
    const junk = { ...vec(), nature: 99, food: -4, cafe: NaN, photo: "5" as unknown as number };
    const profile = buildExperienceProfile([junk]);
    expect(profile!.nature).toBe(PREFERENCE_MAX); // 99 → 10
    expect(profile!.food).toBe(PREFERENCE_MIN); // -4 → 1
    expect(profile!.cafe).toBe(PREFERENCE_NEUTRAL); // NaN → 5
    expect(profile!.photo).toBe(5); // "5" → 5
  });
});

describe("buildExperienceProfile — invariants", () => {
  const groups: PreferenceVector[][] = [
    [vec({ nature: 1, food: 10 })],
    [vec({ nature: 5 }), vec({ nature: 5 })],
    [vec({ nature: 1 }), vec({ nature: 2 }), vec({ nature: 9 }), vec({ food: 7 })],
  ];

  it("is deterministic — same input, same output", () => {
    for (const g of groups) {
      expect(buildExperienceProfile(g)).toEqual(buildExperienceProfile(g));
    }
  });

  it("is commutative — [A, B] equals [B, A]", () => {
    const a = vec({ nature: 2, cafe: 8 });
    const b = vec({ nature: 8, cafe: 2 });
    expect(buildExperienceProfile([a, b])).toEqual(buildExperienceProfile([b, a]));
  });

  it("every axis is within [PREFERENCE_MIN, PREFERENCE_MAX]", () => {
    for (const g of groups) {
      const profile = buildExperienceProfile(g)!;
      for (const k of PREFERENCE_KEYS) {
        expect(profile[k]).toBeGreaterThanOrEqual(PREFERENCE_MIN);
        expect(profile[k]).toBeLessThanOrEqual(PREFERENCE_MAX);
      }
    }
  });

  it("if every participant scores an axis at MAX, the group is MAX (and same for MIN)", () => {
    const hi = buildExperienceProfile([vec({ nature: PREFERENCE_MAX }), vec({ nature: PREFERENCE_MAX })])!;
    expect(hi.nature).toBe(PREFERENCE_MAX);
    const lo = buildExperienceProfile([vec({ nature: PREFERENCE_MIN }), vec({ nature: PREFERENCE_MIN }), vec({ nature: PREFERENCE_MIN })])!;
    expect(lo.nature).toBe(PREFERENCE_MIN);
  });
});
