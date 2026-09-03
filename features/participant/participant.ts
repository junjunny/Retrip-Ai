/**
 * features/participant — pure participant/preference logic (no I/O, no Node
 * built-ins). Safe to import from both the browser and server Route Handlers.
 * Firestore access lives in `./participantService` (server-only).
 */
import type {
  IndoorOutdoor,
  PreferenceKey,
  PreferenceVector,
  TravelPace,
} from "@/types";

export const PREFERENCE_KEYS: readonly PreferenceKey[] = [
  "nature",
  "culture",
  "food",
  "shopping",
  "activity",
  "relaxation",
  "sightseeing",
];

export const PREFERENCE_LABELS: Record<PreferenceKey, string> = {
  nature: "자연",
  culture: "문화",
  food: "맛집",
  shopping: "쇼핑",
  activity: "액티비티",
  relaxation: "휴식",
  sightseeing: "관광",
};

export const PREFERENCE_MIN = 1;
export const PREFERENCE_MAX = 5;

export const PACES: readonly TravelPace[] = ["slow", "normal", "fast"];
export const PACE_LABELS: Record<TravelPace, string> = {
  slow: "여유롭게",
  normal: "보통",
  fast: "알차게",
};

export const INDOOR_OUTDOOR: readonly IndoorOutdoor[] = [
  "indoor",
  "outdoor",
  "balanced",
];
export const INDOOR_OUTDOOR_LABELS: Record<IndoorOutdoor, string> = {
  indoor: "실내 위주",
  outdoor: "야외 위주",
  balanced: "고루",
};

export const NICKNAME_MAX = 20;

/** Neutral starting point for the survey sliders. */
export function defaultPreferenceVector(): PreferenceVector {
  return {
    nature: 3,
    culture: 3,
    food: 3,
    shopping: 3,
    activity: 3,
    relaxation: 3,
    sightseeing: 3,
  };
}

export interface JoinInput {
  nickname: string;
  preferences: PreferenceVector;
  pace: TravelPace;
  indoorOutdoor: IndoorOutdoor;
}

/** Returns user-facing (Korean) error messages. Empty list == valid. */
export function validateJoinInput(input: Partial<JoinInput>): string[] {
  const errors: string[] = [];

  const nickname = typeof input.nickname === "string" ? input.nickname.trim() : "";
  if (!nickname) errors.push("닉네임을 입력해주세요.");
  else if (nickname.length > NICKNAME_MAX)
    errors.push(`닉네임은 ${NICKNAME_MAX}자 이하로 입력해주세요.`);

  const pref = input.preferences;
  if (!pref || typeof pref !== "object") {
    errors.push("선호도를 입력해주세요.");
  } else {
    for (const key of PREFERENCE_KEYS) {
      const v = (pref as Record<string, unknown>)[key];
      if (
        typeof v !== "number" ||
        !Number.isInteger(v) ||
        v < PREFERENCE_MIN ||
        v > PREFERENCE_MAX
      ) {
        errors.push(
          `"${PREFERENCE_LABELS[key]}" 선호도는 ${PREFERENCE_MIN}~${PREFERENCE_MAX} 사이 값이어야 합니다.`,
        );
      }
    }
  }

  if (!input.pace || !PACES.includes(input.pace)) {
    errors.push("여행 속도를 선택해주세요.");
  }
  if (!input.indoorOutdoor || !INDOOR_OUTDOOR.includes(input.indoorOutdoor)) {
    errors.push("실내/야외 선호를 선택해주세요.");
  }

  return errors;
}
