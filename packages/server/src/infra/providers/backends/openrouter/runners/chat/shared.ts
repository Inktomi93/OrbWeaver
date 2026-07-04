// infra/providers/backends/openrouter/runners/chat/shared — the wire-shaping helpers BOTH openrouter chat
// runners (chat-completions + responses) lean on: message assembly, the system-prompt cache split, the
// sampling/reasoning projection, the provider-routing pin, the customParameters overlay, the
// mandatory-reasoning detector, and the SDK→kit stream-chunk reshaper. Pure data shaping over the SDK's
// typed request/response shapes — no transport, no clock. Imports the shared `backends/kit` wire helpers
// DOWN (strategy isolation); never reaches a sibling backend.

import type {
  ChatContentText,
  ChatFormatJsonSchemaConfig,
  ChatFunctionTool,
  ChatMessages,
  ChatRequest,
  ChatStreamChunk,
  ChatSystemMessage,
  ChatToolCall,
  ChatToolChoice,
  ProviderPreferences,
  ReasoningDetailUnion,
} from "@openrouter/sdk/models";
import type { ChatContentPart } from "@orb/contracts/chat";
import type { OpenRouterProviderRouting } from "@orb/contracts/connection";
import { errorMessage } from "@orb/kit/error-message";
import type { ChatCompletionStreamChunk, ReasoningRequest } from "../../../../backends/kit";
import {
  cacheControlBlock,
  chatHistoryText,
  effectiveProviderRouting,
  extractHttpErrorDiagnostic,
} from "../../../../backends/kit";
import type {
  ChatEvent,
  ChatHistoryMessage,
  ResolvedReasoning,
  ResolvedSampling,
  ResolvedWarning,
  ResponseFormat,
  ToolChoice,
  WireTool,
} from "../../../../contract";

/** The clock + jitter seams the composition root injects (no ambient `Date.now`/`Math.random`). `random`
 *  is optional — omitted in production (the retry kit defaults to `Math.random`), passed by tests for
 *  determinism. Infra DI surface (the `no-inline-types` gate permits infra port interfaces). */
export interface OpenRouterChatDeps {
  readonly now: () => number;
  readonly random?: (() => number) | undefined;
}

const TEXT_BLOCK_TYPE = "text";
const SYSTEM_ROLE = "system";
const PROMPT_JOINER = "\n\n";
const MANDATORY_REASONING_RE = /reasoning is mandatory/i;

// ── System-prompt assembly (the cache split, Esoteric §5) ──────────────────────────────────────────
/**
 * Build the OpenRouter system message from the split prompt. For an Anthropic model with a non-empty
 * STATIC prefix we emit a PER-BLOCK `cache_control` on that static block (pins the breakpoint at the
 * stable prefix — a top-level directive pins it at the volatile newest message → 0 cache writes, measured)
 * plus a plain dynamic-tail block. Non-Anthropic (or no static) collapses to one joined string. Both empty
 * → `null` (the message is omitted). Uses the kit's `cacheControlBlock` primitive for the breakpoint shape.
 */
export function buildSystemMessage(
  systemPrompt: { readonly static: string; readonly dynamic: string },
  isAnthropic: boolean,
): ChatSystemMessage | null {
  const staticText = systemPrompt.static.trim();
  const dynamicText = systemPrompt.dynamic.trim();
  if (staticText.length === 0 && dynamicText.length === 0) {
    return null;
  }
  if (isAnthropic && staticText.length > 0) {
    const content: ChatContentText[] = [cacheControlBlock(staticText)];
    if (dynamicText.length > 0) {
      content.push({ type: TEXT_BLOCK_TYPE, text: dynamicText });
    }
    return { role: SYSTEM_ROLE, content };
  }
  const joined = [staticText, dynamicText].filter((part) => part.length > 0).join(PROMPT_JOINER);
  return { role: SYSTEM_ROLE, content: joined };
}

/** Join the split system prompt into ONE string (the Responses-API `instructions` field). */
export function joinSystemPrompt(systemPrompt: {
  readonly static: string;
  readonly dynamic: string;
}): string {
  return [systemPrompt.static.trim(), systemPrompt.dynamic.trim()]
    .filter((part) => part.length > 0)
    .join(PROMPT_JOINER);
}

// ── History assembly ───────────────────────────────────────────────────────────────────────────────
// The tool-call parts of one turn → the SDK's assistant `toolCalls[]` (D48/T2 — the materialized
// exchange rides the wire exactly as the model emitted it; `arguments` stays the RAW string).
function historyToolCalls(content: readonly ChatContentPart[]): ChatToolCall[] | undefined {
  const calls: ChatToolCall[] = [];
  for (const part of content) {
    if (part.type === "tool-call") {
      calls.push({
        id: part.toolCallId,
        type: "function",
        function: { name: part.name, arguments: part.arguments },
      });
    }
  }
  return calls.length > 0 ? calls : undefined;
}

// A `tool`-role turn → ONE `{role:"tool"}` SDK message PER `tool-result` part (`toolCallId` joins).
function toolResultMessages(content: readonly ChatContentPart[]): ChatMessages[] {
  const out: ChatMessages[] = [];
  for (const part of content) {
    if (part.type === "tool-result") {
      out.push({ role: "tool", toolCallId: part.toolCallId, content: part.content });
    }
  }
  return out;
}

// A user/assistant turn → its SDK message, or `null` when empty. A text-less assistant tool-call
// turn is KEPT (the calls ARE its content).
function nonToolMessage(turn: ChatHistoryMessage): ChatMessages | null {
  const text = chatHistoryText(turn.content);
  const toolCalls = turn.role === "assistant" ? historyToolCalls(turn.content) : undefined;
  if (text.trim().length === 0 && toolCalls === undefined) {
    return null;
  }
  const name = turn.name !== undefined ? { name: turn.name } : {};
  return turn.role === "assistant"
    ? {
        role: "assistant",
        content: text,
        ...(toolCalls !== undefined ? { toolCalls } : {}),
        ...name,
      }
    : { role: "user", content: text, ...name };
}

/** Map the assembled view turns → SDK chat messages, filtering empty-content turns FIRST (so the
 *  cache-breakpoint offset-from-end the chat pipeline computed still lines up). The per-participant `name`
 *  rides through (COMPLETION names behaviour). A materialized tool exchange (D48/T2) maps per the OpenAI
 *  wire: assistant `tool-call` parts → `toolCalls[]`; a `tool`-role turn → per-result `{role:"tool"}`
 *  messages. */
export function buildHistoryMessages(history: readonly ChatHistoryMessage[]): ChatMessages[] {
  const messages: ChatMessages[] = [];
  for (const turn of history) {
    if (turn.role === "tool") {
      messages.push(...toolResultMessages(turn.content));
      continue;
    }
    const message = nonToolMessage(turn);
    if (message !== null) {
      messages.push(message);
    }
  }
  return messages;
}

// ── The D48 request-field builders (tool-use-design/02 §4 — the chat-completions dialect) ──────────
/** WireTool[] → the SDK's `tools` (`{type:"function", function:{…}}`). Order preserved (byte-stable
 *  request bodies — the prompt cache cares). */
export function buildWireTools(tools: readonly WireTool[]): ChatFunctionTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: { ...tool.parameters },
    },
  }));
}

/** The contract `ToolChoice` → the SDK dialect. Mapped ONLY when the caller set it — the `auto`
 *  default is the CALLER's, never a translator constant (the committed §9 rejection). */
export function buildToolChoice(choice: ToolChoice): ChatToolChoice {
  if (choice.mode === "tool") {
    return { type: "function", function: { name: choice.name } };
  }
  return choice.mode;
}

/** The contract `ResponseFormat` → chat-completions `response_format` (`json_schema` dialect;
 *  tool-use-design/04 §3). `strict` defaults true. */
export function buildChatResponseFormat(format: ResponseFormat): ChatFormatJsonSchemaConfig {
  return {
    type: "json_schema",
    jsonSchema: {
      name: format.name,
      schema: { ...format.schema },
      strict: format.strict ?? true,
      ...(format.description !== undefined ? { description: format.description } : {}),
    },
  };
}

// ── Sampling projection ──────────────────────────────────────────────────────────────────────────
/** The chat-completions sampling slice (camelCase — the SDK serializes to snake_case). Consumes the
 *  capability-RESOLVED sampling (`resolve-chat` already clamped/gated every knob — invariant #9), so this
 *  is a pure passthrough of what survived. `maxCompletionTokens` (not the deprecated `maxTokens`) carries
 *  the resolved, range-clamped output cap. Each field is emitted only when the resolved knob is present. */
export function chatSamplingFields(
  sampling: ResolvedSampling,
  maxOutputTokens: number | undefined,
): Partial<ChatRequest> {
  return {
    ...(sampling.temperature !== undefined ? { temperature: sampling.temperature } : {}),
    ...(sampling.topP !== undefined ? { topP: sampling.topP } : {}),
    ...(sampling.topK !== undefined ? { topK: sampling.topK } : {}),
    ...(sampling.frequencyPenalty !== undefined
      ? { frequencyPenalty: sampling.frequencyPenalty }
      : {}),
    ...(sampling.presencePenalty !== undefined
      ? { presencePenalty: sampling.presencePenalty }
      : {}),
    ...(sampling.repetitionPenalty !== undefined
      ? { repetitionPenalty: sampling.repetitionPenalty }
      : {}),
    ...(sampling.seed !== undefined ? { seed: sampling.seed } : {}),
    ...(sampling.logitBias !== undefined ? { logitBias: sampling.logitBias } : {}),
    ...(sampling.stop !== undefined ? { stop: [...sampling.stop] } : {}),
    ...(maxOutputTokens !== undefined ? { maxCompletionTokens: maxOutputTokens } : {}),
  };
}

// ── Reasoning request (thin map from the resolved decision) ────────────────────────────────────────
/**
 * Map the capability-RESOLVED {@link ResolvedReasoning} → the kit {@link ReasoningRequest} the wire-block
 * builders project. ALL the policy (the on/off decision, the effort-levels clamp, and the Opus-4.8
 * adaptive/budget guard — Esoteric §8) already ran in `resolve-chat`; this is a pure shape map. The OR
 * effort/max_tokens XOR still lives in the kit's `effortToResponsesReasoning` (a wire-shape concern).
 */
export function buildReasoningRequest(reasoning: ResolvedReasoning): ReasoningRequest {
  return {
    enabled: reasoning.enabled,
    ...(reasoning.effort !== undefined ? { effort: reasoning.effort } : {}),
    ...(reasoning.budgetTokens !== undefined ? { budgetTokens: reasoning.budgetTokens } : {}),
  };
}

// ── Warning events (resolve-chat's dropped/ignored-knob notes) ─────────────────────────────────────
/** Build the per-turn `warning` {@link ChatEvent}s from resolve-chat's structured notes (the `code`
 *  rides through for machine dispatch; `message` is the readable detail). PURE — the runner fires
 *  `onEvent` and merges these into `ChatResult.events` (this module stays clock-free; the runner passes
 *  the resolved `at`). Both OR chat runners (chat-completions + responses) share this one builder. */
export function warningEvents(warnings: readonly ResolvedWarning[], at: number): ChatEvent[] {
  return warnings.map(({ code, message }) => ({ kind: "warning", at, code, message }));
}

// ── Provider routing (the cache-pin, Esoteric §5/§7) ───────────────────────────────────────────────
// Map the contract's raw-wire (snake_case) routing → the SDK's camelCase `ProviderPreferences`. Only the
// routing-relevant knobs are mapped (order/only/ignore/fallbacks/data-collection/require-params/sort);
// see the FLAG in index.ts re: the exotic knobs (quantizations/maxPrice/latency) the snake↔camel contract
// impedance leaves unmapped.
function toProviderPreferences(routing: OpenRouterProviderRouting): ProviderPreferences {
  return {
    ...(routing.order !== undefined ? { order: routing.order } : {}),
    ...(routing.only !== undefined ? { only: routing.only } : {}),
    ...(routing.ignore !== undefined ? { ignore: routing.ignore } : {}),
    ...(routing.allow_fallbacks !== undefined ? { allowFallbacks: routing.allow_fallbacks } : {}),
    ...(routing.data_collection !== undefined ? { dataCollection: routing.data_collection } : {}),
    ...(routing.require_parameters !== undefined
      ? { requireParameters: routing.require_parameters }
      : {}),
    ...(routing.sort !== undefined ? { sort: routing.sort } : {}),
  };
}

/** Resolve the effective provider routing (user routing wins; else an Anthropic model gets the
 *  `{order:["Anthropic"]}` cache pin) and map it to the SDK shape. `undefined` → default routing. */
export function resolveProviderPreferences(
  model: string,
  userRouting: OpenRouterProviderRouting | undefined,
): ProviderPreferences | undefined {
  const effective = effectiveProviderRouting(model, userRouting);
  return effective === undefined ? undefined : toProviderPreferences(effective);
}

// ── customParameters overlay ───────────────────────────────────────────────────────────────────────
/**
 * Overlay the user's `customParameters` UNDER the runner-owned request (owned wins — a preset can never
 * override `model`/`messages`/`provider`/reasoning, the security firewall). Spreading the typed `owned`
 * LAST means every field it declares takes its type, so only custom-only keys survive as extras — the
 * merged object stays a valid request. Generic over the chat-completions + responses request shapes.
 */
export function mergeCustomParameters<T extends Record<string, unknown>>(
  owned: T,
  customParameters: Record<string, unknown> | undefined,
): T {
  if (customParameters === undefined) {
    return owned;
  }
  return { ...customParameters, ...owned };
}

// ── Error helpers ─────────────────────────────────────────────────────────────────────────────────
/** True when the upstream 400 is a mandatory-reasoning endpoint (DeepSeek-R1) rejecting
 *  `reasoning.effort:"none"` — peels the sanitized body + cause and matches the signature. Drives the
 *  strip-and-replay-ONCE recovery (the 400 fires before any delta, so a single replay is pre-commit-safe). */
export function isMandatoryReasoningRejection(error: unknown): boolean {
  const diag = extractHttpErrorDiagnostic(error);
  const haystack = `${diag.body ?? ""} ${diag.cause ?? ""} ${errorMessage(error)}`;
  return MANDATORY_REASONING_RE.test(haystack);
}

// ── SDK → kit stream-chunk reshape ─────────────────────────────────────────────────────────────────
// Map the SDK's typed reasoning-detail entries → the kit's structural `ChatReasoningDetail` (the reducer
// reads BOTH the legacy `reasoning` string and the structured `reasoningDetails` to de-dupe Opus-4.8 CoT).
function reshapeReasoningDetails(
  details: ReasoningDetailUnion[] | undefined,
):
  | Array<{ readonly type?: string | undefined; readonly text?: string | null | undefined }>
  | undefined {
  if (details === undefined) {
    return;
  }
  return details.map((detail) => ({
    ...("type" in detail && typeof detail.type === "string" ? { type: detail.type } : {}),
    ...("text" in detail && (typeof detail.text === "string" || detail.text === null)
      ? { text: detail.text }
      : {}),
  }));
}

/**
 * Reshape ONE SDK {@link ChatStreamChunk} into the kit's {@link ChatCompletionStreamChunk} the shared
 * reducer consumes (the SDK handles SSE itself, so the kit's raw `parseOpenAiSse` is NOT used here — this
 * is the SDK-typed equivalent of custom-byo's `reshapeChunk`). Carries the in-band `error`, the usage
 * sentinel, the finish reason, and both reasoning channels.
 */
export function reshapeChatStreamChunk(chunk: ChatStreamChunk): ChatCompletionStreamChunk {
  // The error + usage tail rides on every chunk shape (incl. the terminal usage-sentinel, whose `choices`
  // is empty — `.at(0)` returns `undefined` there, where the SDK's element type would mislead us).
  const tail = {
    ...(chunk.error !== undefined ? { error: chunk.error } : {}),
    ...(chunk.usage !== undefined ? { usage: reshapeChatUsage(chunk.usage) } : {}),
  };
  const choice = chunk.choices.at(0);
  if (choice === undefined) {
    return { choices: [{ delta: {}, finishReason: null }], ...tail };
  }
  const { delta } = choice;
  const { reasoning } = delta;
  const reasoningDetails = reshapeReasoningDetails(delta.reasoningDetails);
  return {
    choices: [
      {
        delta: {
          content: delta.content ?? null,
          ...(reasoning !== undefined && reasoning !== null ? { reasoning } : {}),
          ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
        },
        finishReason: choice.finishReason ?? null,
      },
    ],
    ...tail,
  };
}

// ── Usage reshape (split into per-container helpers to stay under the cognitive-complexity gate) ────
type SdkChatUsage = NonNullable<ChatStreamChunk["usage"]>;

function reshapeCostDetails(cd: SdkChatUsage["costDetails"]): Record<string, number> | undefined {
  if (cd === null || cd === undefined) {
    return;
  }
  return {
    ...(cd.upstreamInferenceCost !== null && cd.upstreamInferenceCost !== undefined
      ? { upstreamInferenceCost: cd.upstreamInferenceCost }
      : {}),
    upstreamInferencePromptCost: cd.upstreamInferencePromptCost,
    upstreamInferenceCompletionsCost: cd.upstreamInferenceCompletionsCost,
  };
}

function reshapePromptDetails(
  ptd: SdkChatUsage["promptTokensDetails"],
): Record<string, number> | undefined {
  if (ptd === null || ptd === undefined) {
    return;
  }
  return {
    ...(ptd.cachedTokens !== undefined ? { cachedTokens: ptd.cachedTokens } : {}),
    ...(ptd.cacheWriteTokens !== undefined ? { cacheWriteTokens: ptd.cacheWriteTokens } : {}),
  };
}

function reshapeCompletionDetails(
  ctd: SdkChatUsage["completionTokensDetails"],
): Record<string, number> | undefined {
  const reasoningTokens = ctd?.reasoningTokens;
  if (reasoningTokens === null || reasoningTokens === undefined) {
    return;
  }
  return { reasoningTokens };
}

// Map the SDK usage → the kit's lenient usage view (camelCase; the kit mapper reads these field names).
function reshapeChatUsage(usage: SdkChatUsage): ChatCompletionStreamChunk["usage"] {
  const costDetails = reshapeCostDetails(usage.costDetails);
  const promptTokensDetails = reshapePromptDetails(usage.promptTokensDetails);
  const completionTokensDetails = reshapeCompletionDetails(usage.completionTokensDetails);
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    ...(usage.cost !== undefined && usage.cost !== null ? { cost: usage.cost } : {}),
    ...(costDetails !== undefined ? { costDetails } : {}),
    ...(promptTokensDetails !== undefined ? { promptTokensDetails } : {}),
    ...(completionTokensDetails !== undefined ? { completionTokensDetails } : {}),
    ...(usage.isByok !== undefined ? { isByok: usage.isByok } : {}),
  };
}
