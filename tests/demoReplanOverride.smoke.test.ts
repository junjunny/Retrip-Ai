/**
 * Live smoke test for the 대전 demo's intended-replacement override
 * (STEP 22 §49/§59.13-14). Confirms the exact real place/address the scenario
 * requires is actually resolvable through the ordinary production pipeline —
 * never a hardcoded coordinate.
 * Run: node --env-file=.env.local ./node_modules/.bin/vitest run tests/demoReplanOverride.smoke.test.ts
 */
import { describe, expect, it } from "vitest";

import {
  DAEJEON_REPLACEMENT_QUERY,
  DAEJEON_SCENARIO_ID,
  DAEJEON_TRIGGER_PLACE_NAME,
  applyDaejeonReplacementOverride,
} from "@/features/demo/demoReplanOverride";
import { resolvePlace } from "@/lib/place/resolve";
import type { ReplanPreview } from "@/features/replan/replan";

const d = describe.skipIf(!process.env.KAKAO_API_KEY);

function fakePreview(currentPlaceName: string): ReplanPreview {
  return {
    tripId: "test",
    generatedAt: new Date().toISOString(),
    baseItineraryFingerprint: "x",
    baseLocationFingerprint: "none",
    slots: [
      {
        itineraryOrder: 3,
        action: "REPLACE",
        current: { placeId: null, placeName: currentPlaceName, date: "2026-10-01", time: "17:00", scheduleType: "flexible" },
        proposed: {
          placeId: "tour:0000000",
          placeName: "추동인공생태습지",
          address: "대전광역시 동구 추동 331",
          latitude: 36.3724451577,
          longitude: 127.4691182418,
          source: "tour-korservice",
          verificationStatus: "verified",
          imageUrl: null,
        },
        score: {
          kind: "candidate",
          place: {
            placeId: "tour:0000000",
            placeName: "추동인공생태습지",
            address: "대전광역시 동구 추동 331",
            latitude: 36.3724451577,
            longitude: 127.4691182418,
            category: 12,
            tourApiContentId: "0000000",
            imageUrl: null,
            source: "tour-korservice",
            verificationStatus: "verified",
            candidateReason: "TourAPI contentTypeId 12",
          },
          breakdown: {
            participantScores: [],
            groupSatisfaction: 70,
            minimumParticipantSatisfaction: null,
            experiencePreservation: 70,
            situationFitness: 80,
            timeFitness: 90,
            travelBurden: 90,
            minimumSatisfactionPenalty: 0,
            finalScore: 78,
          },
          route: null,
        },
        options: [],
      },
    ],
  };
}

d("applyDaejeonReplacementOverride (real resolvePlace)", () => {
  it("명상정원 resolves for real at the exact required address", async () => {
    const r = await resolvePlace({ query: DAEJEON_REPLACEMENT_QUERY });
    expect(["verified", "candidate"]).toContain(r.verificationStatus);
    expect(r.latitude).not.toBeNull();
    const address = `${r.address ?? ""} ${r.roadAddress ?? ""}`;
    expect(address).toContain("추동 680");
  });

  it("swaps only the 대전 trigger slot's proposed place to the real 명상정원", async () => {
    const preview = fakePreview(DAEJEON_TRIGGER_PLACE_NAME);
    const result = await applyDaejeonReplacementOverride(preview, DAEJEON_SCENARIO_ID, null);
    expect(result.slots[0].proposed?.placeName).toContain("명상정원");
    expect(result.slots[0].score.place.placeName).toContain("명상정원");
  });

  it("never touches a non-대전 demo, a non-daejeon-scenario trip, or a slot with a different current place", async () => {
    const preview = fakePreview(DAEJEON_TRIGGER_PLACE_NAME);
    expect(await applyDaejeonReplacementOverride(preview, "busan", null)).toBe(preview);
    expect(await applyDaejeonReplacementOverride(preview, null, null)).toBe(preview);

    const otherSlotPreview = fakePreview("국립중앙과학관");
    const result = await applyDaejeonReplacementOverride(otherSlotPreview, DAEJEON_SCENARIO_ID, null);
    expect(result).toBe(otherSlotPreview);
  });
});
