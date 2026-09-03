import {
  ParticipantAuthError,
  ParticipantValidationError,
  submitParticipant,
  TripNotFoundError,
} from "@/features/participant/participantService";

/** POST /api/trip/{tripId}/submit — create or update a participant's survey. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    const result = await submitParticipant(tripId, {
      ...(body as Record<string, unknown>),
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof ParticipantValidationError) {
      return Response.json(
        { error: "입력값을 확인해주세요.", details: err.errors },
        { status: 400 },
      );
    }
    if (err instanceof ParticipantAuthError) {
      return Response.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof TripNotFoundError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    console.error(
      "[api/trip/submit]",
      err instanceof Error ? err.message : "unknown error",
    );
    return Response.json(
      { error: "저장에 실패했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
