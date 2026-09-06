/**
 * Shared fetch for every external adapter: per-request timeout, bounded retry
 * for transient failures only, and uniform error mapping to `ExternalApiError`.
 *
 * Server-only in practice — adapters that import this hold API keys.
 */
import { ExternalApiError, kindForStatus } from "./errors";

export interface FetchJsonOptions {
  /** adapter tag for error messages, e.g. "tour/tourism" */
  source: string;
  /** abort after this many ms (default 9000) */
  timeoutMs?: number;
  /** retries for transient failures only (default 2) */
  retries?: number;
  headers?: Record<string, string>;
  /**
   * Next.js fetch cache hint. Tourism/accessibility content changes rarely,
   * visitor data is daily, weather ~hourly — callers pass the right TTL.
   */
  revalidateSeconds?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET `url`, parse JSON, or throw `ExternalApiError`. */
export async function fetchJson<T = unknown>(
  url: string,
  opts: FetchJsonOptions,
): Promise<T> {
  const { source, timeoutMs = 9000, retries = 2, headers, revalidateSeconds } = opts;
  let lastErr: ExternalApiError | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers,
        ...(revalidateSeconds !== undefined
          ? { next: { revalidate: revalidateSeconds } }
          : {}),
      });

      if (!res.ok) {
        const err = new ExternalApiError(
          kindForStatus(res.status),
          source,
          `upstream responded ${res.status}`,
          res.status,
        );
        if (!err.retryable) throw err;
        lastErr = err;
      } else {
        const text = await res.text();
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new ExternalApiError(
            "bad_response",
            source,
            "upstream returned non-JSON body",
            res.status,
          );
        }
      }
    } catch (e) {
      if (e instanceof ExternalApiError) {
        if (!e.retryable) throw e;
        lastErr = e;
      } else if (e instanceof DOMException && e.name === "AbortError") {
        lastErr = new ExternalApiError("timeout", source, `timed out after ${timeoutMs}ms`);
      } else {
        lastErr = new ExternalApiError(
          "network",
          source,
          e instanceof Error ? e.message : "connection failed",
        );
      }
    } finally {
      clearTimeout(timer);
    }

    if (attempt < retries) await sleep(300 * (attempt + 1));
  }

  throw lastErr ?? new ExternalApiError("network", source, "request failed");
}

/**
 * Builds a query string. data.go.kr service keys arrive URL-encoded in the env
 * var; pass `preEncodedKeys` (e.g. ["serviceKey"]) so they are appended raw
 * instead of being encoded a second time.
 */
export function buildQuery(
  params: Record<string, string | number | undefined>,
  preEncodedKeys: string[] = [],
): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    parts.push(
      preEncodedKeys.includes(k)
        ? `${k}=${v}`
        : `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
    );
  }
  return parts.join("&");
}
