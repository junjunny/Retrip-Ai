import { describe, expect, it } from "vitest";

import {
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

  it("rejects out-of-range and non-integer preference values", () => {
    expect(
      validateJoinInput(base({ preferences: { ...defaultPreferenceVector(), nature: 0 } })),
    ).toContain('"자연" 선호도는 1~5 사이 값이어야 합니다.');
    expect(
      validateJoinInput(base({ preferences: { ...defaultPreferenceVector(), nature: 6 } })),
    ).toContain('"자연" 선호도는 1~5 사이 값이어야 합니다.');
    expect(
      validateJoinInput(base({ preferences: { ...defaultPreferenceVector(), nature: 3.5 } })),
    ).toContain('"자연" 선호도는 1~5 사이 값이어야 합니다.');
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
