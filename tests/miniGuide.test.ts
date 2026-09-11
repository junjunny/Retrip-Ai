/**
 * STEP 12 — Mini Guide (hermetic). No network: the LLM call is always
 * injected via `options.llmCall`, never the real OpenAI adapter.
 */
import { describe, expect, it } from "vitest";

import {
  MINI_GUIDE_SECONDARY_THRESHOLD,
  MINI_GUIDE_TOP_THRESHOLD,
  buildFallbackMiniGuide,
  buildMiniGuideFacts,
  isMiniGuideGrounded,
  isValidMiniGuide,
  type MiniGuide,
} from "@/features/miniGuide";
import { generateMiniGuide } from "@/features/miniGuide/miniGuideService";
import { defaultPreferenceVector } from "@/features/participant/participant";
import type { ExperienceProfile } from "@/types";

const profile = (over: Partial<ExperienceProfile> = {}): ExperienceProfile => ({
  ...defaultPreferenceVector(),
  ...over,
});

const validGuide = (): MiniGuide => ({
  headline: "자연 중심으로 즐겨보세요",
  tips: ["풍경을 즐길 시간을 넉넉히 확보해보세요."],
});

// ===========================================================================
// 1/2. facts: deterministic, top-preference ordering
// ===========================================================================
describe("buildMiniGuideFacts", () => {
  it("axes at/above the top threshold are ranked highest-first", () => {
    const p = profile({ nature: 10, photo: 9, relax: 8 });
    const facts = buildMiniGuideFacts(p);
    expect(facts.topPreferenceLabels).toEqual(["자연", "사진", "휴식"]);
    expect(facts.isBalanced).toBe(false);
  });

  it("ties break by the canonical PREFERENCE_KEYS order, deterministically", () => {
    const p = profile({ nature: 9, culture: 9, relax: 9 });
    const facts = buildMiniGuideFacts(p);
    expect(facts.topPreferenceLabels).toEqual(["자연", "문화", "휴식"]); // nature < culture < relax in PREFERENCE_KEYS
  });

  it("secondary band is separate from top", () => {
    const p = profile({ nature: 9, cafe: MINI_GUIDE_SECONDARY_THRESHOLD });
    const facts = buildMiniGuideFacts(p);
    expect(facts.topPreferenceLabels).toEqual(["자연"]);
    expect(facts.secondaryPreferenceLabels).toEqual(["카페"]);
  });

  it("boundary: exactly at MINI_GUIDE_TOP_THRESHOLD counts as top, one below does not", () => {
    const atTop = buildMiniGuideFacts(profile({ nature: MINI_GUIDE_TOP_THRESHOLD }));
    expect(atTop.topPreferenceLabels).toEqual(["자연"]);
    const belowTop = buildMiniGuideFacts(profile({ nature: MINI_GUIDE_TOP_THRESHOLD - 1 }));
    expect(belowTop.topPreferenceLabels).toEqual([]);
  });

  it("3. an all-neutral (default) profile -> isBalanced, no fabricated top preference", () => {
    const facts = buildMiniGuideFacts(defaultPreferenceVector());
    expect(facts.isBalanced).toBe(true);
    expect(facts.topPreferenceLabels).toEqual([]);
    expect(facts.secondaryPreferenceLabels).toEqual([]);
  });

  it("is deterministic: same profile -> same facts", () => {
    const p = profile({ food: 9, cafe: 7 });
    expect(buildMiniGuideFacts(p)).toEqual(buildMiniGuideFacts(p));
  });
});

// ===========================================================================
// Fallback + grounding
// ===========================================================================
describe("buildFallbackMiniGuide", () => {
  it("names only the axes facts actually called out, never an unmentioned one", () => {
    const facts = buildMiniGuideFacts(profile({ nature: 10 }));
    const guide = buildFallbackMiniGuide(facts);
    expect(guide.headline).toContain("자연");
    expect(guide.headline).not.toMatch(/쇼핑|액티비티/);
  });

  it("a balanced profile gets a generic, non-claiming guide", () => {
    const facts = buildMiniGuideFacts(defaultPreferenceVector());
    const guide = buildFallbackMiniGuide(facts);
    expect(isValidMiniGuide(guide)).toBe(true);
    expect(isMiniGuideGrounded(guide, facts)).toBe(true);
  });

  it("is always schema-valid and self-grounded", () => {
    for (const p of [profile({ nature: 10, photo: 9 }), profile({ shopping: 10 }), defaultPreferenceVector()]) {
      const facts = buildMiniGuideFacts(p);
      const guide = buildFallbackMiniGuide(facts);
      expect(isValidMiniGuide(guide)).toBe(true);
      expect(isMiniGuideGrounded(guide, facts)).toBe(true);
    }
  });
});

describe("schema validation + grounding", () => {
  it("accepts a well-formed guide", () => {
    expect(isValidMiniGuide(validGuide())).toBe(true);
  });

  it("rejects malformed shapes", () => {
    expect(isValidMiniGuide(null)).toBe(false);
    expect(isValidMiniGuide({ headline: "", tips: [] })).toBe(false);
    expect(isValidMiniGuide({ headline: "x", tips: "not an array" })).toBe(false);
    expect(isValidMiniGuide({ ...validGuide(), tips: Array(10).fill("x") })).toBe(false);
  });

  it("6. rejects a raw numeric score leaking into prose", () => {
    const facts = buildMiniGuideFacts(profile({ nature: 9 }));
    expect(isMiniGuideGrounded({ headline: "자연 9점 중심", tips: [] }, facts)).toBe(false);
  });

  it("7. rejects a guide that claims a preference axis this profile never called out", () => {
    const facts = buildMiniGuideFacts(profile({ nature: 10 })); // only 자연 is top
    const claimsUnrelated: MiniGuide = { headline: "쇼핑 중심으로 즐겨보세요", tips: [] };
    expect(isMiniGuideGrounded(claimsUnrelated, facts)).toBe(false);
  });

  it("a balanced profile's guide is never rejected for not naming a specific axis", () => {
    const facts = buildMiniGuideFacts(defaultPreferenceVector());
    expect(isMiniGuideGrounded({ headline: "마음 가는 대로 즐겨보세요", tips: [] }, facts)).toBe(true);
  });
});

// ===========================================================================
// 4/5. LLM success / failure fallback
// ===========================================================================
describe("generateMiniGuide", () => {
  it("4. a valid, grounded LLM response is passed through", async () => {
    const p = profile({ nature: 10 });
    const good: MiniGuide = { headline: "자연 중심으로 즐겨보세요", tips: ["여유를 가져보세요."] };
    const result = await generateMiniGuide(p, { llmCall: async () => JSON.stringify(good) });
    expect(result).toEqual(good);
  });

  it("5. LLM throw/timeout -> deterministic fallback, never throws", async () => {
    const p = profile({ nature: 10 });
    const result = await generateMiniGuide(p, {
      llmCall: async () => {
        throw new Error("timeout");
      },
    });
    expect(isValidMiniGuide(result)).toBe(true);
  });

  it("invalid JSON -> fallback", async () => {
    const result = await generateMiniGuide(profile({ cafe: 9 }), { llmCall: async () => "not json {{" });
    expect(isValidMiniGuide(result)).toBe(true);
  });

  it("schema-invalid JSON -> fallback", async () => {
    const result = await generateMiniGuide(profile({ cafe: 9 }), { llmCall: async () => JSON.stringify({ foo: "bar" }) });
    expect(isValidMiniGuide(result)).toBe(true);
  });

  it("ungrounded (claims an axis not in facts) -> fallback, not passed through", async () => {
    const result = await generateMiniGuide(profile({ nature: 10 }), {
      llmCall: async () => JSON.stringify({ headline: "쇼핑 중심으로 즐겨보세요", tips: [] }),
    });
    expect(result.headline).not.toContain("쇼핑");
  });
});
