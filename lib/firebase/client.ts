/**
 * Firebase **client** SDK initialization (browser-safe).
 *
 * Uses only `NEXT_PUBLIC_*` config. Safe to import from Client Components.
 *
 * Initialization is lazy and guarded. PHASE 1 adds Firestore access
 * (`getFirestoreDb`); Auth flows are still intentionally absent.
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

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

/**
 * Returns the Firestore instance, or `null` when Firebase env vars are not
 * configured. Callers must handle the `null` case.
 */
export function getFirestoreDb(): Firestore | null {
  const app = getFirebaseApp();
  return app ? getFirestore(app) : null;
}
