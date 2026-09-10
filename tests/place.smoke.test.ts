/**
 * Live smoke test for place normalization (TourAPI + Kakao Local).
 * Run: node --env-file=.env.local ./node_modules/.bin/vitest run tests/place.smoke.test.ts
 */
import { describe, expect, it } from "vitest";

import { resolvePlace } from "@/lib/place/resolve";

const d = describe.skipIf(!process.env.KAKAO_API_KEY);

d("resolvePlace (real TourAPI + Kakao)", () => {
  it("resolves '해운대해수욕장' to the actual beach — never the optician shop", async () => {
    const r = await resolvePlace({ query: "해운대해수욕장" });
    expect(r.placeName).not.toContain("안경");
    expect(["verified", "candidate"]).toContain(r.verificationStatus);
    if (r.verificationStatus === "verified") {
      expect(r.placeName.replace(/\s/g, "")).toBe("해운대해수욕장");
      // Haeundae Beach is around 35.158, 129.160
      expect(r.latitude).toBeGreaterThan(35.1);
      expect(r.latitude).toBeLessThan(35.2);
      expect(r.sources).toContain("kakao");
    }
  });

  it("a nonsense query resolves to unresolved with null coords", async () => {
    const r = await resolvePlace({ query: "ㅁㄴㅇㄹ존재하지않는장소명123" });
    expect(r.verificationStatus).toBe("unresolved");
    expect(r.latitude).toBeNull();
  });
});
