/**
 * OpenAI Chat Completions (api.openai.com) — the only place this project
 * calls an LLM. Returns raw text; the CALLER (features/replan/explanation)
 * is responsible for parsing + validating it against its own schema. This
 * adapter makes no judgement about content — it is not a decision-maker,
 * only a text-generation transport (see features/replan/explanation).
 *
 * SERVER ONLY — the key never leaves the server (config/env.ts's
 * `serverEnv.llmApiKey`, never `NEXT_PUBLIC_`).
 */
import "server-only";

import { serverEnv } from "@/config/env";

import { fetchJson } from "../api/http";
import { ExternalApiError } from "../api/errors";

const BASE = "https://api.openai.com/v1/chat/completions";
const SOURCE = "llm/openai";
/** Small, cheap, JSON-mode-capable model — explanation text generation only, never a decision. */
const MODEL = "gpt-4o-mini";
const DEFAULT_MAX_OUTPUT_TOKENS = 500;

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

export interface JsonCompletionParams {
  /** instructions ONLY — no untrusted data belongs here (see explanation/explanationService.ts). */
  system: string;
  /** the structured facts payload, sent as data, not instructions. */
  user: string;
  maxOutputTokens?: number;
}

/**
 * One request, JSON-mode response. Throws `ExternalApiError` on any failure
 * (missing key, network, timeout, non-2xx, empty completion) — the caller
 * (features/replan/explanation/explanationService.ts) is expected to catch
 * this and fall back; it is NEVER allowed to fail a Re:Plan Preview.
 */
export async function generateJsonCompletion(params: JsonCompletionParams): Promise<string> {
  const key = serverEnv.llmApiKey;
  if (!key) throw new ExternalApiError("auth", SOURCE, "LLM_API_KEY is not configured");

  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: params.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  });

  const res = await fetchJson<ChatCompletionResponse>(BASE, {
    source: SOURCE,
    method: "POST",
    body,
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    timeoutMs: 8000,
    retries: 1,
  });

  const content = res.choices?.[0]?.message?.content;
  if (!content) throw new ExternalApiError("bad_response", SOURCE, "empty completion");
  return content;
}
