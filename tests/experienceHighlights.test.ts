import { describe, expect, it } from "vitest";

import { topExperienceHighlights } from "@/features/replan/experienceHighlights";
import type { ExperienceProfile } from "@/types";

const neutral: ExperienceProfile = {
  nature: 5,
  culture: 5,
  food: 5,
  cafe: 5,
  shopping: 5,
  activity: 5,
  photo: 5,
  relax: 5,
};

describe("topExperienceHighlights (STEP 21)", () => {
  it("returns [] for null (no fabricated 'what you care about')", () => {
    expect(topExperienceHighlights(null)).toEqual([]);
  });

  it("returns [] for an all-neutral profile — nothing distinctive to preserve", () => {
    expect(topExperienceHighlights(neutral)).toEqual([]);
  });

  it("returns above-neutral axes, highest first, capped at max", () => {
    const profile: ExperienceProfile = { ...neutral, nature: 9, photo: 7, relax: 8, culture: 6 };
    const top = topExperienceHighlights(profile, 3);
    expect(top.map((h) => h.key)).toEqual(["nature", "relax", "photo"]);
    expect(top[0].label).toBe("자연");
  });

  it("never includes an axis at or below neutral", () => {
    const profile: ExperienceProfile = { ...neutral, nature: 5, culture: 4, food: 9 };
    const top = topExperienceHighlights(profile);
    expect(top.map((h) => h.key)).toEqual(["food"]);
  });
});
