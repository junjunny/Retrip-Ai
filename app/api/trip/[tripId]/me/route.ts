import {
  getParticipantSelf,
  ParticipantAuthError,
} from "@/features/participant/participantService";

/** GET /api/trip/{tripId}/me?participantId=&secret= — the caller's own survey. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  const url = new URL(req.url);
  const participantId = url.searchParams.get("participantId");
  const secret = url.searchParams.get("secret");

  if (!participantId || !secret) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    const self = await getParticipantSelf(tripId, participantId, secret);
    if (!self) return Response.json({ error: "참여 정보가 없습니다." }, { status: 404 });
    return Response.json(self);
  } catch (err) {
    if (err instanceof ParticipantAuthError) {
      return Response.json({ error: err.message }, { status: 401 });
    }
    console.error(
      "[api/trip/me]",
      err instanceof Error ? err.message : "unknown error",
    );
    return Response.json(
      { error: "불러오지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
