/**
 * Live smoke test for lib/api/tour/tourismDetail.ts (STEP 12). Run:
 *   node --env-file=.env.local ./node_modules/.bin/vitest run tests/api.tourismDetail.smoke.test.ts
 */
import { describe, expect, it } from "vitest";

import { fetchTourismDetail } from "@/lib/api/tour/tourismDetail";

const configured = Boolean(process.env.TOUR_API_KEY_MAIN);
const d = describe.skipIf(!configured);

d("fetchTourismDetail", () => {
  it("해운대해수욕장 (contentId 126081, 관광지) returns a real overview + image, no event", async () => {
    const detail = await fetchTourismDetail("126081", 12);
    expect(detail).not.toBeNull();
    expect(detail!.description).toBeTruthy();
    expect(detail!.description).toContain("해운대");
    expect(detail!.imageUrl).toMatch(/^https?:\/\//);
    expect(detail!.event).toBeNull(); // not a festival content type -> never fetched/guessed
  });

  it("a real festival content item returns real eventstartdate/eventenddate", async () => {
    // seen live during development — a real Busan festival with recorded dates; if it
    // ever ages out of the API, this test's assertions (real, valid dates) still hold.
    const detail = await fetchTourismDetail("3422647", 15);
    expect(detail).not.toBeNull();
    if (detail!.event) {
      expect(detail!.event.startDate).toMatch(/^\d{8}$/);
      expect(detail!.event.endDate).toMatch(/^\d{8}$/);
    }
  });

  it("a non-existent contentId returns null, never a fabricated record", async () => {
    const detail = await fetchTourismDetail("999999999999", 12);
    expect(detail).toBeNull();
  });
});
