// infra/providers/vllm/engine/chat-completion — the gen engine's ONE non-streaming text-gen wire seam.
//
// The gen engine (Qwen3-VL-8B by default) is a general VL chat model, not a summarizer: this is the
// role-agnostic OpenAI chat-completions core that gen-engine consumers SHAPE requests onto (summarize
// today; caption passes / future batch roles later). Roles own their request shapes; THIS owns the wire.
//
// WHY ENGINE-LEVEL (not a surface): the summarize surface shapes onto it, and a surface may not import a
// sibling surface (`vllm-surface-isolation`). The shared wire core therefore lives DOWN in engine/, and
// summarize reaches it the one legal direction. (The STREAMING chat surface calls the engine directly to
// drive SSE — it does NOT go through this module.)
//
// VISION: a message may carry `images` — sent as `image_url` data-URI content parts before the text in that
// turn (the standard Qwen3-VL chat shape; the engine's processor resizes/normalizes server-side, capped by
// the serve-time `--mm-processor-kwargs max_pixels`). `jsonSchema` rides OpenAI `response_format:
// {type:"json_schema"}` — vLLM implements it via guided decoding, so structured output holds without
// client-side parsing heroics.

import type { ImageInput, RepetitionDetection } from "@orb/contracts/role-clients";
import type { MessageRole } from "@orb/kit/message-role";
import type { VllmEngineClient } from "./client";
import { toDataUri } from "./image";

/** One gen-engine turn message. Vision turns carry `images` (bytes or a filesystem path). `role` is the
 *  canonical `MessageRole` (one home — no inline re-spell of the MESSAGE_ROLES tuple). */
export interface VllmChatMessage {
  readonly role: MessageRole;
  readonly text: string;
  readonly images?: readonly ImageInput[] | undefined;
}

/** A request shaped onto the gen chat-completions wire. Concurrency is the CALLER's policy (the surface
 *  owns the bounded-worker fan-out feeding vLLM's continuous batcher). */
export interface VllmChatCompletionRequest {
  readonly model: string;
  readonly messages: readonly VllmChatMessage[];
  readonly maxTokens?: number | undefined;
  readonly temperature?: number | undefined;
  /** Min-p nucleus floor — trims the low-probability tail. */
  readonly minP?: number | undefined;
  /** JSON Schema for constrained output (vLLM enforces via guided decoding). */
  readonly jsonSchema?: object | undefined;
  /** N-gram repetition guard — stops a degenerate loop before `maxTokens`. */
  readonly repetitionDetection?: RepetitionDetection | undefined;
  readonly signal?: AbortSignal | undefined;
}

/** The completion text plus token usage (null when the engine didn't report). */
export interface VllmChatCompletionResult {
  readonly text: string;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
}

// JSON-Schema annotation keywords a strict structured-output endpoint chokes on (dropped on clone);
// enum/minItems/maxItems/required are KEPT — vLLM guided decoding enforces them and we rely on it.
const SCHEMA_ANNOTATIONS = new Set<string>(["title", "default", "examples", "$schema", "$id"]);

/** Strip annotation-only JSON-Schema keywords and pin `additionalProperties:false` on every object so the
 *  model can't emit stray keys. Rebuilds (never mutates input, never `delete`s). */
export function cleanJsonSchema<T>(schema: T): T {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node === null || typeof node !== "object") {
      return node;
    }
    const obj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (!SCHEMA_ANNOTATIONS.has(key)) {
        obj[key] = walk(value);
      }
    }
    const isObjectType =
      obj["type"] === "object" &&
      obj["properties"] !== undefined &&
      !("additionalProperties" in obj);
    if (isObjectType) {
      obj["additionalProperties"] = false;
    }
    return obj;
  };
  return walk(schema) as T;
}

// One wire content part — a text part, or an image as a data-URI `image_url`.
type ContentPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image_url"; readonly image_url: { readonly url: string } };

// Text-only turns keep the plain-string content shape; image turns switch to the parts array (image first).
async function toWireMessage(
  m: VllmChatMessage,
): Promise<{ role: string; content: string | ContentPart[] }> {
  if (m.images === undefined || m.images.length === 0) {
    return { role: m.role, content: m.text };
  }
  const parts: ContentPart[] = await Promise.all(
    m.images.map(async (img) => ({
      type: "image_url" as const,
      image_url: { url: await toDataUri(img) },
    })),
  );
  parts.push({ type: "text", text: m.text });
  return { role: m.role, content: parts };
}

const MIN_PATTERN_DEFAULT = 1;

// Build the repetition-detection wire block (snake_case) when the caller asked for it.
function repetitionBlock(rd: RepetitionDetection): Record<string, number> {
  // biome-ignore-start lint/style/useNamingConvention: vLLM wire field names (snake_case).
  return {
    max_pattern_size: rd.maxPatternSize,
    min_pattern_size: rd.minPatternSize ?? MIN_PATTERN_DEFAULT,
    min_count: rd.minCount,
  };
  // biome-ignore-end lint/style/useNamingConvention: vLLM wire field names (snake_case).
}

// One non-streaming chat-completions response (the fields we read; the rest is ignored).
interface ChatCompletionsUsage {
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
}
interface ChatCompletionsResponse {
  readonly choices: ReadonlyArray<{ readonly message: { readonly content: string | null } }>;
  readonly usage?: ChatCompletionsUsage | undefined;
}

// Assemble the snake_case wire body (sampling + the vLLM extensions + optional guided decoding).
function buildBody(req: VllmChatCompletionRequest, messages: unknown): Record<string, unknown> {
  // biome-ignore-start lint/style/useNamingConvention: OpenAI/vLLM wire field names (snake_case).
  return {
    model: req.model,
    messages,
    ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.minP !== undefined ? { min_p: req.minP } : {}),
    ...(req.repetitionDetection !== undefined
      ? { repetition_detection: repetitionBlock(req.repetitionDetection) }
      : {}),
    ...(req.jsonSchema !== undefined
      ? {
          response_format: {
            type: "json_schema",
            json_schema: { name: "result", schema: cleanJsonSchema(req.jsonSchema) },
          },
        }
      : {}),
  };
  // biome-ignore-end lint/style/useNamingConvention: OpenAI/vLLM wire field names (snake_case).
}

/** One chat completion against the gen engine (via the injected client). */
export async function runVllmChatCompletion(
  client: VllmEngineClient,
  req: VllmChatCompletionRequest,
): Promise<VllmChatCompletionResult> {
  const messages = await Promise.all(req.messages.map(toWireMessage));
  const response = await client.enginePost<ChatCompletionsResponse>(
    "gen",
    "/v1/chat/completions",
    buildBody(req, messages),
    req.signal,
  );
  return {
    text: response.choices[0]?.message.content ?? "",
    tokensIn: response.usage?.prompt_tokens ?? null,
    tokensOut: response.usage?.completion_tokens ?? null,
  };
}
