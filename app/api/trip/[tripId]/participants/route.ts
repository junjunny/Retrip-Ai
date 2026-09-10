import {
  countParticipants,
  listParticipants,
} from "@/features/participant/participantService";

/**
 * GET /api/trip/{tripId}/participants — nicknames + count of everyone who
 * joined. Public (no secret). Preferences are NEVER returned here.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  try {
    const [count, participants] = await Promise.all([
      countParticipants(tripId),
      listParticipants(tripId),
    ]);
    return Response.json({
      count,
      participants: participants.map((p) => ({ nickname: p.nickname })),
    });
  } catch (err) {
    console.error(
      "[api/trip/participants]",
      err instanceof Error ? err.message : "unknown error",
    );
    return Response.json({ error: "불러오지 못했습니다." }, { status: 500 });
  }
}
