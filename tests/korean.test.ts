import { describe, expect, it } from "vitest";

import { toParticle } from "@/lib/korean";

describe("toParticle (STEP 19)", () => {
  it("uses 로 after a vowel-ending word", () => {
    expect(toParticle("학교")).toBe("로");
    expect(toParticle("경기전")).toBe("으로"); // ends in ㄴ batchim
  });

  it("uses 로 after a ㄹ-final word", () => {
    expect(toParticle("서울")).toBe("로");
  });

  it("uses 으로 after a non-ㄹ final-consonant word", () => {
    expect(toParticle("공원")).toBe("으로"); // ends in ㄴ batchim
    expect(toParticle("경기전")).toBe("으로"); // ends in ㄴ batchim
  });

  it("uses 로 after a ㄹ-final place name too (e.g. 마을)", () => {
    expect(toParticle("한옥마을")).toBe("로");
  });

  it("defaults to 으로 for empty/non-Hangul input", () => {
    expect(toParticle("")).toBe("으로");
    expect(toParticle("Cafe123")).toBe("으로");
  });
});
