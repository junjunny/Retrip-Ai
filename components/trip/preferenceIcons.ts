/**
 * components/trip/preferenceIcons — one real lucide icon per preference axis
 * (features/participant/participant.ts's `PREFERENCE_KEYS`), shared by
 * ReplanPanel's "지키고 싶은 경험" chips and the demo's pre-trip "여행 설정
 * 확인" screen (STEP 21/22) — never emoji, one definition so both places can
 * never drift into different icon choices for the same axis.
 */
import { Bike, Camera, Coffee, Landmark, ShoppingBag, Sofa, Trees, UtensilsCrossed } from "lucide-react";

import type { PreferenceKey } from "@/types";

export const PREFERENCE_ICON: Record<PreferenceKey, typeof Trees> = {
  nature: Trees,
  culture: Landmark,
  food: UtensilsCrossed,
  cafe: Coffee,
  shopping: ShoppingBag,
  activity: Bike,
  photo: Camera,
  relax: Sofa,
};
