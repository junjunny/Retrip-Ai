/**
 * GET /api/trip/{tripId}/weather-outlook
 *
 * (STEP 22 §5/§6) One real KMA forecast call (`fetchShortTermForecast`,
 * unchanged — the same adapter Travel State already uses), bucketed into an
 * AM/PM outlook per itinerary date via `buildDailyOutlook` (pure, presentational
 * only). Used by the demo's pre-trip "여행 설정 확인" summary so a judge sees
 * the trip's real expected weather before starting, tied to that day's actual
 * itinerary — never a fabricated forecast for a date outside KMA's real
 * window (that date's `am`/`pm` just come back `null`).
 *
 * The anchor location is the itinerary's FIRST coordinate-bearing item — one
 * representative point for the whole trip's forecast, not a per-stop call;
 * a multi-day domestic trip's stops sit close enough together that this is
 * an honest simplification, never an invented value.
 */
import { coerceItinerary } from "@/features/trip/trip";
import { buildDailyOutlook, type DailyOutlook } from "@/features/travel-state";
import { fetchShortTermForecast } from "@/lib/api";
import { getAdminDb } from "@/lib/firebase/admin";

export const maxDuration = 20;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  const db = getAdminDb();
  if (!db) return Response.json({ days: [] as DailyOutlook[] });

  try {
    const snap = await db.doc(`trips/${tripId}`).get();
    if (!snap.exists) return Response.json({ error: "여행을 찾을 수 없습니다." }, { status: 404 });
    const data = snap.data() ?? {};
    const startDate = typeof data.startDate === "string" ? data.startDate : "";
    const itinerary = coerceItinerary(data.itinerary, startDate);
    const dates = [...new Set(itinerary.map((i) => i.date))].sort();

    const anchor = itinerary.find((i) => i.latitude != null && i.longitude != null);
    if (!anchor) {
      return Response.json({ days: dates.map((date) => ({ date, am: null, pm: null })) });
    }

    const slots = await fetchShortTermForecast({ latitude: anchor.latitude!, longitude: anchor.longitude! });
    return Response.json({ days: buildDailyOutlook(slots, dates) });
  } catch (err) {
    console.error("[api/trip/weather-outlook]", err instanceof Error ? err.message : "unknown error");
    // A forecast summary is a nice-to-have, never a blocking failure.
    return Response.json({ days: [] as DailyOutlook[] });
  }
}
