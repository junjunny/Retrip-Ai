"use client";

import { useEffect } from "react";

/** Closes a modal sheet on Escape — shared by PlaceConfirmSheet / ItineraryEditSheet. */
export function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
}
