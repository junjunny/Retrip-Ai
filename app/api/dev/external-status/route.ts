/**
 * GET /api/dev/external-status — dev-only probe of every external adapter.
 *
 * Runs one representative call per adapter and reports whether it succeeded, the
 * error kind if not, and a tiny redacted sample. Never returns a key. 404s in
 * production.
 */
import {
  ExternalApiError,
  fetchAccessibility,
  fetchDrivingRoute,
  fetchMetroVisitors,
  fetchShortTermForecast,
  fetchTourismByArea,
  searchPlacesByKeyword,
} from "@/lib/api";

type Probe = { source: string; run: () => Promise<unknown> };

const YMD = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

const probes: Probe[] = [
  {
    source: "tour/tourism",
    run: () => fetchTourismByArea({ areaCode: 6, contentTypeId: 12, numOfRows: 3 }), // 부산 관광지
  },
  {
    source: "tour/visitors",
    run: () => {
      const end = new Date(Date.now() - 7 * 864e5);
      const start = new Date(Date.now() - 14 * 864e5);
      return fetchMetroVisitors(26, { startYmd: YMD(start), endYmd: YMD(end), numOfRows: 3 }); // 부산
    },
  },
  { source: "tour/accessibility", run: () => fetchAccessibility(126508) },
  {
    source: "weather/kma",
    run: () => fetchShortTermForecast({ latitude: 35.1587, longitude: 129.1603 }),
  },
  { source: "kakao/place", run: () => searchPlacesByKeyword("해운대", { size: 3 }) },
  {
    source: "kakao/route",
    run: () =>
      fetchDrivingRoute({
        origin: { longitude: 129.1598, latitude: 35.1585 },
        destination: { longitude: 129.0756, latitude: 35.1796 },
      }),
  },
];

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const results = await Promise.all(
    probes.map(async ({ source, run }) => {
      try {
        const data = await run();
        const count = Array.isArray(data) ? data.length : data == null ? 0 : 1;
        const sample = Array.isArray(data) ? data[0] : data;
        return { source, ok: true, count, sample: sample ?? null };
      } catch (e) {
        if (e instanceof ExternalApiError) {
          return { source, ok: false, kind: e.kind, status: e.status ?? null, message: e.message };
        }
        return { source, ok: false, kind: "unknown", message: String(e) };
      }
    }),
  );

  return Response.json({ checkedAt: new Date().toISOString(), results });
}
