// infra/providers/backends/kit/wire-schemas — lenient zod parses for the OpenAI-compatible wire shapes
// (chat-completions + the Responses API) at the HTTP boundary. The §7.3 "zod-parse-at-the-wire" pattern:
// a breaking upstream shape change throws at PARSE time, not on a downstream `undefined` access deep in a
// runner. `.loose()` keeps unknown fields rather than narrowing them away.
//
// SHAPE NOTE: these match the OpenRouter SDK's CAMELCASE return (the SDK transforms the raw snake_case
// wire), NOT the raw socket. Raw-socket SSE (custom-byo / a non-SDK fetch) is reshaped into the chunk
// shape by the runner before it reaches the reducer — see `openai-compat/stream.ts`.
//
// GATE NOTE (no-inline-types): exported `type`/`z.object` aliases may not live outside a type home. So the
// schemas are FILE-LOCAL (parse FUNCTIONS are the public runtime surface) and the consumed surfaces are
// authored as `interface`s (which the gate permits) — kept field-for-field with the schemas below.
// Stream-chunk/event shapes are TS-only structural types (never runtime-parsed — per-token zod overhead is
// real), so they have no schema, only an interface.

import { z } from "zod";

// ── chat-completions result ──────────────────────────────────────────────────────────────────────
// Nullability policy (audited against OR's real shapes): `cost` is nullable (BYOK/unprivileged) +
// optional (absent until the [DONE] sentinel). `finishReason` is nullable (intermediate chunks) +
// optional. `costDetails`/token-detail containers are nullable+optional; their numeric subfields are
// `.optional()` only (a count of `null` is meaningless — 0 = "no cache", absent = "not reported").
const chatReasoningDetailSchema = z
  .object({ type: z.string().optional(), text: z.string().nullable().optional() })
  .loose();

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
        completionTokensDetails: z
          .object({ reasoningTokens: z.number().optional() })
          .loose()
          .nullable()
          .optional(),
        isByok: z.boolean().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

// ── responses (beta) result ──────────────────────────────────────────────────────────────────────
const responsesResultSchema = z
  .object({
    output: z
      .array(
        z
          .object({
            type: z.string(),
            content: z
              .array(z.object({ type: z.string(), text: z.string().optional() }).loose())
              .optional(),
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
        outputTokensDetails: z
          .object({ reasoningTokens: z.number().optional() })
          .loose()
          .optional(),
        isByok: z.boolean().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

// ── The consumed surfaces (authored interfaces, mirroring the schemas above) ───────────────────────

/** One human-readable / encrypted CoT entry on `message.reasoningDetails`. */
export interface ChatReasoningDetail {
  readonly type?: string | undefined;
  readonly text?: string | null | undefined;
}

/** Per-phase upstream cost breakdown (chat-completions usage). */
export interface ChatCompletionCostDetails {
  readonly upstreamInferenceCost?: number | undefined;
  readonly upstreamInferencePromptCost?: number | undefined;
  readonly upstreamInferenceCompletionsCost?: number | undefined;
}

/** Token-detail containers on chat-completions usage. */
export interface ChatPromptTokensDetails {
  readonly cachedTokens?: number | undefined;
  readonly cacheWriteTokens?: number | undefined;
}
export interface ChatCompletionTokensDetails {
  readonly reasoningTokens?: number | undefined;
}

/** Usage accounting on a chat-completions view. */
export interface ChatCompletionUsage {
  readonly promptTokens?: number | undefined;
  readonly completionTokens?: number | undefined;
  readonly cost?: number | null | undefined;
  readonly costDetails?: ChatCompletionCostDetails | null | undefined;
  readonly promptTokensDetails?: ChatPromptTokensDetails | null | undefined;
  readonly completionTokensDetails?: ChatCompletionTokensDetails | null | undefined;
  readonly isByok?: boolean | undefined;
}

/** The assistant message on a chat-completions choice. `content` is `unknown` (string OR content-parts). */
export interface ChatCompletionMessage {
  readonly content?: unknown;
  readonly reasoning?: string | null | undefined;
  readonly reasoningDetails?: readonly ChatReasoningDetail[] | null | undefined;
}

/** One choice on a chat-completions view. */
export interface ChatCompletionChoice {
  readonly message?: ChatCompletionMessage | undefined;
  readonly finishReason?: string | null | undefined;
}

/** The assembled chat-completions view BOTH the stream reducer and the one-shot parser produce, and the
 *  view→ChatResult mapper consumes. */
export interface ChatCompletionResult {
  readonly id?: string | undefined;
  readonly choices?: readonly ChatCompletionChoice[] | undefined;
  readonly usage?: ChatCompletionUsage | undefined;
}

/** Responses-API usage accounting. */
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
/** The assembled Responses-API view. */
export interface ResponsesResult {
  readonly output?: readonly ResponsesOutputItem[] | undefined;
  readonly outputText?: string | undefined;
  readonly status?: string | undefined;
  readonly incompleteDetails?: { readonly reason?: string | undefined } | null | undefined;
  readonly usage?: ResponsesUsage | undefined;
}

// ── Stream chunk/event shapes — TS-only structural types (never runtime-parsed) ────────────────────

/** Per-token chat-completions stream delta. `reasoning` (legacy flat string, OpenAI-style + older
 *  Anthropic routes) vs `reasoningDetails` (typed array, newer Anthropic routes: text-bearing CoT +
 *  opaque `reasoning.encrypted` continuity blocks). The reducer reads both so CoT surfaces either way. */
export interface ChatCompletionStreamDelta {
  readonly content?: string | null | undefined;
  readonly reasoning?: string | null | undefined;
  readonly reasoningDetails?: readonly ChatReasoningDetail[] | null | undefined;
}
export interface ChatCompletionStreamChoice {
  readonly delta?: ChatCompletionStreamDelta | undefined;
  readonly finishReason?: string | null | undefined;
}
/** One chat.completions stream chunk. `usage`/`finishReason` arrive only on the terminal sentinel;
 *  `error` is an in-band provider error (billing/rate-limit) the reducer promotes to a throw. */
export interface ChatCompletionStreamChunk {
  readonly choices: readonly ChatCompletionStreamChoice[];
  readonly error?: { readonly code: number; readonly message: string } | null | undefined;
  readonly usage?: ChatCompletionUsage | undefined;
}

/** One Responses-API stream event. The event types a runner switches on: `response.output_text.delta`,
 *  `response.reasoning_text.delta`, `response.reasoning_summary_text.delta`, `response.completed`,
 *  `response.incomplete`, `response.failed`, `error`. */
export interface ResponsesStreamEvent {
  readonly type: string;
  readonly delta?: string | undefined;
  readonly response?:
    | {
        readonly status?: string | undefined;
        readonly incompleteDetails?: { readonly reason?: string | undefined } | null | undefined;
        readonly usage?: ResponsesUsage | undefined;
        readonly error?:
          | { readonly code: number | string | null; readonly message: string }
          | null
          | undefined;
      }
    | undefined;
  readonly code?: string | null | undefined;
  readonly message?: string | undefined;
}

// ── Parse functions (the public runtime surface — the schemas stay file-local per no-inline-types) ──

/** Parse a one-shot chat-completions body, leniently. Throws a `ZodError` on a breaking shape change. */
export function parseChatCompletionResult(raw: unknown): ChatCompletionResult {
  return chatCompletionResultSchema.parse(raw);
}

/** Parse a one-shot Responses-API body, leniently. Throws a `ZodError` on a breaking shape change. */
export function parseResponsesResult(raw: unknown): ResponsesResult {
  return responsesResultSchema.parse(raw);
}

// ── Extractors (shared so every consumer of the lenient view uses one extraction) ──────────────────

/** Extract the reply text from a chat-completions view: a plain string, or the joined text parts of a
 *  content-parts array. Trimmed; `""` when absent. */
export function extractChatReply(view: ChatCompletionResult): string {
  const content = view.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .filter(
        (part): part is { type?: string; text?: string } =>
          part !== null && typeof part === "object",
      )
      .map((part): string => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
}

/** Concatenate human-readable CoT text from a `reasoningDetails[]`, skipping `reasoning.encrypted`
 *  entries (opaque continuity blocks with no display text). `""` when none. */
function collectReasoningDetailsText(
  details: readonly ChatReasoningDetail[] | null | undefined,
): string {
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

/** Extract cumulative CoT from a NON-streaming chat-completions view. Prefers the structured
 *  `reasoningDetails` channel (text-bearing entries) over the legacy `reasoning` string — newer Anthropic
 *  routes (Opus 4.8) populate BOTH for the same CoT, and reading both doubles the text. `""` when none. */
export function extractChatReasoning(view: ChatCompletionResult): string {
  const message = view.choices?.[0]?.message;
  const detailsText = collectReasoningDetailsText(message?.reasoningDetails);
  if (detailsText.length > 0) {
    return detailsText;
  }
  return typeof message?.reasoning === "string" ? message.reasoning : "";
}

// Re-exported so the stream reducer (openai-compat/stream.ts) shares the encrypted-skip preference.
export { collectReasoningDetailsText };
