// The gen engine's one non-streaming text-gen wire seam — role-agnostic OpenAI chat-completions core that
// gen-engine consumers (summarize, etc.) shape requests onto. Lives at engine-level since a surface may
// not import a sibling surface. Vision messages carry `images` as `image_url` data-URI content parts.

import type { ImageInput, RepetitionDetection } from "@orb/contracts/role-clients";
import type { MessageRole } from "@orb/kit/message-role";
import type { VllmEngineClient } from "./client";
import { toDataUri } from "./image";

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
  /** Min-p nucleus floor — trims the low-probability tail. */
  readonly minP?: number | undefined;
  /** JSON Schema for constrained output (vLLM enforces via guided decoding). */
  readonly jsonSchema?: object | undefined;
  /** N-gram repetition guard — stops a degenerate loop before `maxTokens`. */
  readonly repetitionDetection?: RepetitionDetection | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface VllmChatCompletionResult {
  readonly text: string;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
}

// JSON-Schema annotation keywords a strict structured-output endpoint chokes on (dropped on clone);
// enum/minItems/maxItems/required are KEPT — vLLM guided decoding enforces them and we rely on it.
const SCHEMA_ANNOTATIONS = new Set<string>(["title", "default", "examples", "$schema", "$id"]);

// Pins additionalProperties:false on every object so the model can't emit stray keys.
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
    const isObjectType = obj["type"] === "object" && obj["properties"] !== undefined && !("additionalProperties" in obj);
    if (isObjectType) {
      obj["additionalProperties"] = false;
    }
    return obj;
  };
  return walk(schema) as T;
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
  readonly choices: ReadonlyArray<{ readonly message: { readonly content: string | null } }>;
  readonly usage?: ChatCompletionsUsage | undefined;
}

function buildBody(req: VllmChatCompletionRequest, messages: unknown): Record<string, unknown> {
  // biome-ignore-start lint/style/useNamingConvention: OpenAI/vLLM wire field names (snake_case).
  return {
    model: req.model,
    messages,
    ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.minP !== undefined ? { min_p: req.minP } : {}),
    ...(req.repetitionDetection !== undefined ? { repetition_detection: repetitionBlock(req.repetitionDetection) } : {}),
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

export async function runVllmChatCompletion(client: VllmEngineClient, req: VllmChatCompletionRequest): Promise<VllmChatCompletionResult> {
  const messages = await Promise.all(req.messages.map(toWireMessage));
  const response = await client.enginePost<ChatCompletionsResponse>("gen", "/v1/chat/completions", buildBody(req, messages), req.signal);
  return {
    text: response.choices[0]?.message.content ?? "",
    tokensIn: response.usage?.prompt_tokens ?? null,
    tokensOut: response.usage?.completion_tokens ?? null,
  };
}
