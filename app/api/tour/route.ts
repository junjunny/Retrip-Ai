/**
 * app/api/tour — Route Handler (PHASE 0 placeholder).
 *
 * Browser -> this handler -> external API. Keeps server-only API keys off the
 * client. Not implemented until its phase.
 */
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    { error: "Not implemented", route: "tour" },
    { status: 501 },
  );
}
