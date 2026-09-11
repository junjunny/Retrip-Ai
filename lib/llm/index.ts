/**
 * lib/llm — external-service adapter. All LLM network calls live here so
 * pages / features never talk to the external API directly (STEP 11).
 */
export { generateJsonCompletion } from "./openai";
export type { JsonCompletionParams } from "./openai";
