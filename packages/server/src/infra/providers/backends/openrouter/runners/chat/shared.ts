// infra/providers/backends/openrouter/runners/chat/shared — the wire-shaping helpers BOTH openrouter chat
// runners (chat-completions + responses) lean on: message assembly, the system-prompt cache split, the
// sampling/reasoning projection, the provider-routing pin, the customParameters overlay, the
// mandatory-reasoning detector, and the SDK→kit stream-chunk reshaper. Pure data shaping over the SDK's
// typed request/response shapes — no transport, no clock. Imports the shared `backends/kit` wire helpers
// DOWN (strategy isolation); never reaches a sibling backend.

import type {
  ChatContentText,
  ChatMessages,
  ChatRequest,
  ChatStreamChunk,
  ChatSystemMessage,
  ProviderPreferences,
  ReasoningDetailUnion,
} from "@openrouter/sdk/models";
import type { ModelCapability, OpenRouterProviderRouting } from "@orb/contracts/connection";
import type { UserIntent } from "@orb/contracts/preset";
import { errorMessage } from "@orb/kit/error-message";
import type { ChatCompletionStreamChunk, ReasoningRequest } from "../../../../backends/kit";
import {
  cacheControlBlock,
  effectiveProviderRouting,
  extractHttpErrorDiagnostic,
} from "../../../../backends/kit";

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
/** Map the assembled view turns → SDK chat messages, filtering empty-content turns FIRST (so the
 *  cache-breakpoint offset-from-end the chat pipeline computed still lines up). The per-participant `name`
 *  rides through (COMPLETION names behaviour). */
export function buildHistoryMessages(
  history: ReadonlyArray<{
    readonly role: "user" | "assistant";
    readonly content: string;
    readonly name?: string | undefined;
  }>,
): ChatMessages[] {
  const messages: ChatMessages[] = [];
  for (const turn of history) {
    if (turn.content.trim().length === 0) {
      continue;
    }
    messages.push({
      role: turn.role,
      content: turn.content,
      ...(turn.name !== undefined ? { name: turn.name } : {}),
    });
  }
  return messages;
}

// ── Sampling projection ──────────────────────────────────────────────────────────────────────────
/** The chat-completions sampling slice (camelCase — the SDK serializes to snake_case). Each field is
 *  emitted only when the user set it. `maxCompletionTokens` (not the deprecated `maxTokens`) carries the
 *  output cap. Capability-gating (dropping a knob the model can't honor) is `resolve-chat`'s job upstream;
 *  this projects what the user set and lets OpenRouter ignore the rest. */
export function chatSamplingFields(params: UserIntent): Partial<ChatRequest> {
  return {
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    ...(params.topP !== undefined ? { topP: params.topP } : {}),
    ...(params.topK !== undefined ? { topK: params.topK } : {}),
    ...(params.frequencyPenalty !== undefined ? { frequencyPenalty: params.frequencyPenalty } : {}),
    ...(params.presencePenalty !== undefined ? { presencePenalty: params.presencePenalty } : {}),
    ...(params.repetitionPenalty !== undefined
      ? { repetitionPenalty: params.repetitionPenalty }
      : {}),
    ...(params.seed !== undefined ? { seed: params.seed } : {}),
    ...(params.logitBias !== undefined ? { logitBias: params.logitBias } : {}),
    ...(params.stop !== undefined ? { stop: params.stop } : {}),
    ...(params.maxOutputTokens !== undefined
      ? { maxCompletionTokens: params.maxOutputTokens }
      : {}),
  };
}

// ── Reasoning request (the Opus 4.8 adaptive/budget guard, Esoteric §8) ────────────────────────────
/**
 * Build the kit {@link ReasoningRequest} the wire-block builders project. THE ADAPTIVE GUARD: an Opus-4.8
 * -class model whose capability reports `reasoning.mode === "adaptive"` rejects an explicit
 * `budget_tokens` (live 400) — so for an adaptive model the budget is DROPPED (effort-only); other modes
 * keep the user's `thinkingBudgetTokens` when present. `enabled` is the on/off axis: reasoning runs unless
 * the capability says the model can't reason or the user picked `effort:"none"`.
 */
export function buildReasoningRequest(
  params: UserIntent,
  capability: ModelCapability,
): ReasoningRequest {
  const enabled = capability.reasoning.mode !== "none" && params.effort !== "none";
  const isAdaptive = capability.reasoning.mode === "adaptive";
  const budgetTokens = isAdaptive ? undefined : params.thinkingBudgetTokens;
  return {
    enabled,
    ...(params.effort !== undefined ? { effort: params.effort } : {}),
    ...(budgetTokens !== undefined ? { budgetTokens } : {}),
  };
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
