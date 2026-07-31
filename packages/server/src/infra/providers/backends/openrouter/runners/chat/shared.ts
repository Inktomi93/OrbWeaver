// Wire-shaping helpers shared by both openrouter chat runners (chat-completions + responses): message
// assembly, the system-prompt cache split, sampling/reasoning projection, provider-routing, and the
// SDK→kit stream-chunk reshaper. Pure data shaping — no transport, no clock.

import type {
  ChatContentText,
  ChatFormatJsonSchemaConfig,
  ChatFunctionTool,
  ChatMessages,
  ChatRequest,
  ChatStreamChunk,
  ChatStreamToolCall,
  ChatSystemMessage,
  ChatToolCall,
  ChatToolChoice,
  ProviderPreferences,
  ReasoningDetailUnion,
} from "@openrouter/sdk/models";
import { Quantization } from "@openrouter/sdk/models";
import type { ChatContentPart } from "@orb/contracts/chat";
import type { OpenRouterProviderRouting } from "@orb/contracts/connection";
import type { UserIntent } from "@orb/contracts/preset";
import { errorMessage } from "@orb/kit/error-message";
import type { ChatCompletionStreamChunk, ChatToolCallDelta, ProviderSamplingDrop, ReasoningRequest } from "../../../../backends/kit";
import { cacheControlBlock, chatHistoryText, effectiveProviderRouting, extractHttpErrorDiagnostic, logProviderSampling } from "../../../../backends/kit";
import type {
  ChatEvent,
  ChatHistoryMessage,
  ResolvedChatKnobs,
  ResolvedReasoning,
  ResolvedSampling,
  ResolvedWarning,
  ResponseFormat,
  ToolChoice,
  WireCaptureSink,
  WireTool,
} from "../../../../contract";

export interface OpenRouterChatDeps {
  readonly now: () => number;
  readonly random?: (() => number) | undefined;
  readonly captureWire?: WireCaptureSink | undefined;
}

const TEXT_BLOCK_TYPE = "text";
const SYSTEM_ROLE = "system";
const PROMPT_JOINER = "\n\n";
const MANDATORY_REASONING_RE = /reasoning is mandatory/i;

// For an Anthropic model with a non-empty static prefix, pin cache_control on that block (a top-level
// directive would pin the volatile newest message instead, giving 0 cache writes).
export function buildSystemMessage(systemPrompt: { readonly static: string; readonly dynamic: string }, isAnthropic: boolean): ChatSystemMessage | null {
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

export function joinSystemPrompt(systemPrompt: { readonly static: string; readonly dynamic: string }): string {
  return [systemPrompt.static.trim(), systemPrompt.dynamic.trim()].filter((part) => part.length > 0).join(PROMPT_JOINER);
}

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

// `isError` has NO slot on either OpenRouter chat dialect (chat-completions' `tool` message carries
// content only; the responses dialect's `function_call_output` has no error field either), so the flag is
// dropped here — `withToolResultErrorDrop` makes that drop loud (D41).
function toolResultMessages(content: readonly ChatContentPart[]): ChatMessages[] {
  const out: ChatMessages[] = [];
  for (const part of content) {
    if (part.type === "tool-result") {
      out.push({ role: "tool", toolCallId: part.toolCallId, content: part.content });
    }
  }
  return out;
}

// A text-less assistant tool-call turn is kept (the calls ARE its content).
// A `system` row is a capability-kept mid-conversation system injection (`turns.midConversationSystem`)
// — delivered as a REAL system message on this wire (legal OpenAI vocab), never coerced to user.
function nonToolMessage(turn: ChatHistoryMessage): ChatMessages | null {
  const text = chatHistoryText(turn.content);
  if (turn.role === "system") {
    return text.trim().length > 0 ? { role: SYSTEM_ROLE, content: text } : null;
  }
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

// Filters empty-content turns FIRST so the cache-breakpoint offset-from-end still lines up.
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

// Order preserved — byte-stable request bodies, the prompt cache cares.
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

// Mapped only when the caller set it — the "auto" default is the caller's, never a translator constant.
export function buildToolChoice(choice: ToolChoice): ChatToolChoice {
  if (choice.mode === "tool") {
    return { type: "function", function: { name: choice.name } };
  }
  return choice.mode;
}

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

export function chatSamplingFields(sampling: ResolvedSampling, maxOutputTokens: number | undefined): Partial<ChatRequest> {
  return {
    ...(sampling.temperature !== undefined ? { temperature: sampling.temperature } : {}),
    ...(sampling.topP !== undefined ? { topP: sampling.topP } : {}),
    ...(sampling.topK !== undefined ? { topK: sampling.topK } : {}),
    ...(sampling.frequencyPenalty !== undefined ? { frequencyPenalty: sampling.frequencyPenalty } : {}),
    ...(sampling.presencePenalty !== undefined ? { presencePenalty: sampling.presencePenalty } : {}),
    ...(sampling.repetitionPenalty !== undefined ? { repetitionPenalty: sampling.repetitionPenalty } : {}),
    ...(sampling.minP !== undefined ? { minP: sampling.minP } : {}),
    ...(sampling.topA !== undefined ? { topA: sampling.topA } : {}),
    ...(sampling.seed !== undefined ? { seed: sampling.seed } : {}),
    ...(sampling.logitBias !== undefined ? { logitBias: sampling.logitBias } : {}),
    ...(sampling.stop !== undefined ? { stop: [...sampling.stop] } : {}),
    ...(maxOutputTokens !== undefined ? { maxCompletionTokens: maxOutputTokens } : {}),
  };
}

export function buildReasoningRequest(reasoning: ResolvedReasoning): ReasoningRequest {
  return {
    enabled: reasoning.enabled,
    ...(reasoning.effort !== undefined ? { effort: reasoning.effort } : {}),
    ...(reasoning.budgetTokens !== undefined ? { budgetTokens: reasoning.budgetTokens } : {}),
  };
}

export function warningEvents(warnings: readonly ResolvedWarning[], at: number): ChatEvent[] {
  return warnings.map(({ code, message }) => ({ kind: "warning", at, code, message }));
}

const SAMPLING_KNOBS = [
  "temperature",
  "topP",
  "topK",
  "frequencyPenalty",
  "presencePenalty",
  "repetitionPenalty",
  "minP",
  "topA",
  "seed",
  "logitBias",
  "stop",
] as const;

const CHAT_VERBOSITY_DROPPED = "verbosity ignored: the chat-completions wire has no verbosity field";

function pickSampling(source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const knob of SAMPLING_KNOBS) {
    const value = source[knob];
    if (value !== undefined) {
      out[knob] = value;
    }
  }
  return out;
}

function samplingDrops(warnings: readonly ResolvedWarning[]): ProviderSamplingDrop[] {
  const drops: ProviderSamplingDrop[] = [];
  for (const w of warnings) {
    if (w.code === "sampling_knob_dropped" || w.code === "verbosity_dropped") {
      // Message is "<knob> ignored: <reason>" — split once for the pair.
      const [knob, reason] = w.message.split(" ignored:", 2);
      drops.push({ knob: knob ?? w.code, reason: (reason ?? w.message).trim() });
    }
  }
  return drops;
}

export function emitSamplingReceipt(params: UserIntent, resolved: ResolvedChatKnobs): void {
  const applied = pickSampling(resolved.sampling as Record<string, unknown>);
  if (resolved.verbosity !== undefined) {
    applied["verbosity"] = resolved.verbosity;
  }
  const requested = pickSampling(params as Record<string, unknown>);
  if (params.verbosity !== undefined) {
    requested["verbosity"] = params.verbosity;
  }
  logProviderSampling("openrouter", {
    turnId: resolved.turnId,
    requested,
    applied,
    dropped: samplingDrops(resolved.warnings),
  });
}

export function withVerbosityDrop(resolved: ResolvedChatKnobs): readonly ResolvedWarning[] {
  if (resolved.verbosity === undefined) {
    return resolved.warnings;
  }
  return [...resolved.warnings, { code: "verbosity_dropped", message: CHAT_VERBOSITY_DROPPED }];
}

// The five USD price ceilings OpenRouter's `max_price` accepts (per-million prompt/completion tokens,
// per-image, per-audio-unit, per-request). The contract stores `max_price` as a loose record (OR owns the
// shape); we pick the known numeric ceilings so a user's price cap actually reaches the wire.
const MAX_PRICE_KEYS = ["prompt", "completion", "image", "audio", "request"] as const;

function toMaxPrice(raw: Record<string, unknown>): ProviderPreferences["maxPrice"] {
  const out: Record<string, string> = {};
  for (const key of MAX_PRICE_KEYS) {
    const value = raw[key];
    if (typeof value === "number") {
      out[key] = String(value);
    } else if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

// The quantization levels OpenRouter actually filters on. The contract stores `quantizations` as loose
// strings; keep only the wire-valid levels (an unknown level would fail routing anyway). Derived from the
// SDK's `Quantization` enum so a new upstream level can't be silently stripped from a user's routing pref.
// ASSUMES(single-replica): a read-only lookup Set derived from the static `Quantization` enum — identical on
// every replica, never mutated after init, so it is NOT a correctness boundary and needs no DB-backed seam.
const OR_QUANTIZATIONS = new Set<string>(Object.values(Quantization));

function toQuantizations(values: readonly string[]): ProviderPreferences["quantizations"] {
  return values.filter((value): value is NonNullable<ProviderPreferences["quantizations"]>[number] => OR_QUANTIZATIONS.has(value));
}

function toProviderPreferences(routing: OpenRouterProviderRouting): ProviderPreferences {
  return {
    ...(routing.order !== undefined ? { order: routing.order } : {}),
    ...(routing.only !== undefined ? { only: routing.only } : {}),
    ...(routing.ignore !== undefined ? { ignore: routing.ignore } : {}),
    ...(routing.allow_fallbacks !== undefined ? { allowFallbacks: routing.allow_fallbacks } : {}),
    ...(routing.data_collection !== undefined ? { dataCollection: routing.data_collection } : {}),
    ...(routing.require_parameters !== undefined ? { requireParameters: routing.require_parameters } : {}),
    ...(routing.sort !== undefined ? { sort: routing.sort } : {}),
    // Both were modelled on the contract (persisted routing) but silently dropped before the wire: a
    // user's quantization filter + price ceiling never reached OpenRouter. `quantizations` values are the
    // OR wire strings (int4/fp8/…); the SDK's branded enum accepts them via the loose provider block.
    ...(routing.quantizations !== undefined ? { quantizations: toQuantizations(routing.quantizations) } : {}),
    ...(routing.max_price !== undefined ? { maxPrice: toMaxPrice(routing.max_price) } : {}),
  };
}

export function resolveProviderPreferences(model: string, userRouting: OpenRouterProviderRouting | undefined): ProviderPreferences | undefined {
  const effective = effectiveProviderRouting(model, userRouting);
  return effective === undefined ? undefined : toProviderPreferences(effective);
}

// The MODEL-level fallback chain → the wire's top-level `models[]`. Undefined (never an empty array) when
// the user set none, so a plain turn's body stays byte-identical to pre-fallback.
export function resolveFallbackModels(userRouting: OpenRouterProviderRouting | undefined): string[] | undefined {
  const models = userRouting?.models;
  return models !== undefined && models.length > 0 ? [...models] : undefined;
}

const CUSTOM_PARAMETERS_IGNORED = "customParameters ignored on OpenRouter (BYOK/custom-byo only)";

// D41 no-silent-degrade: a preset's customParameters escape hatch does NOT reach the OpenRouter wire (it is
// BYOK/custom-byo-only — OpenRouter's knobs are the modeled sampling surface). When a turn still carries a
// NON-EMPTY blob, append a loud `custom_parameters_ignored` warning so the drop is observable, never silent.
// Both OR chat runners fold this over their resolved warnings before building the turn's warning events.
export function withCustomParametersDrop(
  warnings: readonly ResolvedWarning[],
  customParameters: Record<string, unknown> | undefined,
): readonly ResolvedWarning[] {
  if (customParameters === undefined || Object.keys(customParameters).length === 0) {
    return warnings;
  }
  return [...warnings, { code: "custom_parameters_ignored", message: CUSTOM_PARAMETERS_IGNORED }];
}

const TOOL_RESULT_ERROR_DROPPED = "tool-result isError ignored: the OpenRouter chat wire has no tool-result error field";

// D41 no-silent-degrade: a `tool-result` part's `isError:true` (the executor's failure flag,
// `ChatContentPart`) has nowhere to go on either OR chat dialect — the model sees the error payload as an
// ordinary result. When a turn's history carries at least one failed tool result, append a loud
// `tool_result_error_dropped` warning so the lost signal is observable. NOT encoded onto the wire: OR's
// chat surfaces have no field for it, and inventing one would change what the model reads.
export function withToolResultErrorDrop(warnings: readonly ResolvedWarning[], history: readonly ChatHistoryMessage[]): readonly ResolvedWarning[] {
  const dropped = history.some((turn) => turn.content.some((part) => part.type === "tool-result" && part.isError === true));
  if (!dropped) {
    return warnings;
  }
  return [...warnings, { code: "tool_result_error_dropped", message: TOOL_RESULT_ERROR_DROPPED }];
}

// True when the upstream 400 is a mandatory-reasoning endpoint rejecting reasoning.effort:"none" — drives the strip-and-replay-once recovery.
export function isMandatoryReasoningRejection(error: unknown): boolean {
  const diag = extractHttpErrorDiagnostic(error);
  const haystack = `${diag.body ?? ""} ${diag.cause ?? ""} ${errorMessage(error)}`;
  return MANDATORY_REASONING_RE.test(haystack);
}

// Omitting this map is what silently killed the tool loop on the chat-completions runner: finishReason
// normalized to "tool" but no calls were assembled, so the pipeline pivot returned null.
function reshapeToolCallDeltas(toolCalls: ChatStreamToolCall[] | undefined): ChatToolCallDelta[] | undefined {
  if (toolCalls === undefined) {
    return;
  }
  return toolCalls.map((call) => ({
    index: call.index,
    ...(call.id !== undefined ? { id: call.id } : {}),
    ...(call.function !== undefined
      ? {
          function: {
            ...(call.function.name !== undefined ? { name: call.function.name } : {}),
            ...(call.function.arguments !== undefined ? { arguments: call.function.arguments } : {}),
          },
        }
      : {}),
  }));
}

function reshapeReasoningDetails(
  details: ReasoningDetailUnion[] | undefined,
): Array<{ readonly type?: string | undefined; readonly text?: string | null | undefined }> | undefined {
  if (details === undefined) {
    return;
  }
  return details.map((detail) => ({
    ...("type" in detail && typeof detail.type === "string" ? { type: detail.type } : {}),
    ...("text" in detail && (typeof detail.text === "string" || detail.text === null) ? { text: detail.text } : {}),
  }));
}

export function reshapeChatStreamChunk(chunk: ChatStreamChunk): ChatCompletionStreamChunk {
  // The terminal usage-sentinel chunk has empty choices, so .at(0) returns undefined there.
  const tail = {
    ...(chunk.error !== undefined ? { error: chunk.error } : {}),
    ...(chunk.usage !== undefined ? { usage: reshapeChatUsage(chunk.usage) } : {}),
  };
  // The generation handle (`gen-…`) rides every chunk; carry it so the reducer can latch it (PD-137).
  const idTail = chunk.id.length > 0 ? { id: chunk.id } : {};
  const choice = chunk.choices.at(0);
  if (choice === undefined) {
    return { choices: [{ delta: {}, finishReason: null }], ...idTail, ...tail };
  }
  const { delta } = choice;
  const { reasoning } = delta;
  const reasoningDetails = reshapeReasoningDetails(delta.reasoningDetails);
  const toolCalls = reshapeToolCallDeltas(delta.toolCalls);
  return {
    choices: [
      {
        delta: {
          content: delta.content ?? null,
          ...(reasoning !== undefined && reasoning !== null ? { reasoning } : {}),
          ...(reasoningDetails !== undefined ? { reasoningDetails } : {}),
          ...(toolCalls !== undefined ? { toolCalls } : {}),
        },
        finishReason: choice.finishReason ?? null,
      },
    ],
    ...idTail,
    ...tail,
  };
}

type SdkChatUsage = NonNullable<ChatStreamChunk["usage"]>;

function reshapeCostDetails(cd: SdkChatUsage["costDetails"]): Record<string, number> | undefined {
  if (cd === null || cd === undefined) {
    return;
  }
  return {
    ...(cd.upstreamInferenceCost !== null && cd.upstreamInferenceCost !== undefined ? { upstreamInferenceCost: cd.upstreamInferenceCost } : {}),
    upstreamInferencePromptCost: cd.upstreamInferencePromptCost,
    upstreamInferenceCompletionsCost: cd.upstreamInferenceCompletionsCost,
  };
}

function reshapePromptDetails(ptd: SdkChatUsage["promptTokensDetails"]): Record<string, number> | undefined {
  if (ptd === null || ptd === undefined) {
    return;
  }
  return {
    ...(ptd.cachedTokens !== undefined ? { cachedTokens: ptd.cachedTokens } : {}),
    ...(ptd.cacheWriteTokens !== undefined ? { cacheWriteTokens: ptd.cacheWriteTokens } : {}),
  };
}

function reshapeCompletionDetails(ctd: SdkChatUsage["completionTokensDetails"]): Record<string, number> | undefined {
  const reasoningTokens = ctd?.reasoningTokens;
  if (reasoningTokens === null || reasoningTokens === undefined) {
    return;
  }
  return { reasoningTokens };
}

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
