import { describe, expect, it } from "vitest";

import { buildSituationMessage } from "@/features/travel-state/situationMessage";

describe("buildSituationMessage (STEP 18/19)", () => {
  it("returns a weather line+impact when weatherRisk is high, regardless of traffic", () => {
    expect(buildSituationMessage("high", "low", null)).toEqual({
      line: "갑작스러운 날씨 변화로 지금 일정의 경험이 달라질 수 있어요.",
      impact: "지금 계획대로 진행하면 원래 기대했던 경험과 달라질 수 있어요.",
    });
    expect(buildSituationMessage("high", "high", 20)).toEqual({
      line: "갑작스러운 날씨 변화로 지금 일정의 경험이 달라질 수 있어요.",
      impact: "지금 계획대로 진행하면 원래 기대했던 경험과 달라질 수 있어요.",
    });
  });

  it("falls back to a traffic line when only trafficBurden is high, using a real delay number when given", () => {
    expect(buildSituationMessage("low", "high", 25)).toEqual({
      line: "현재 이동 경로에 교통이 혼잡해 이동 부담이 커졌어요.",
      impact: "지금 속도라면 다음 일정이 약 25분 늦어질 수 있어요.",
    });
  });

  it("uses a qualitative traffic impact line when no real delay number exists", () => {
    expect(buildSituationMessage("low", "high", null)).toEqual({
      line: "현재 이동 경로에 교통이 혼잡해 이동 부담이 커졌어요.",
      impact: "지금 일정대로 이동하면 남은 여유 시간이 줄어들 수 있어요.",
    });
    expect(buildSituationMessage("low", "high", 0)).toEqual({
      line: "현재 이동 경로에 교통이 혼잡해 이동 부담이 커졌어요.",
      impact: "지금 일정대로 이동하면 남은 여유 시간이 줄어들 수 있어요.",
    });
  });

  it("returns null for low/medium/unknown on both — never a running dashboard", () => {
    expect(buildSituationMessage("low", "low", null)).toBeNull();
    expect(buildSituationMessage("medium", "medium", 30)).toBeNull();
    expect(buildSituationMessage("unknown", "unknown", null)).toBeNull();
  });

  it("never leaks a raw level/score in the returned text", () => {
    for (const w of ["low", "medium", "high", "unknown"] as const) {
      for (const t of ["low", "medium", "high", "unknown"] as const) {
        const msg = buildSituationMessage(w, t, 12);
        if (msg) {
          expect(msg.line).not.toMatch(/high|medium|low|unknown|score|점/i);
          expect(msg.impact).not.toMatch(/high|medium|low|unknown|score|점/i);
        }
      }
    }
  });
});
