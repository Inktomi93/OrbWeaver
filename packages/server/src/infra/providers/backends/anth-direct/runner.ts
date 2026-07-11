// infra/providers/backends/anth-direct/runner — ONE chat turn over the `@anthropic-ai/sdk`
// `messages.create({stream:true})`. STATELESS (part 02 §5e): no session store, no seed/resume — Anthropic's
// prefix cache is content-keyed, so byte-stable request building IS the cache strategy. Owns the funnel call
// (`resolveChat`), the request build (`buildAnthMessageParams` — the R1 pair via the kit placer), the stream
// reduce (`reduceAnthStream`), the result map → `ChatResult`, the error map (`anthDirectError` — the kit
// classification path), and the `provider.turn`/`provider.cache` emit (the kit sink, metadata-only, §5/§6).
//
// Imports `backends/kit` DOWN + the SDK; never reaches a sibling backend (invariant #2).

import { CACHE_MIN_FLOOR } from "@orb/contracts/connection";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AnthropicMessagesChatRequest, ChatResult, ChatUsage } from "../../contract";
import { normalizeFinishReason } from "../../contract";
import { resolveChat } from "../../resolve-chat";
import { logProviderCache, turnAbortSignal } from "../kit";
import type { AnthClient } from "./client";
import { anthDirectError } from "./errors";
import { logAnthDirectError, logAnthDirectTurn } from "./log";
import type { AnthReducedTurn } from "./reducer";
import { reduceAnthStream } from "./reducer";
import { anthHistoryCacheOffsets, buildAnthMessageParams } from "./request";

/** The deps `entry/` injects (via the family factory). `now` is REQUIRED — the composition root owns the
 *  clock (the `no-raw-clock` determinism seam). */
export interface AnthDirectChatDeps {
  readonly now: () => number;
}

// The `provider.cache` receipt (part 05 §3a) — THE cache-rot signal. Decoupled: reads RESOLVED facts (usage
// counts + the placer's returned offsets + the resolved floor), NO model-id/wire branch. Only turns on an
// `explicitPromptCache` wire (the static system block is breakpoint #1; the rolling pair adds #2/#3).
function emitCacheReceipt(req: AnthropicMessagesChatRequest, usage: ChatUsage): void {
  if (req.capability.turns?.explicitPromptCache !== true) {
    return;
  }
  const offsets = anthHistoryCacheOffsets(req);
  const total = usage.cacheReadTokens + usage.cacheWriteTokens;
  logProviderCache("anth-direct", {
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    // The static system block is breakpoint #1 (a non-empty static prefix always pins one on this wire); the
    // rolling pair adds the rest.
    breakpointsPlaced: (req.systemPrompt.static.trim().length > 0 ? 1 : 0) + offsets.length,
    breakpointOffsets: offsets,
    hitRatio: total > 0 ? usage.cacheReadTokens / total : 0,
    // The floor the placer actually used (fail-closed to CACHE_MIN_FLOOR when the capability didn't seed
    // an exact per-model floor — matches request.ts `cacheMinTokens`, so the receipt reports the real gate).
    minCacheTokens: req.capability.turns?.cacheMinTokens ?? CACHE_MIN_FLOOR,
  });
}

// Map the reduced stream + capability provenance → the cross-backend `ChatUsage`. The Messages API doesn't
// return the OR cost tail on `/v1/messages`, so per-phase cost fields are `null` (verify-then-add, §5e).
function mapUsage(
  req: AnthropicMessagesChatRequest,
  reduced: AnthReducedTurn,
  maxOutputTokens: number,
): ChatUsage {
  return {
    model: req.model,
    tokensIn: reduced.inputTokens,
    tokensOut: reduced.outputTokens,
    cacheReadTokens: reduced.cacheReadTokens,
    cacheWriteTokens: reduced.cacheWriteTokens,
    cacheCreation5mTokens: reduced.cacheCreation5mTokens,
    cacheCreation1hTokens: reduced.cacheCreation1hTokens,
    reasoningTokens: null,
    contextWindow: req.capability.context.window,
    maxOutputTokens,
    webSearchRequests: 0,
    costUsd: 0,
    costDetails: null,
    isByok: null,
  };
}

// Map the reduced stream → the cross-backend `ChatResult`. Stateless-backend semantics: no
// session/heal/warm-spare/context-usage/mcp fields (`null`/absent, §5e).
function mapResult(
  req: AnthropicMessagesChatRequest,
  reduced: AnthReducedTurn,
  durationApiMs: number,
  maxOutputTokens: number,
): ChatResult {
  return {
    reply: reduced.reply,
    reasoning: reduced.reasoning,
    reasoningRedacted: reduced.reasoningRedacted,
    stopReason: reduced.stopReason,
    terminalReason: null,
    finishReason: normalizeFinishReason(reduced.stopReason),
    ttftMs: reduced.firstDeltaAt,
    warmSpareClaimed: null,
    durationApiMs,
    apiErrorStatus: null,
    numTurns: 1,
    usage: mapUsage(req, reduced, maxOutputTokens),
    events: [],
    rateLimit: null,
  };
}

/**
 * Run one anth-direct chat turn. The credential is already the resolved OR key (the family factory ran the
 * fail-closed guard); `client` is the belted, per-key SDK client. Opens the stream (idle-abort wrapped),
 * reduces it, maps the result, emits `provider.turn` + `provider.cache`, and maps any failure through the
 * kit classification path (`anthDirectError`) — the credential NEVER appears in a log/event/error (§6).
 */
export async function runAnthDirectTurn(
  client: AnthClient,
  req: AnthropicMessagesChatRequest,
  deps: AnthDirectChatDeps,
): Promise<ChatResult> {
  const startedAt = deps.now();
  const resolved = resolveChat(req.params, req.capability);
  const params = buildAnthMessageParams(req, resolved);
  const maxOutputTokens = params.max_tokens;
  const chatId = castId<ChatId>(req.chatId ?? "");
  const idle = turnAbortSignal(req.signal);
  try {
    const stream = await client.messages.create(params, { signal: idle.signal });
    const reduced = await reduceAnthStream(stream, {
      chatId,
      startedAt,
      now: deps.now,
      onChunk: idle.reset,
      ...(req.onDelta !== undefined ? { onDelta: req.onDelta } : {}),
    });
    const durationApiMs = deps.now() - startedAt;
    const result = mapResult(req, reduced, durationApiMs, maxOutputTokens);
    emitCacheReceipt(req, result.usage);
    logAnthDirectTurn({
      ...(req.chatId !== undefined ? { chatId: req.chatId } : {}),
      transport: "direct",
      credentialSource: req.credential.source,
      requestedModel: req.model,
      finishReason: result.finishReason,
      durationMs: durationApiMs,
      ttftMs: result.ttftMs,
      ok: true,
      usage: {
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        cacheReadTokens: result.usage.cacheReadTokens,
        cacheWriteTokens: result.usage.cacheWriteTokens,
      },
    });
    return result;
  } catch (err) {
    const providerError = anthDirectError(err, req.model, deps.now());
    logAnthDirectError(providerError);
    logAnthDirectTurn({
      ...(req.chatId !== undefined ? { chatId: req.chatId } : {}),
      transport: "direct",
      credentialSource: req.credential.source,
      requestedModel: req.model,
      ok: false,
    });
    throw providerError;
  } finally {
    idle.dispose();
  }
}
