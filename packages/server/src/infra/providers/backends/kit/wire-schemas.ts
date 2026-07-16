// Lenient zod parses for the OpenAI-compatible wire shapes (chat-completions + Responses API) at the HTTP
// boundary — a breaking upstream shape change throws at parse time, not on a downstream `undefined` access.
// Matches the OpenRouter SDK's camelCase return, not the raw socket. Schemas are file-local; the consumed
// surfaces are authored as interfaces kept field-for-field with them.

import { z } from "zod";

const chatReasoningDetailSchema = z.object({ type: z.string().optional(), text: z.string().nullable().optional() }).loose();

const chatCompletionResultSchema = z
  .object({
    id: z.string().optional(),
    choices: z
      .array(
        z
          .object({
            message: z
              .object({
                content: z.unknown(),
                reasoning: z.string().nullable().optional(),
                reasoningDetails: z.array(chatReasoningDetailSchema).nullable().optional(),
                toolCalls: z
                  .array(
                    z
                      .object({
                        id: z.string(),
                        function: z.object({ name: z.string(), arguments: z.string() }).loose(),
                      })
                      .loose(),
                  )
                  .optional(),
              })
              .loose()
              .optional(),
            finishReason: z.string().nullable().optional(),
          })
          .loose(),
      )
      .optional(),
    usage: z
      .object({
        promptTokens: z.number().optional(),
        completionTokens: z.number().optional(),
        cost: z.number().nullable().optional(),
        costDetails: z
          .object({
            upstreamInferenceCost: z.number().optional(),
            upstreamInferencePromptCost: z.number().optional(),
            upstreamInferenceCompletionsCost: z.number().optional(),
          })
          .loose()
          .nullable()
          .optional(),
        promptTokensDetails: z
          .object({
            cachedTokens: z.number().optional(),
            cacheWriteTokens: z.number().optional(),
          })
          .loose()
          .nullable()
          .optional(),
        completionTokensDetails: z.object({ reasoningTokens: z.number().optional() }).loose().nullable().optional(),
        isByok: z.boolean().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

const responsesResultSchema = z
  .object({
    output: z
      .array(
        z
          .object({
            type: z.string(),
            content: z.array(z.object({ type: z.string(), text: z.string().optional() }).loose()).optional(),
          })
          .loose(),
      )
      .optional(),
    outputText: z.string().optional(),
    status: z.string().optional(),
    incompleteDetails: z.object({ reason: z.string().optional() }).loose().nullable().optional(),
    usage: z
      .object({
        inputTokens: z.number().optional(),
        outputTokens: z.number().optional(),
        cost: z.number().nullable().optional(),
        costDetails: z
          .object({
            upstreamInferenceCost: z.number().optional(),
            upstreamInferenceInputCost: z.number().optional(),
            upstreamInferenceOutputCost: z.number().optional(),
          })
          .loose()
          .nullable()
          .optional(),
        inputTokensDetails: z.object({ cachedTokens: z.number().optional() }).loose().optional(),
        outputTokensDetails: z.object({ reasoningTokens: z.number().optional() }).loose().optional(),
        isByok: z.boolean().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

export interface ChatReasoningDetail {
  readonly type?: string | undefined;
  readonly text?: string | null | undefined;
}

export interface ChatCompletionCostDetails {
  readonly upstreamInferenceCost?: number | undefined;
  readonly upstreamInferencePromptCost?: number | undefined;
  readonly upstreamInferenceCompletionsCost?: number | undefined;
}

export interface ChatPromptTokensDetails {
  readonly cachedTokens?: number | undefined;
  readonly cacheWriteTokens?: number | undefined;
}
export interface ChatCompletionTokensDetails {
  readonly reasoningTokens?: number | undefined;
}

export interface ChatCompletionUsage {
  readonly promptTokens?: number | undefined;
  readonly completionTokens?: number | undefined;
  readonly cost?: number | null | undefined;
  readonly costDetails?: ChatCompletionCostDetails | null | undefined;
  readonly promptTokensDetails?: ChatPromptTokensDetails | null | undefined;
  readonly completionTokensDetails?: ChatCompletionTokensDetails | null | undefined;
  readonly isByok?: boolean | undefined;
}

export interface ChatMessageToolCall {
  readonly id: string;
  readonly function: { readonly name: string; readonly arguments: string };
}

// `content` is unknown (string OR content-parts).
export interface ChatCompletionMessage {
  readonly content?: unknown;
  readonly reasoning?: string | null | undefined;
  readonly reasoningDetails?: readonly ChatReasoningDetail[] | null | undefined;
  readonly toolCalls?: readonly ChatMessageToolCall[] | undefined;
}

export interface ChatCompletionChoice {
  readonly message?: ChatCompletionMessage | undefined;
  readonly finishReason?: string | null | undefined;
}

export interface ChatCompletionResult {
  readonly id?: string | undefined;
  readonly choices?: readonly ChatCompletionChoice[] | undefined;
  readonly usage?: ChatCompletionUsage | undefined;
}

export interface ResponsesCostDetails {
  readonly upstreamInferenceCost?: number | undefined;
  readonly upstreamInferenceInputCost?: number | undefined;
  readonly upstreamInferenceOutputCost?: number | undefined;
}
export interface ResponsesUsage {
  readonly inputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly cost?: number | null | undefined;
  readonly costDetails?: ResponsesCostDetails | null | undefined;
  readonly inputTokensDetails?: { readonly cachedTokens?: number | undefined } | undefined;
  readonly outputTokensDetails?: { readonly reasoningTokens?: number | undefined } | undefined;
  readonly isByok?: boolean | undefined;
}
export interface ResponsesOutputContent {
  readonly type: string;
  readonly text?: string | undefined;
}
export interface ResponsesOutputItem {
  readonly type: string;
  readonly content?: readonly ResponsesOutputContent[] | undefined;
}
export interface ResponsesResult {
  readonly output?: readonly ResponsesOutputItem[] | undefined;
  readonly outputText?: string | undefined;
  readonly status?: string | undefined;
  readonly incompleteDetails?: { readonly reason?: string | undefined } | null | undefined;
  readonly usage?: ResponsesUsage | undefined;
}

// `arguments` arrive sliced mid-token across fragments keyed by `index`; the reducer latches `id`/`name`
// on first sight and string-concatenates `arguments` — never an incremental JSON parse.
export interface ChatToolCallDelta {
  readonly index: number;
  readonly id?: string | undefined;
  readonly function?: { readonly name?: string | undefined; readonly arguments?: string | undefined } | undefined;
}

export interface ChatCompletionStreamDelta {
  readonly content?: string | null | undefined;
  readonly reasoning?: string | null | undefined;
  readonly reasoningDetails?: readonly ChatReasoningDetail[] | null | undefined;
  readonly toolCalls?: readonly ChatToolCallDelta[] | undefined;
}
export interface ChatCompletionStreamChoice {
  readonly delta?: ChatCompletionStreamDelta | undefined;
  readonly finishReason?: string | null | undefined;
}
export interface ChatCompletionStreamChunk {
  readonly choices: readonly ChatCompletionStreamChoice[];
  /** The upstream generation handle (`gen-…`), stamped on every chunk of the stream; the reducer latches
   *  it once for the per-message cost key (PD-137). */
  readonly id?: string | undefined;
  readonly error?: { readonly code: number; readonly message: string } | null | undefined;
  readonly usage?: ChatCompletionUsage | undefined;
}

export interface ResponsesStreamEvent {
  readonly type: string;
  readonly delta?: string | undefined;
  readonly response?:
    | {
        readonly status?: string | undefined;
        readonly incompleteDetails?: { readonly reason?: string | undefined } | null | undefined;
        readonly usage?: ResponsesUsage | undefined;
        readonly error?: { readonly code: number | string | null; readonly message: string } | null | undefined;
      }
    | undefined;
  readonly code?: string | null | undefined;
  readonly message?: string | undefined;
}

export function parseChatCompletionResult(raw: unknown): ChatCompletionResult {
  return chatCompletionResultSchema.parse(raw);
}

export function parseResponsesResult(raw: unknown): ResponsesResult {
  return responsesResultSchema.parse(raw);
}

export function extractChatReply(view: ChatCompletionResult): string {
  const content = view.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type?: string; text?: string } => part !== null && typeof part === "object")
      .map((part): string => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
}

// Skips `reasoning.encrypted` entries (opaque continuity blocks with no display text).
function collectReasoningDetailsText(details: readonly ChatReasoningDetail[] | null | undefined): string {
  if (!Array.isArray(details)) {
    return "";
  }
  let out = "";
  for (const detail of details) {
    if (detail.type === "reasoning.encrypted") {
      continue;
    }
    if (typeof detail.text === "string" && detail.text.length > 0) {
      out += detail.text;
    }
  }
  return out;
}

export function extractChatReasoning(view: ChatCompletionResult): string {
  const message = view.choices?.[0]?.message;
  const detailsText = collectReasoningDetailsText(message?.reasoningDetails);
  if (detailsText.length > 0) {
    return detailsText;
  }
  return typeof message?.reasoning === "string" ? message.reasoning : "";
}

export { collectReasoningDetailsText };
