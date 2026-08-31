import { NextResponse } from "next/server";

import { appConfig } from "@/config/app";

/** Liveness probe — used for deployment/QA checks. */
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: appConfig.name,
    phase: appConfig.phase,
  });
}
