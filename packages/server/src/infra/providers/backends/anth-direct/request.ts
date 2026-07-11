// infra/providers/backends/anth-direct/request — build the SDK's typed `MessageCreateParams` from the
// `anthropic-messages` arm + the capability-RESOLVED knobs (`resolveChat`). All shaping is a PURE translate
// over SHAPE's already-final history (one shaping home — part 01 route B stays killed). A wire-field typo is
// a compile error (the SDK's typed params). Sealed inside `backends/anth-direct/`; imports only
// `backends/kit` DOWN (the R1 pair placer) + the SDK — never a sibling backend (invariant #2).
//
// THE CACHE PAIR (part 02 §5d): REUSES the kit-hoisted `computeCacheBreakpointOffsets` — the SAME pure
// positional decision the OR chat-completions runner uses — and emits each returned offset as the SDK's
// `CacheControlEphemeral` block dialect (the OR runner emits the OpenAI-compat per-part form; one placer,
// two dialects). Slots: #1 the static system block, #2/#3 the rolling pair = 3 of 4; the 4th stays reserve.

import type {
  MessageCreateParamsStreaming,
  MessageParam,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import { CACHE_MIN_FLOOR } from "@orb/contracts/connection";
import { estimateTokens } from "@orb/kit/tokens";
import type { AnthropicMessagesChatRequest, ResolvedChatKnobs } from "../../contract";
import { ANTHROPIC_CACHE_5M, chatHistoryText, computeCacheBreakpointOffsets } from "../kit";

// The Anthropic Messages roles (a `tool` history row cannot occur — tool-less arm; §5b).
const USER_ROLE = "user";
const ASSISTANT_ROLE = "assistant";
const TEXT_TYPE = "text";

// The per-model minimum cacheable prefix for THIS request — the resolved `turns.cacheMinTokens`, fail-closed
// to `CACHE_MIN_FLOOR` when the capability didn't seed an exact floor (part 01 §4b).
function cacheMinTokens(req: AnthropicMessagesChatRequest): number {
  return req.capability.turns?.cacheMinTokens ?? CACHE_MIN_FLOOR;
}

// The history-cache gate (part 01 §5): the domain-computed PAIR placement is worth it iff the resolver says
// `explicitPromptCache` (an ANTHROPIC-family fact) AND SHAPE handed a safe offset. Returns the offset when
// the gate qualifies, else `undefined`.
function historyCacheGateOffset(req: AnthropicMessagesChatRequest): number | undefined {
  if (req.capability.turns?.explicitPromptCache !== true) {
    return;
  }
  return req.historyCacheBreakpointFromEnd;
}

/**
 * The rolling-tail cache PAIR offsets this turn places (part 02 §5d). REUSES the kit-hoisted
 * `computeCacheBreakpointOffsets` over the per-message token estimate + the static-system contribution.
 * Empty when the gate didn't apply or no offset cleared the per-model floor. Exported so the runner emits
 * the identical offsets on the `provider.cache` receipt (no re-derivation, no wire branch at the emit site).
 */
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

// Map ONE history turn → an Anthropic `MessageParam` (role + a single text block), or `null` when empty. A
// `tool`-role turn cannot occur (tool-less arm) — it is dropped defensively rather than misrouted.
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

// Build the messages array, filtering empty turns FIRST (so the cache-breakpoint offset-from-end SHAPE
// computed still lines up with the placed indices), then pin `cache_control` at the PAIR offsets — each as
// the SDK's `CacheControlEphemeral` block dialect on that message's content.
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
      // Re-express the string content as a single cache_control-bearing text block.
      messages[idx] = {
        role: target.role,
        content: [{ type: TEXT_TYPE, text: target.content, cache_control: ANTHROPIC_CACHE_5M }],
      };
    }
  }
  return messages;
}

// Build the SDK `system` param as a TextBlockParam[]: the STATIC prefix pinned with cache_control (breakpoint
// #1 at the stable prefix — the measured Esoteric-§5 rule), + a plain dynamic-tail block. When the dynamic
// half rides the message-tail channel (part 01 §5 — resolved `dynamicContextChannel === "message-tail"` on a
// mid-conv-system-capable model), the dynamic text is EXCLUDED here (the runner places it as a trailing
// system MESSAGE instead). Empty prefix ⇒ the dynamic-only single block; both empty ⇒ `undefined` (no system).
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

// The SDK `thinking` param from the resolved reasoning (§5c): adaptive models get `{type:"adaptive"}`, budget
// models `{type:"enabled", budget_tokens}`. The funnel already dropped illegal combos (Esoteric §8), so this
// is a pure shape map. `undefined` when reasoning is off (no thinking block on the wire).
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
  // budget-mode with a resolved budget → `enabled`; effort-mode (or a budget-less turn) → no thinking block
  // (the wire carries the effort via the model's own adaptive/enabled default — anth-direct sends no effort
  // dial on the Messages wire; extended thinking is the adaptive/budget axis only).
  return r.mode === "budget" && r.budgetTokens !== undefined
    ? { type: "enabled", budget_tokens: r.budgetTokens }
    : undefined;
}

// The Messages sampling slice from the resolved knobs (§5c) — present only where the part 03 §3 per-model
// capability let them survive the funnel (post-cutoff models resolve `{}`, so the runner never sends a value
// the wire would 400). Field names are the Anthropic wire (snake_case top_p/top_k).
function samplingFields(resolved: ResolvedChatKnobs): Partial<MessageCreateParamsStreaming> {
  const s = resolved.sampling;
  return {
    ...(s.temperature !== undefined ? { temperature: s.temperature } : {}),
    ...(s.topP !== undefined ? { top_p: s.topP } : {}),
    ...(s.topK !== undefined ? { top_k: s.topK } : {}),
    ...(s.stop !== undefined ? { stop_sequences: [...s.stop] } : {}),
  };
}

/**
 * Build the streaming `MessageCreateParams` from the resolved knobs + the request arm. `max_tokens` is
 * REQUIRED on the wire (messages.d.ts:1982) — from the resolved output cap, fail-closed to the model's
 * `output.maxTokens.max` when the user set no explicit cap. Prefill (§5c): a `turns.assistantPrefill:true`
 * turn's trailing assistant message is DELIVERED verbatim by SHAPE (it is already the last history row); a
 * `false` model's history was normalized upstream (the delivery gate) — so the runner never adds/strips a
 * prefill here, it just ships the array SHAPE handed it. The message-tail dynamic system row is appended when
 * the resolved channel is `message-tail` (§5b).
 */
export function buildAnthMessageParams(
  req: AnthropicMessagesChatRequest,
  resolved: ResolvedChatKnobs,
): MessageCreateParamsStreaming {
  const messages = buildMessages(req);
  const system = buildSystem(req, resolved);
  const dynamicText = req.systemPrompt.dynamic.trim();
  if (resolved.dynamicContextChannel === "message-tail" && dynamicText.length > 0) {
    // The cache-safe channel: the volatile dynamic half rides a trailing `system`-role message placed after
    // the last user turn (the part 01 §2 placement rule), first-class instead of hook-smuggled.
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
