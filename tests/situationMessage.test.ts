import { describe, expect, it } from "vitest";

import { buildSituationMessage } from "@/features/travel-state/situationMessage";

describe("buildSituationMessage (STEP 18)", () => {
  it("returns a weather line when weatherRisk is high, regardless of traffic", () => {
    expect(buildSituationMessage("high", "low")).toEqual({
      line: "갑작스러운 날씨 변화로 지금 일정의 경험이 달라질 수 있어요.",
    });
    expect(buildSituationMessage("high", "high")).toEqual({
      line: "갑작스러운 날씨 변화로 지금 일정의 경험이 달라질 수 있어요.",
    });
  });

  it("falls back to a traffic line when only trafficBurden is high", () => {
    expect(buildSituationMessage("low", "high")).toEqual({
      line: "현재 이동 경로에 교통이 혼잡해 이동 부담이 커졌어요.",
    });
  });

  it("returns null for low/medium/unknown on both — never a running dashboard", () => {
    expect(buildSituationMessage("low", "low")).toBeNull();
    expect(buildSituationMessage("medium", "medium")).toBeNull();
    expect(buildSituationMessage("unknown", "unknown")).toBeNull();
  });

  it("never leaks a raw level/score in the returned line", () => {
    for (const w of ["low", "medium", "high", "unknown"] as const) {
      for (const t of ["low", "medium", "high", "unknown"] as const) {
        const msg = buildSituationMessage(w, t);
        if (msg) expect(msg.line).not.toMatch(/high|medium|low|unknown|score|점/i);
      }
    }
  });
});
