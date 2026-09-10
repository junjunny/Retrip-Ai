import { describe, expect, it } from "vitest";

import { ktoAreaToStatSido, statSidoToKtoArea } from "@/lib/region";

describe("region code mapping (TourAPI areaCode ↔ 행정표준 시도코드)", () => {
  it("부산: TourAPI '6' ↔ 행정표준 '26' — never the same number", () => {
    expect(ktoAreaToStatSido("6")?.statSidoCode).toBe("26");
    expect(statSidoToKtoArea("26")?.ktoAreaCode).toBe("6");
    expect(ktoAreaToStatSido("6")?.ktoAreaCode).not.toBe(
      ktoAreaToStatSido("6")?.statSidoCode,
    );
  });

  it("서울 '1' ↔ '11', 경기 '31' ↔ '41'", () => {
    expect(ktoAreaToStatSido("1")?.statSidoCode).toBe("11");
    expect(ktoAreaToStatSido("31")?.statSidoCode).toBe("41");
  });

  it("accepts a 5-digit 시군구 code (uses the 시도 prefix)", () => {
    expect(statSidoToKtoArea("26350")?.name).toBe("부산광역시"); // 해운대구
  });

  it("returns null for an unknown code", () => {
    expect(ktoAreaToStatSido("999")).toBeNull();
    expect(statSidoToKtoArea("99")).toBeNull();
  });
});
