/**
 * Firebase **Admin** SDK initialization (server-only).
 *
 * SECURITY BOUNDARY: this module must never be imported by client code. It
 * carries privileged access via a service-account credential. The `server-only`
 * import makes a client import a build-time error.
 *
 * The service account is provided as a single JSON string in the
 * `FIREBASE_SERVICE_ACCOUNT_KEY` env var (never a committed file).
 *
 * PHASE 0: initialization is lazy and guarded. No admin Firestore/Auth
 * operations are implemented yet.
 */
import "server-only";

import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";

import { serverEnv } from "@/config/env";

/**
 * Returns the initialized Admin app, or `null` when the service-account
 * credential is not configured. Callers must handle the `null` case.
 */
export function getFirebaseAdminApp(): App | null {
  const raw = serverEnv.firebaseServiceAccount;
  if (!raw) return null;
  if (getApps().length) return getApp();

  let serviceAccount: Record<string, unknown>;
  try {
    serviceAccount = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON. Paste the full service-account key as a single-line JSON string.",
    );
  }

  return initializeApp({
    credential: cert(serviceAccount as Parameters<typeof cert>[0]),
  });
}
