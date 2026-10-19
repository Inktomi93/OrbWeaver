// Native Query decodes JSON, but does not validate the fields this application's reducers consume.
// Unused frames and fields stay opaque; known projections refuse before arithmetic, callbacks or accounting.
import { generationUsageLegSchema, generationUsageSchema } from "@orb/contracts/inference";
import { z } from "zod";
import { compactionTriggerSchema, compactResultSchema, ProviderError } from "#contract";
import { assertInitFrameShape } from "./verify.ts";

const tokenCount = generationUsageSchema.shape.tokensIn.unwrap();
const cost = generationUsageSchema.shape.costUsd.unwrap();
const headerSchema = z.object({ type: z.string(), subtype: z.string().optional(), session_id: z.string().optional() });
const blockHeaderSchema = z.object({ type: z.string() });
const textBlockSchema = z.object({ text: z.string() });
const thinkingBlockSchema = z.object({ thinking: z.string() });
const toolBlockSchema = z.object({ id: z.string(), name: z.string(), input: z.unknown() });
const assistantSchema = z.object({
  message: z.object({ stop_reason: z.string().nullish(), content: z.array(z.unknown()) }),
  error: z.string().optional(),
  request_id: z.string().optional(),
});
const resultSchema = z.object({
  subtype: z.string(),
  is_error: z.boolean(),
  num_turns: generationUsageLegSchema.shape.modelCalls.unwrap(),
  terminal_reason: z.string().optional(),
  stop_reason: z.string().nullish(),
  total_cost_usd: cost,
  usage: z.object({
    input_tokens: tokenCount.optional(),
    output_tokens: tokenCount.optional(),
    cache_read_input_tokens: tokenCount.optional(),
    cache_creation_input_tokens: tokenCount.optional(),
    cache_creation: z.object({ ephemeral_5m_input_tokens: tokenCount, ephemeral_1h_input_tokens: tokenCount }).optional(),
  }),
  modelUsage: z.record(
    z.string(),
    z.object({
      inputTokens: tokenCount,
      outputTokens: tokenCount,
      costUSD: cost,
      webSearchRequests: tokenCount,
      contextWindow: generationUsageLegSchema.shape.contextWindow.unwrap(),
      maxOutputTokens: generationUsageLegSchema.shape.maxOutputTokens.unwrap(),
    }),
  ),
  permission_denials: z.array(z.object({ tool_name: z.string() })).optional(),
});
const successfulResultSchema = z.object({
  result: z.string(),
  ttft_ms: generationUsageLegSchema.shape.ttftMs.unwrap().optional(),
  duration_api_ms: generationUsageLegSchema.shape.durationApiMs.unwrap(),
  api_error_status: z.number().optional(),
  warm_spare_claimed: z.boolean().optional(),
});
const failedResultSchema = z.object({ errors: z.array(z.string()) });
const compactBoundarySchema = z.object({
  compact_metadata: z.object({
    trigger: compactionTriggerSchema,
    pre_tokens: tokenCount,
    post_tokens: tokenCount.optional(),
    duration_ms: z.number().optional(),
  }),
});
const retrySchema = z.object({
  error: z.string(),
  attempt: z.number(),
  max_retries: z.number(),
  retry_delay_ms: z.number(),
  error_status: z.number().nullable(),
});
const statusSchema = z.object({ status: z.string().nullish(), compact_result: compactResultSchema.optional(), compact_error: z.string().optional() });
const thinkingTokensSchema = z.object({ estimated_tokens: tokenCount });
const refusalSchema = z.object({ original_model: z.string(), api_refusal_category: z.string().nullish(), api_refusal_explanation: z.string().nullish() });
const fallbackSchema = z.object({ fallback_model: z.string() });
const initModelSchema = z.object({ model: z.string() });
const rateLimitSchema = z.object({
  rate_limit_info: z.object({
    status: z.string(),
    rateLimitType: z.string().optional(),
    resetsAt: z.number().optional(),
    utilization: z.number().optional(),
    isUsingOverage: z.boolean().optional(),
    surpassedThreshold: z.number().optional(),
    overageStatus: z.string().optional(),
    overageResetsAt: z.number().optional(),
    overageDisabledReason: z.string().optional(),
    errorCode: z.string().optional(),
  }),
});
const authStatusSchema = z.object({ isAuthenticating: z.boolean(), error: z.string().optional() });
const streamEventSchema = z.object({ event: z.object({ type: z.string(), delta: z.unknown().optional() }) });
const deltaHeaderSchema = z.object({ type: z.string() });
const messageDeltaSchema = z.object({ stop_reason: z.string().nullish() });

function readAssistant(message: unknown): void {
  const parsed = assistantSchema.parse(message);
  for (const block of parsed.message.content) {
    const header = blockHeaderSchema.parse(block);
    if (header.type === "text") {
      textBlockSchema.parse(block);
    } else if (header.type === "thinking") {
      thinkingBlockSchema.parse(block);
    } else if (header.type === "tool_use") {
      toolBlockSchema.parse(block);
    }
  }
}

function readSystem(message: unknown, subtype: string | undefined): void {
  switch (subtype) {
    case "init":
      assertInitFrameShape(message);
      initModelSchema.parse(message);
      break;
    case "compact_boundary":
      compactBoundarySchema.parse(message);
      break;
    case "api_retry":
      retrySchema.parse(message);
      break;
    case "status":
      statusSchema.parse(message);
      break;
    case "thinking_tokens":
      thinkingTokensSchema.parse(message);
      break;
    case "model_refusal_fallback":
      refusalSchema.parse(message);
      fallbackSchema.parse(message);
      break;
    case "model_refusal_no_fallback":
      refusalSchema.parse(message);
      break;
    case undefined:
    default:
      return;
  }
}

function readStreamEvent(message: unknown): void {
  const { event } = streamEventSchema.parse(message);
  if (event.type === "message_delta") {
    messageDeltaSchema.parse(event.delta);
  } else if (event.type === "content_block_delta") {
    const delta = deltaHeaderSchema.parse(event.delta);
    if (delta.type === "text_delta") {
      textBlockSchema.parse(event.delta);
    } else if (delta.type === "thinking_delta") {
      thinkingBlockSchema.parse(event.delta);
    }
  }
}

/** Validate only the SDK message fields the application's stream consumers actually read. */
export function assertSdkMessageRead(message: unknown): void {
  try {
    const header = headerSchema.parse(message);
    switch (header.type) {
      case "assistant":
        readAssistant(message);
        break;
      case "system":
        readSystem(message, header.subtype);
        break;
      case "result": {
        const result = resultSchema.parse(message);
        if (result.subtype === "success") {
          successfulResultSchema.parse(message);
        } else {
          failedResultSchema.parse(message);
        }
        break;
      }
      case "stream_event":
        readStreamEvent(message);
        break;
      case "rate_limit_event":
        rateLimitSchema.parse(message);
        break;
      case "auth_status":
        authStatusSchema.parse(message);
        break;
    }
    return;
  } catch (cause) {
    if (!(cause instanceof z.ZodError)) {
      throw cause;
    }
  }
  // Schema issues contain untrusted property paths; a raw cause would expose those bytes through error serializers.
  throw new ProviderError({ kind: "server", retryable: true, message: "agent-sdk: malformed external message fields" });
}
