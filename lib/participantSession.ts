/**
 * Per-trip participant credentials, kept in the browser's localStorage.
 *
 * This is the login-less identity: `{ participantId, secret }` issued by the
 * server on first submit. It lets the same browser re-open its own survey and
 * update it. Clearing storage / a different device = a new participant, by
 * design (we cannot prove it is the same person).
 */
export interface ParticipantSession {
  participantId: string;
  secret: string;
}

const key = (tripId: string) => `retrip:participant:v1:${tripId}`;

export function loadSession(tripId: string): ParticipantSession | null {
  try {
    const raw = localStorage.getItem(key(tripId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ParticipantSession>;
    return typeof parsed?.participantId === "string" &&
      typeof parsed?.secret === "string"
      ? { participantId: parsed.participantId, secret: parsed.secret }
      : null;
  } catch {
    return null;
  }
}

export function saveSession(tripId: string, session: ParticipantSession): void {
  try {
    localStorage.setItem(key(tripId), JSON.stringify(session));
  } catch {
    // private mode / storage disabled — the survey still works, just no resume
  }
}

export function clearSession(tripId: string): void {
  try {
    localStorage.removeItem(key(tripId));
  } catch {
    // ignore
  }
}
