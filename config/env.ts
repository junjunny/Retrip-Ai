/**
 * Centralized environment-variable access.
 *
 * PHASE 0: this module only *declares* the boundary. It does not yet wire any
 * real service. All environment reads for the whole app should go through here
 * so that later phases have a single place to add validation / defaults.
 *
 * Boundary rules:
 * - `clientEnv`  -> values safe to ship to the browser. MUST be prefixed with
 *                   `NEXT_PUBLIC_` and referenced statically so Next can inline them.
 * - `serverEnv`  -> secrets. Never import this from a Client Component or any
 *                   code that runs in the browser.
 */

/** Public config — safe for the browser. */
export const clientEnv = {
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  },
} as const;

/**
 * Server-only secrets. Reading any of these from browser-bound code is a bug;
 * this guard makes that fail loudly instead of silently returning `undefined`.
 */
function assertServer(name: string): void {
  if (typeof window !== "undefined") {
    throw new Error(
      `serverEnv.${name} was accessed in the browser. Move this call to a Route Handler or Server Component.`,
    );
  }
}

export const serverEnv = {
  get firebaseServiceAccount(): string | undefined {
    assertServer("firebaseServiceAccount");
    return process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  },
  get tourApiKey(): string | undefined {
    assertServer("tourApiKey");
    return process.env.TOUR_API_KEY;
  },
  get weatherApiKey(): string | undefined {
    assertServer("weatherApiKey");
    return process.env.WEATHER_API_KEY;
  },
  get kakaoApiKey(): string | undefined {
    assertServer("kakaoApiKey");
    return process.env.KAKAO_API_KEY;
  },
  get llmApiKey(): string | undefined {
    assertServer("llmApiKey");
    return process.env.LLM_API_KEY;
  },
} as const;
