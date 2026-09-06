/**
 * GET /api/dev/external-status — layered network probe + per-adapter probe of
 * every external data source.
 *
 * Two sections:
 *   network[]  DNS → TCP → TLS per host (pinpoints NETWORK_BLOCKED / TLS_ERROR)
 *   adapters[] one real call per adapter (auth / request / upstream / parsing)
 *
 * Never returns a key. Available in dev always; in production only when
 * `ENABLE_EXTERNAL_STATUS=1` (set it to diagnose a deploy, unset it after).
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
import { probeHost } from "@/lib/api/probe";

// four probes + six adapter calls, each up to ~9s with retries — give it room
export const maxDuration = 60;

const YMD = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

const adapterProbes: { source: string; run: () => Promise<unknown> }[] = [
  { source: "tour/tourism", run: () => fetchTourismByArea({ areaCode: 6, contentTypeId: 12, numOfRows: 3 }) },
  {
    source: "tour/visitors",
    run: () =>
      fetchMetroVisitors(26, {
        startYmd: YMD(new Date(Date.now() - 14 * 864e5)),
        endYmd: YMD(new Date(Date.now() - 7 * 864e5)),
        numOfRows: 3,
      }),
  },
  { source: "tour/accessibility", run: () => fetchAccessibility(126508) },
  { source: "weather/kma", run: () => fetchShortTermForecast({ latitude: 35.1587, longitude: 129.1603 }) },
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
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_EXTERNAL_STATUS !== "1") {
    return new Response("Not found", { status: 404 });
  }

  const [network, adapters] = await Promise.all([
    Promise.all(
      ["apis.data.go.kr", "www.data.go.kr", "dapi.kakao.com", "apis-navi.kakaomobility.com"].map(
        (h) => probeHost(h),
      ),
    ),
    Promise.all(
      adapterProbes.map(async ({ source, run }) => {
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
    ),
  ]);

  return Response.json({
    checkedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      region: process.env.VERCEL_REGION ?? process.env.FIREBASE_APP_HOSTING_REGION ?? null,
      env: process.env.NODE_ENV,
    },
    network,
    adapters,
  });
}
