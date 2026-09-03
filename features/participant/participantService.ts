/**
 * features/participant/participantService — the only place that reads/writes
 * `trips/{tripId}/participants/*` and `.../preferences/*`.
 *
 * SERVER ONLY. Uses the Admin SDK (client security rules deny all sub-collection
 * access). Import this from Route Handlers only, never from a Client Component.
 */
import "server-only";

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import {
  FieldValue,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import type {
  IndoorOutdoor,
  PreferenceVector,
  PreferenceStatus,
  TravelPace,
} from "@/types";

import { PREFERENCE_KEYS, validateJoinInput, type JoinInput } from "./participant";

export class ParticipantValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(errors.join(" "));
    this.name = "ParticipantValidationError";
    this.errors = errors;
  }
}
export class ParticipantAuthError extends Error {
  constructor() {
    super("참여 정보가 유효하지 않습니다.");
    this.name = "ParticipantAuthError";
  }
}
export class TripNotFoundError extends Error {
  constructor() {
    super("여행을 찾을 수 없습니다.");
    this.name = "TripNotFoundError";
  }
}

export interface ParticipantDTO {
  participantId: string;
  nickname: string;
  preferenceStatus: PreferenceStatus;
  createdAt: number;
  updatedAt: number;
}
export interface PreferenceDTO {
  preferences: PreferenceVector;
  pace: TravelPace;
  indoorOutdoor: IndoorOutdoor;
  updatedAt: number;
}
export interface SubmitInput extends Partial<JoinInput> {
  participantId?: string;
  secret?: string;
}
export interface SubmitResult {
  participantId: string;
  /** Plaintext secret — returned once on create, echoed on update. Client stores it. */
  secret: string;
  participant: ParticipantDTO;
  preferences: PreferenceDTO;
}

function requireDb(): Firestore {
  const db = getAdminDb();
  if (!db) {
    throw new Error(
      "Firebase Admin이 설정되지 않았습니다. FIREBASE_SERVICE_ACCOUNT_KEY를 확인해주세요.",
    );
  }
  return db;
}

const hashSecret = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");

function secretMatches(secret: string, storedHash: unknown): boolean {
  if (typeof storedHash !== "string" || storedHash.length !== 64) return false;
  const a = Buffer.from(hashSecret(secret), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const toMillis = (ts: unknown): number =>
  typeof (ts as { toMillis?: () => number })?.toMillis === "function"
    ? (ts as { toMillis: () => number }).toMillis()
    : Date.now();

function cleanVector(raw: Partial<JoinInput>): PreferenceVector {
  const src = (raw.preferences ?? {}) as Record<string, number>;
  return Object.fromEntries(
    PREFERENCE_KEYS.map((k) => [k, src[k]]),
  ) as PreferenceVector;
}

/**
 * Creates a participant + preference document on first submit, or updates them
 * when a valid `{participantId, secret}` is supplied. One document per
 * participant per trip — re-submits never fan out.
 */
export async function submitParticipant(
  tripId: string,
  input: SubmitInput,
): Promise<SubmitResult> {
  const errors = validateJoinInput(input);
  if (errors.length > 0) throw new ParticipantValidationError(errors);

  const db = requireDb();
  if (!(await db.doc(`trips/${tripId}`).get()).exists) {
    throw new TripNotFoundError();
  }

  const nickname = (input.nickname as string).trim();
  const vector = cleanVector(input);
  const pace = input.pace as TravelPace;
  const indoorOutdoor = input.indoorOutdoor as IndoorOutdoor;
  const now = FieldValue.serverTimestamp();

  let participantId = input.participantId;
  let secret = input.secret;

  const participantsCol = db.collection(`trips/${tripId}/participants`);
  const preferencesCol = db.collection(`trips/${tripId}/preferences`);

  if (participantId && secret) {
    const snap = await participantsCol.doc(participantId).get();
    if (!snap.exists || !secretMatches(secret, snap.get("secretHash"))) {
      throw new ParticipantAuthError();
    }
    await participantsCol.doc(participantId).set(
      { nickname, preferenceStatus: "completed", updatedAt: now },
      { merge: true },
    );
    await preferencesCol.doc(participantId).set(
      { participantId, tripId, preferences: vector, pace, indoorOutdoor, updatedAt: now },
      { merge: true },
    );
  } else {
    participantId = randomUUID();
    secret = randomBytes(24).toString("base64url");
    await participantsCol.doc(participantId).set({
      participantId,
      tripId,
      nickname,
      secretHash: hashSecret(secret),
      preferenceStatus: "completed" satisfies PreferenceStatus,
      createdAt: now,
      updatedAt: now,
    });
    await preferencesCol.doc(participantId).set({
      participantId,
      tripId,
      preferences: vector,
      pace,
      indoorOutdoor,
      createdAt: now,
      updatedAt: now,
    });
  }

  const [pSnap, prefSnap] = await Promise.all([
    participantsCol.doc(participantId).get(),
    preferencesCol.doc(participantId).get(),
  ]);
  return {
    participantId,
    secret,
    participant: toParticipantDTO(pSnap.data()!),
    preferences: toPreferenceDTO(prefSnap.data()!),
  };
}

/** Returns the participant's own saved data, or `null` if never submitted. */
export async function getParticipantSelf(
  tripId: string,
  participantId: string,
  secret: string,
): Promise<{ participant: ParticipantDTO; preferences: PreferenceDTO | null } | null> {
  const db = requireDb();
  const pSnap = await db.doc(`trips/${tripId}/participants/${participantId}`).get();
  if (!pSnap.exists) return null;
  if (!secretMatches(secret, pSnap.get("secretHash"))) throw new ParticipantAuthError();

  const prefSnap = await db
    .doc(`trips/${tripId}/preferences/${participantId}`)
    .get();
  return {
    participant: toParticipantDTO(pSnap.data()!),
    preferences: prefSnap.exists ? toPreferenceDTO(prefSnap.data()!) : null,
  };
}

/** Number of participants who have joined a trip. */
export async function countParticipants(tripId: string): Promise<number> {
  const db = requireDb();
  const agg = await db.collection(`trips/${tripId}/participants`).count().get();
  return agg.data().count;
}

function toParticipantDTO(d: DocumentData): ParticipantDTO {
  return {
    participantId: String(d.participantId ?? ""),
    nickname: String(d.nickname ?? ""),
    preferenceStatus: d.preferenceStatus === "completed" ? "completed" : "not_started",
    createdAt: toMillis(d.createdAt),
    updatedAt: toMillis(d.updatedAt),
  };
}

function toPreferenceDTO(d: DocumentData): PreferenceDTO {
  const raw = (d.preferences ?? {}) as Record<string, number>;
  const preferences = Object.fromEntries(
    PREFERENCE_KEYS.map((k) => [k, Number(raw[k]) || 0]),
  ) as PreferenceVector;
  return {
    preferences,
    pace: (["slow", "normal", "fast"] as const).includes(d.pace) ? d.pace : "normal",
    indoorOutdoor: (["indoor", "outdoor", "balanced"] as const).includes(
      d.indoorOutdoor,
    )
      ? d.indoorOutdoor
      : "balanced",
    updatedAt: toMillis(d.updatedAt),
  };
}
