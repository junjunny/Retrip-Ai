/**
 * Live-ish test for the layered network probe. Needs outbound network; skips
 * without it. Run: `node ./node_modules/.bin/vitest run tests/api.probe.test.ts`
 */
import { describe, expect, it } from "vitest";

import { probeHost } from "@/lib/api/probe";

const online = process.env.KAKAO_API_KEY || process.env.RUN_NETWORK_TESTS;
const d = describe.skipIf(!online);

d("probeHost", () => {
  it("reports all layers OK for a reachable TLS host", async () => {
    const p = await probeHost("dapi.kakao.com");
    expect(p.dns.ok).toBe(true);
    expect(p.tcp.ok).toBe(true);
    expect(p.tls.ok).toBe(true);
    expect(p.blockedAt).toBeNull();
    expect(p.tls.detail).toMatch(/TLSv1\.[23]/);
  });

  it("reports blockedAt=dns for a nonexistent host", async () => {
    const p = await probeHost("no-such-host.invalid.example", 443, 3000);
    expect(p.dns.ok).toBe(false);
    expect(p.blockedAt).toBe("dns");
    expect(p.tcp.detail).toContain("skipped");
  });
});
