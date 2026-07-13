// Builds the SDK's typed `MessageCreateParams` from the `anthropic-messages` arm + the capability-resolved
// knobs. Reuses the kit-hoisted cache-breakpoint placer (same positional decision as the OR chat-completions
// runner), emitted as the SDK's `CacheControlEphemeral` dialect. Sealed: imports only `backends/kit` + SDK.

import type {
  MessageCreateParamsStreaming,
  MessageParam,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import { CACHE_MIN_FLOOR } from "@orb/contracts/connection";
import { estimateTokens } from "@orb/kit/tokens";
import type { AnthropicMessagesChatRequest, ResolvedChatKnobs } from "../../contract";
import { ANTHROPIC_CACHE_5M, chatHistoryText, computeCacheBreakpointOffsets } from "../kit";

// A `tool` history row cannot occur — tool-less arm.
const USER_ROLE = "user";
const ASSISTANT_ROLE = "assistant";
const TEXT_TYPE = "text";

function cacheMinTokens(req: AnthropicMessagesChatRequest): number {
  return req.capability.turns?.cacheMinTokens ?? CACHE_MIN_FLOOR;
}

function historyCacheGateOffset(req: AnthropicMessagesChatRequest): number | undefined {
  if (req.capability.turns?.explicitPromptCache !== true) {
    return;
  }
  return req.historyCacheBreakpointFromEnd;
}

/** Exported so the runner emits the identical offsets on the `provider.cache` receipt. */
export function anthHistoryCacheOffsets(req: AnthropicMessagesChatRequest): readonly number[] {
  const offsetFromEnd = historyCacheGateOffset(req);
  if (offsetFromEnd === undefined) {
    return [];
  }
  return computeCacheBreakpointOffsets({
    messageTokens: req.history.map((turn) => estimateTokens(chatHistoryText(turn.content))),
    systemStaticTokens: estimateTokens(req.systemPrompt.static),
    offsetFromEnd,
    cacheMinTokens: cacheMinTokens(req),
  });
}

function toMessageParam(
  turn: AnthropicMessagesChatRequest["history"][number],
): MessageParam | null {
  if (turn.role === "tool") {
    return null;
  }
  const text = chatHistoryText(turn.content);
  if (text.trim().length === 0) {
    return null;
  }
  const role = turn.role === "assistant" ? ASSISTANT_ROLE : USER_ROLE;
  return { role, content: text };
}

// Filters empty turns first so the offset-from-end still lines up with the placed indices.
function buildMessages(req: AnthropicMessagesChatRequest): MessageParam[] {
  const messages: MessageParam[] = [];
  for (const turn of req.history) {
    const param = toMessageParam(turn);
    if (param !== null) {
      messages.push(param);
    }
  }
  const offsets = anthHistoryCacheOffsets(req);
  for (const offset of offsets) {
    const idx = messages.length - 1 - offset;
    const target = messages[idx];
    if (target !== undefined && typeof target.content === "string") {
      messages[idx] = {
        role: target.role,
        content: [{ type: TEXT_TYPE, text: target.content, cache_control: ANTHROPIC_CACHE_5M }],
      };
    }
  }
  return messages;
}

// Static prefix pinned with cache_control (breakpoint #1). When the dynamic half rides the message-tail
// channel, the dynamic text is excluded here — the runner places it as a trailing system message instead.
function buildSystem(
  req: AnthropicMessagesChatRequest,
  resolved: ResolvedChatKnobs,
): TextBlockParam[] | undefined {
  const staticText = req.systemPrompt.static.trim();
  const dynamicText = req.systemPrompt.dynamic.trim();
  const dynamicInSystem =
    resolved.dynamicContextChannel !== "message-tail" && dynamicText.length > 0;
  const blocks: TextBlockParam[] = [];
  if (staticText.length > 0) {
    blocks.push({ type: TEXT_TYPE, text: staticText, cache_control: ANTHROPIC_CACHE_5M });
  }
  if (dynamicInSystem) {
    blocks.push({ type: TEXT_TYPE, text: dynamicText });
  }
  return blocks.length > 0 ? blocks : undefined;
}

// Adaptive models get `{type:"adaptive"}`, budget models `{type:"enabled", budget_tokens}`.
function buildThinking(
  resolved: ResolvedChatKnobs,
): MessageCreateParamsStreaming["thinking"] | undefined {
  const r = resolved.reasoning;
  if (!r.enabled) {
    return;
  }
  if (r.mode === "adaptive") {
    return { type: "adaptive" };
  }
  return r.mode === "budget" && r.budgetTokens !== undefined
    ? { type: "enabled", budget_tokens: r.budgetTokens }
    : undefined;
}

function samplingFields(resolved: ResolvedChatKnobs): Partial<MessageCreateParamsStreaming> {
  const s = resolved.sampling;
  return {
    ...(s.temperature !== undefined ? { temperature: s.temperature } : {}),
    ...(s.topP !== undefined ? { top_p: s.topP } : {}),
    ...(s.topK !== undefined ? { top_k: s.topK } : {}),
    ...(s.stop !== undefined ? { stop_sequences: [...s.stop] } : {}),
  };
}

/** `max_tokens` is required on the wire; fail-closed to the model's max when no explicit cap was set. */
export function buildAnthMessageParams(
  req: AnthropicMessagesChatRequest,
  resolved: ResolvedChatKnobs,
): MessageCreateParamsStreaming {
  const messages = buildMessages(req);
  const system = buildSystem(req, resolved);
  const dynamicText = req.systemPrompt.dynamic.trim();
  if (resolved.dynamicContextChannel === "message-tail" && dynamicText.length > 0) {
    messages.push({ role: "system", content: dynamicText });
  }
  const maxTokens = resolved.maxOutputTokens ?? req.capability.output.maxTokens.max;
  const thinking = buildThinking(resolved);
  return {
    model: req.model,
    max_tokens: maxTokens,
    messages,
    stream: true,
    ...(system !== undefined ? { system } : {}),
    ...(thinking !== undefined ? { thinking } : {}),
    ...samplingFields(resolved),
  };
}
