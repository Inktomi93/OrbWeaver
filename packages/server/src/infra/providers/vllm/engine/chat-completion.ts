// The gen engine's one non-streaming text-gen wire seam — role-agnostic OpenAI chat-completions core that
// gen-engine consumers (summarize, etc.) shape requests onto. Lives at engine-level since a surface may
// not import a sibling surface. Vision messages carry `images` as `image_url` data-URI content parts.

import type { ImageInput, RepetitionDetection, ResponseFormat } from "@orb/contracts/role-clients";
import { scrubWireSchema } from "@orb/kit/json-schema";
import type { MessageRole } from "@orb/kit/message-role";
import type { VllmEngineClient } from "./client.ts";
import { toDataUri } from "./image.ts";

export interface VllmChatMessage {
  readonly role: MessageRole;
  readonly text: string;
  readonly images?: readonly ImageInput[] | undefined;
}

export interface VllmChatCompletionRequest {
  readonly model: string;
  readonly messages: readonly VllmChatMessage[];
  readonly maxTokens?: number | undefined;
  readonly temperature?: number | undefined;
  /** Nucleus top-p. */
  readonly topP?: number | undefined;
  /** Top-k truncation. */
  readonly topK?: number | undefined;
  /** OpenAI-style frequency penalty. */
  readonly frequencyPenalty?: number | undefined;
  /** OpenAI-style presence penalty — the summarize loop-guard for repetition_penalty=1.0 models (Qwen3-VL). */
  readonly presencePenalty?: number | undefined;
  /** Multiplicative repetition penalty (1 = no penalty). */
  readonly repetitionPenalty?: number | undefined;
  /** Min-p nucleus floor — trims the low-probability tail. */
  readonly minP?: number | undefined;
  /** Structured output (D79) — vLLM enforces via guided decoding; `cleanJsonSchema` strips the annotations a
   *  strict endpoint chokes on (the vLLM-internal quirk, never a second projection rule). */
  readonly responseFormat?: ResponseFormat | undefined;
  /** N-gram repetition guard — stops a degenerate loop before `maxTokens`. */
  readonly repetitionDetection?: RepetitionDetection | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface VllmChatCompletionResult {
  readonly text: string;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  /** The engine's `choices[0].finish_reason` (stop/length/tool_calls/…), or null when absent — surfaced so
   *  the summarize surface can log the turn's stop reason (observability parity with the chat surfaces). */
  readonly finishReason: string | null;
}

/** The GUIDED-DECODING wire copy: drop the annotation keywords a strict structured-output endpoint chokes on
 *  (title/default/examples/$schema/$id) and pin `additionalProperties:false` on every object so the model
 *  can't emit stray keys. enum/minItems/maxItems/minimum/required are KEPT — xgrammar compiles them into the
 *  grammar and the populate lever relies on it (the exact opposite of the hosted wires, which refuse bounds).
 *  The walk is the ONE shared engine (`scrubWireSchema`, kit); this call site owns only the MODE. */
export function cleanJsonSchema<T>(schema: T): T {
  return scrubWireSchema(schema as Record<string, unknown>, "guided-decoding").schema as T;
}

type ContentPart = { readonly type: "text"; readonly text: string } | { readonly type: "image_url"; readonly image_url: { readonly url: string } };

async function toWireMessage(m: VllmChatMessage): Promise<{ role: string; content: string | ContentPart[] }> {
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

function repetitionBlock(rd: RepetitionDetection): Record<string, number> {
  // biome-ignore-start lint/style/useNamingConvention: vLLM wire field names (snake_case).
  return {
    max_pattern_size: rd.maxPatternSize,
    min_pattern_size: rd.minPatternSize ?? MIN_PATTERN_DEFAULT,
    min_count: rd.minCount,
  };
  // biome-ignore-end lint/style/useNamingConvention: vLLM wire field names (snake_case).
}

interface ChatCompletionsUsage {
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
}
interface ChatCompletionsResponse {
  readonly choices: ReadonlyArray<{ readonly message: { readonly content: string | null }; readonly finish_reason?: string | null }>;
  readonly usage?: ChatCompletionsUsage | undefined;
}

function buildBody(req: VllmChatCompletionRequest, messages: unknown): Record<string, unknown> {
  // biome-ignore-start lint/style/useNamingConvention: OpenAI/vLLM wire field names (snake_case).
  return {
    model: req.model,
    messages,
    ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.topP !== undefined ? { top_p: req.topP } : {}),
    ...(req.topK !== undefined ? { top_k: req.topK } : {}),
    ...(req.frequencyPenalty !== undefined ? { frequency_penalty: req.frequencyPenalty } : {}),
    ...(req.presencePenalty !== undefined ? { presence_penalty: req.presencePenalty } : {}),
    ...(req.repetitionPenalty !== undefined ? { repetition_penalty: req.repetitionPenalty } : {}),
    ...(req.minP !== undefined ? { min_p: req.minP } : {}),
    ...(req.repetitionDetection !== undefined ? { repetition_detection: repetitionBlock(req.repetitionDetection) } : {}),
    ...(req.responseFormat !== undefined
      ? {
          response_format: {
            type: "json_schema",
            json_schema: { name: req.responseFormat.name, schema: cleanJsonSchema(req.responseFormat.schema) },
          },
        }
      : {}),
  };
  // biome-ignore-end lint/style/useNamingConvention: OpenAI/vLLM wire field names (snake_case).
}

/** `onWireBody` fires with the LITERAL /v1/chat/completions body right before it goes on the wire — the
 *  summarize surface threads its `captureWire` sink through it (parity with the chat surface's capture),
 *  gated by WIRE_CAPTURE at the compose root. Absent ⇒ no capture, zero cost. */
export async function runVllmChatCompletion(
  client: VllmEngineClient,
  req: VllmChatCompletionRequest,
  onWireBody?: (body: Record<string, unknown>) => void,
): Promise<VllmChatCompletionResult> {
  const messages = await Promise.all(req.messages.map(toWireMessage));
  const body = buildBody(req, messages);
  onWireBody?.(body);
  const response = await client.enginePost<ChatCompletionsResponse>("gen", "/v1/chat/completions", body, req.signal);
  return {
    text: response.choices[0]?.message.content ?? "",
    tokensIn: response.usage?.prompt_tokens ?? null,
    tokensOut: response.usage?.completion_tokens ?? null,
    finishReason: response.choices[0]?.finish_reason ?? null,
  };
}
