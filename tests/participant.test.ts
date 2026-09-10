import { describe, expect, it } from "vitest";

import {
  PREFERENCE_KEYS,
  PREFERENCE_LABELS,
  PREFERENCE_NEUTRAL,
  PREFERENCE_SCALE_HINTS,
  defaultPreferenceVector,
  validateJoinInput,
  type JoinInput,
} from "@/features/participant/participant";

const base = (over: Partial<JoinInput> = {}): Partial<JoinInput> => ({
  nickname: "준희",
  preferences: defaultPreferenceVector(),
  pace: "normal",
  indoorOutdoor: "balanced",
  ...over,
});

describe("validateJoinInput", () => {
  it("accepts a complete valid input", () => {
    expect(validateJoinInput(base())).toEqual([]);
  });

  it("rejects an empty nickname", () => {
    expect(validateJoinInput(base({ nickname: "  " }))).toContain(
      "닉네임을 입력해주세요.",
    );
  });

  it("rejects an over-long nickname", () => {
    expect(validateJoinInput(base({ nickname: "가".repeat(21) }))).toContain(
      "닉네임은 20자 이하로 입력해주세요.",
    );
  });

  it("rejects a missing preference key", () => {
    const prefs = defaultPreferenceVector();
    delete (prefs as Record<string, unknown>).food;
    const errors = validateJoinInput(base({ preferences: prefs }));
    expect(errors.some((e) => e.includes("맛집"))).toBe(true);
  });

  it("rejects out-of-range and non-integer preference values (1~10 scale)", () => {
    expect(
      validateJoinInput(base({ preferences: { ...defaultPreferenceVector(), nature: 0 } })),
    ).toContain('"자연" 선호도는 1~10 사이 값이어야 합니다.');
    expect(
      validateJoinInput(base({ preferences: { ...defaultPreferenceVector(), nature: 11 } })),
    ).toContain('"자연" 선호도는 1~10 사이 값이어야 합니다.');
    expect(
      validateJoinInput(base({ preferences: { ...defaultPreferenceVector(), nature: 7.5 } })),
    ).toContain('"자연" 선호도는 1~10 사이 값이어야 합니다.');
    // 6..10 are now valid
    expect(
      validateJoinInput(base({ preferences: { ...defaultPreferenceVector(), nature: 8 } })),
    ).toEqual([]);
  });

  it("rejects an invalid pace / indoorOutdoor", () => {
    expect(validateJoinInput(base({ pace: "sprint" as never }))).toContain(
      "여행 속도를 선택해주세요.",
    );
    expect(
      validateJoinInput(base({ indoorOutdoor: "cave" as never })),
    ).toContain("실내/야외 선호를 선택해주세요.");
  });

  it("rejects empty preferences object", () => {
    expect(
      validateJoinInput({ nickname: "준희", pace: "normal", indoorOutdoor: "balanced" }),
    ).not.toEqual([]);
  });
});

describe("preference categories (STEP 5)", () => {
  it("has the 8 categories, in order", () => {
    expect([...PREFERENCE_KEYS]).toEqual([
      "nature",
      "culture",
      "food",
      "cafe",
      "shopping",
      "activity",
      "photo",
      "relax",
    ]);
  });

  it("every key has a Korean label", () => {
    for (const k of PREFERENCE_KEYS) {
      expect(typeof PREFERENCE_LABELS[k]).toBe("string");
      expect(PREFERENCE_LABELS[k].length).toBeGreaterThan(0);
    }
    expect(PREFERENCE_LABELS.cafe).toBe("카페");
    expect(PREFERENCE_LABELS.photo).toBe("사진");
  });

  it("default vector is every axis at the neutral value (보통) on the 1~10 scale", () => {
    const v = defaultPreferenceVector();
    expect(Object.keys(v).sort()).toEqual([...PREFERENCE_KEYS].sort());
    expect(Object.values(v).every((n) => n === PREFERENCE_NEUTRAL)).toBe(true);
    expect(PREFERENCE_NEUTRAL).toBe(5);
    expect(PREFERENCE_SCALE_HINTS[1]).toBe("전혀 중요하지 않음");
    expect(PREFERENCE_SCALE_HINTS[5]).toBe("보통");
    expect(PREFERENCE_SCALE_HINTS[10]).toBe("매우 중요함");
  });

  it("validateJoinInput accepts a full 8-axis vector and rejects a missing one", () => {
    expect(
      validateJoinInput({
        nickname: "준희",
        preferences: defaultPreferenceVector(),
        pace: "normal",
        indoorOutdoor: "balanced",
      }),
    ).toEqual([]);
    const missing = { ...defaultPreferenceVector() } as Record<string, number>;
    delete missing.cafe;
    expect(
      validateJoinInput({
        nickname: "준희",
        preferences: missing as never,
        pace: "normal",
        indoorOutdoor: "balanced",
      }).some((e) => e.includes("카페")),
    ).toBe(true);
  });
});
