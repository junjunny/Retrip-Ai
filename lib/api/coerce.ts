/** Tiny coercion helpers for messy upstream JSON (all fields arrive as strings). */
import { ExternalApiError } from "./errors";

export function str(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (typeof v === "number") return String(v);
  return null;
}

export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function requireStr(v: unknown, field: string, source: string): string {
  const s = str(v);
  if (s === null) {
    throw new ExternalApiError(
      "bad_response",
      source,
      `missing required field "${field}"`,
    );
  }
  return s;
}
