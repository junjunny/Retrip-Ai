import { describe, expect, it } from "vitest";

import { buildSituationMessage } from "@/features/travel-state/situationMessage";

describe("buildSituationMessage (STEP 18/19/20)", () => {
  it("returns a 'notable' weather message when weatherRisk is high, regardless of traffic", () => {
    expect(buildSituationMessage("high", "low", null)).toEqual({
      tier: "notable",
      line: "여행에 비가 찾아왔어요.",
      impact: "다음 장소를 실내에서 이어가도 좋아요.",
    });
    expect(buildSituationMessage("high", "high", 20)!.tier).toBe("notable");
  });

  it("falls back to a 'notable' traffic message when only trafficBurden is high, using a real delay number when given", () => {
    expect(buildSituationMessage("low", "high", 25)).toEqual({
      tier: "notable",
      line: "이동 시간이 조금 길어졌어요.",
      impact: "지금 속도라면 다음 일정까지 여유가 약 25분 줄어들 수 있어요.",
    });
  });

  it("uses a qualitative traffic impact line when no real delay number exists", () => {
    expect(buildSituationMessage("low", "high", null)!.impact).toBe("가까운 곳에서 여행을 이어가는 방법도 있어요.");
    expect(buildSituationMessage("low", "high", 0)!.impact).toBe("가까운 곳에서 여행을 이어가는 방법도 있어요.");
  });

  it("returns a 'gentle' tier (line only, no impact/action) for a medium signal on either axis", () => {
    expect(buildSituationMessage("medium", "low", null)).toEqual({
      tier: "gentle",
      line: "여행 흐름이 조금 달라졌어요.",
    });
    expect(buildSituationMessage("low", "medium", null)).toEqual({
      tier: "gentle",
      line: "여행 흐름이 조금 달라졌어요.",
    });
  });

  it("returns null (tier 'quiet' — nothing shown) for low/unknown on both — never a running dashboard", () => {
    expect(buildSituationMessage("low", "low", null)).toBeNull();
    expect(buildSituationMessage("unknown", "unknown", null)).toBeNull();
    expect(buildSituationMessage("unknown", "low", null)).toBeNull();
  });

  it("never leaks a raw level/score/countdown-style phrase in the returned text", () => {
    for (const w of ["low", "medium", "high", "unknown"] as const) {
      for (const t of ["low", "medium", "high", "unknown"] as const) {
        const msg = buildSituationMessage(w, t, 12);
        if (msg) {
          const text = `${msg.line} ${msg.impact ?? ""}`;
          expect(text).not.toMatch(/high|medium|low|unknown|score|점|위험|지연|개입|남았습니다/i);
        }
      }
    }
  });
});
