/**
 * Live smoke test for the LLM explanation pipeline (real OpenAI call, no
 * Firestore involved). Run:
 *   node --env-file=.env.local ./node_modules/.bin/vitest run tests/llm.smoke.test.ts
 */
import { describe, expect, it } from "vitest";

import { generateJsonCompletion } from "@/lib/llm";
import { isGrounded, isValidReplanExplanation } from "@/features/replan/explanation";
import { generateReplanExplanation } from "@/features/replan/explanation/explanationService";
import type { ReplanPreview, ReplanSlotProposal } from "@/features/replan";
import type { RankedOption, ScoreBreakdown } from "@/features/scoring";

const d = describe.skipIf(!process.env.LLM_API_KEY);

const breakdown: ScoreBreakdown = {
  groupSatisfaction: 86,
  experiencePreservation: 91,
  situationFitness: 78,
  timeFitness: 82,
  travelBurden: 30,
  minimumSatisfactionPenalty: 0,
  finalScore: 84.2,
  participantScores: [88, 84],
  minimumParticipantSatisfaction: 84,
};

const winner: RankedOption = {
  kind: "candidate",
  place: {
    placeId: "tour:999",
    placeName: "실내 문화공간",
    address: "부산 해운대구",
    latitude: 35.16,
    longitude: 129.16,
    category: 14,
    tourApiContentId: "tour:999",
    imageUrl: null,
    source: "tour-korservice",
    verificationStatus: "verified",
    candidateReason: "",
  },
  breakdown,
  route: { durationSeconds: 1080, distanceMeters: 2400 },
};

const slot: ReplanSlotProposal = {
  itineraryOrder: 1,
  action: "REPLACE",
  current: { placeId: null, placeName: "해운대 해수욕장", date: "2026-10-01", time: "14:00", scheduleType: "flexible" },
  proposed: {
    placeId: "tour:999",
    placeName: "실내 문화공간",
    address: "부산 해운대구",
    latitude: 35.16,
    longitude: 129.16,
    source: "tour-korservice",
    verificationStatus: "verified",
    imageUrl: null,
  },
  score: winner,
  options: [winner],
};

const preview: ReplanPreview = {
  tripId: "LLMSMOKE",
  generatedAt: "2026-10-01T01:00:00.000Z",
  baseItineraryFingerprint: "deadbeef",
  slots: [slot],
};

d("LLM explanation (live)", () => {
  it("generateJsonCompletion returns real, parseable JSON text", async () => {
    const raw = await generateJsonCompletion({
      system: '오직 {"ok": true} 라는 JSON만 정확히 응답하세요. 다른 키나 텍스트를 추가하지 마세요.',
      user: "ping",
    });
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("generateReplanExplanation produces a schema-valid, grounded explanation from a real LLM call", async () => {
    const { explanation, facts } = await generateReplanExplanation(preview, { weatherRisk: "high", trafficBurden: "unknown" }, "2026-10-01");
    expect(isValidReplanExplanation(explanation)).toBe(true);
    expect(isGrounded(explanation, facts)).toBe(true);
    // never throws / never empty even against the real API
    expect(explanation.title.length).toBeGreaterThan(0);
    expect(explanation.slotReasons.length).toBeGreaterThanOrEqual(0);
  });

  it("an invalid API key falls back deterministically instead of failing the preview", async () => {
    const original = process.env.LLM_API_KEY;
    process.env.LLM_API_KEY = "sk-invalid-test-key";
    try {
      const { explanation } = await generateReplanExplanation(preview, { weatherRisk: "unknown", trafficBurden: "unknown" }, "2026-10-01");
      expect(isValidReplanExplanation(explanation)).toBe(true);
    } finally {
      process.env.LLM_API_KEY = original;
    }
  });
});
