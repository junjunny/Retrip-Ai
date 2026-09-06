/**
 * One error type for every external adapter, so callers never see a raw
 * `fetch` failure or an upstream error body. Server-only in practice (adapters
 * import it), but has no Node dependency.
 */
export type ExternalApiErrorKind =
  | "timeout" // request aborted after the deadline
  | "network" // DNS / connection failure
  | "http" // upstream returned a non-2xx we don't further classify
  | "auth" // 401 / 403 — bad or unauthorised key
  | "rate_limit" // 429
  | "upstream" // 5xx
  | "bad_response"; // 2xx but body missing required fields / wrong shape / API result code != success

export class ExternalApiError extends Error {
  readonly kind: ExternalApiErrorKind;
  /** upstream HTTP status when there was one */
  readonly status?: number;
  /** which adapter raised it, e.g. "tour/tourism" */
  readonly source: string;

  constructor(
    kind: ExternalApiErrorKind,
    source: string,
    message: string,
    status?: number,
  ) {
    super(`[${source}] ${message}`);
    this.name = "ExternalApiError";
    this.kind = kind;
    this.source = source;
    this.status = status;
  }

  /** Transient failures worth a bounded retry. 400/401/403 are not. */
  get retryable(): boolean {
    return (
      this.kind === "timeout" ||
      this.kind === "network" ||
      this.kind === "upstream" ||
      this.kind === "rate_limit"
    );
  }
}

/** Maps an HTTP status to an error kind. */
export function kindForStatus(status: number): ExternalApiErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "upstream";
  return "http";
}
