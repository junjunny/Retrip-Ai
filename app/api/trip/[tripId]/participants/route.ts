import { countParticipants } from "@/features/participant/participantService";

/** GET /api/trip/{tripId}/participants — participant count (public, no secret). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  try {
    return Response.json({ count: await countParticipants(tripId) });
  } catch (err) {
    console.error(
      "[api/trip/participants]",
      err instanceof Error ? err.message : "unknown error",
    );
    return Response.json({ error: "불러오지 못했습니다." }, { status: 500 });
  }
}
