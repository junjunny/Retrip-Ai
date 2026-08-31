/**
 * Firebase **client** SDK initialization (browser-safe).
 *
 * Uses only `NEXT_PUBLIC_*` config. Safe to import from Client Components.
 *
 * PHASE 0: initialization is lazy and guarded. No Firestore reads/writes,
 * no Auth flows are implemented yet — those arrive in later phases.
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";

import { clientEnv } from "@/config/env";

function hasClientConfig(): boolean {
  const c = clientEnv.firebase;
  return Boolean(c.apiKey && c.projectId && c.appId);
}

/**
 * Returns the initialized client app, or `null` when Firebase env vars are not
 * configured (e.g. local dev before `.env.local` is filled in). Callers must
 * handle the `null` case rather than assume Firebase is available.
 */
export function getFirebaseApp(): FirebaseApp | null {
  if (!hasClientConfig()) return null;
  if (getApps().length) return getApp();

  const c = clientEnv.firebase;
  return initializeApp({
    apiKey: c.apiKey,
    authDomain: c.authDomain,
    projectId: c.projectId,
    storageBucket: c.storageBucket,
    messagingSenderId: c.messagingSenderId,
    appId: c.appId,
  });
}
