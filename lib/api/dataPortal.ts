/**
 * Shared client for data.go.kr (공공데이터포털) services — 한국관광공사 TourAPI and
 * 기상청 단기예보 all share one service key, one response envelope, and one set of
 * result codes.
 *
 * SERVER ONLY.
 */
import "server-only";

import { serverEnv } from "@/config/env";

import { ExternalApiError } from "./errors";
import { buildQuery, fetchJson } from "./http";

const BASE = "https://apis.data.go.kr";

/** data.go.kr standard result codes (header.resultCode / XML returnReasonCode). */
function classifyResultCode(code: string, source: string): ExternalApiError | "ok" | "nodata" {
  if (code === "00" || code === "0000") return "ok";
  if (code === "03") return "nodata"; // NODATA_ERROR — not a failure
  if (code === "30" || code === "31") return new ExternalApiError("auth", source, `service key rejected (code ${code})`);
  if (code === "22") return new ExternalApiError("rate_limit", source, "request quota exceeded (code 22)");
  if (code === "05") return new ExternalApiError("upstream", source, "upstream service timeout (code 05)");
  if (code === "01" || code === "04") return new ExternalApiError("upstream", source, `upstream error (code ${code})`);
  return new ExternalApiError("bad_response", source, `unexpected result code ${code}`);
}

export interface DataPortalOptions {
  source: string;
  timeoutMs?: number;
  retries?: number;
  revalidateSeconds?: number;
}

/**
 * Calls `/{servicePath}/{operation}` with the shared service key + params, checks
 * the result code, and returns the item list (always an array, `[]` on NODATA).
 */
export async function dataPortalGet<TItem = Record<string, unknown>>(
  servicePath: string,
  operation: string,
  params: Record<string, string | number | undefined>,
  opts: DataPortalOptions,
): Promise<TItem[]> {
  const key = serverEnv.dataPortalServiceKey;
  if (!key) {
    throw new ExternalApiError(
      "auth",
      opts.source,
      "data.go.kr service key is not configured (TOUR_API_KEY_MAIN)",
    );
  }

  // env holds the URL-encoded ("Encoding") key; decode once, buildQuery re-encodes.
  const serviceKey = decodeURIComponent(key);
  const qs = buildQuery({ serviceKey, _type: "json", ...params });
  const url = `${BASE}/${servicePath}/${operation}?${qs}`;

  let body: unknown;
  try {
    body = await fetchJson<unknown>(url, {
      source: opts.source,
      timeoutMs: opts.timeoutMs,
      retries: opts.retries,
      revalidateSeconds: opts.revalidateSeconds,
    });
  } catch (e) {
    // data.go.kr commonly answers auth/quota errors as HTTP 200 with an XML body,
    // which fetchJson surfaces as bad_response — re-classify from the XML code.
    if (e instanceof ExternalApiError && e.kind === "bad_response") {
      const xml = await fetch(url).then((r) => r.text()).catch(() => "");
      const m = xml.match(/<returnReasonCode>(\d+)<\/returnReasonCode>/);
      if (m) {
        const cls = classifyResultCode(m[1], opts.source);
        if (cls instanceof ExternalApiError) throw cls;
      }
    }
    throw e;
  }

  const header = (body as { response?: { header?: { resultCode?: string } } })?.response
    ?.header;
  const code = header?.resultCode;
  if (typeof code !== "string") {
    throw new ExternalApiError("bad_response", opts.source, "missing response.header.resultCode");
  }
  const cls = classifyResultCode(code, opts.source);
  if (cls instanceof ExternalApiError) throw cls;
  if (cls === "nodata") return [];

  const items = (body as { response?: { body?: { items?: unknown } } }).response?.body?.items;
  if (items === "" || items == null) return []; // some ops return "" for no results
  const item = (items as { item?: unknown }).item;
  if (item == null) return [];
  return (Array.isArray(item) ? item : [item]) as TItem[];
}
