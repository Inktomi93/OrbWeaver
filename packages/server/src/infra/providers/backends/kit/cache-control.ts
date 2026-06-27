// infra/providers/backends/kit/cache-control — Anthropic `cache_control` wire constants + the
// provider-routing pin + the breakpoint PLACEMENT primitive. Shared by every HTTP runner that talks to an
// Anthropic-backed endpoint (today: the openrouter chat-completions + responses runners) so none re-derives
// the constant, the anchor, or the block shape.
//
// OpenRouter's `cache_control` is ANTHROPIC-ONLY per its spec ("Currently supported for Anthropic Claude
// models"); non-Anthropic models cache automatically with no field, so we emit it iff the routed model is
// Anthropic. Cache only forms when OpenRouter routes to Anthropic-DIRECT (measured: an unpinned Anthropic
// model can land on an endpoint that silently ignores cache_control → 0 cache writes), so for Anthropic
// models we pin the Anthropic provider, order-only (fallbacks stay on → no reliability cost).
//
// PLACEMENT SPLIT (Esoteric §5): the chat domain COMPUTES the breakpoint offset; the RUNNER PLACES it.
// The openrouter runner's `placeHistoryCacheBreakpoint` (which message/offset + the cacheMinTokens gate)
// lives WITH that runner — it is per-strategy wire-shaping. THIS module provides the mechanical primitive
// the runner builds on: turning a content string into the cache_control-bearing block. So "the runner
// places" and "kit provides the placement helper" both hold.

import type { OpenRouterProviderRouting } from "@orb/contracts/connection";

/** The 5m-TTL `cache_control` directive — no explicit `ttl` field (the default 5m is shippable across
 *  every Anthropic endpoint today). The TTL is in the name so a call site states which it picked; a 1h
 *  variant would need the `anthropic-beta: extended-cache-ttl` header (`@openrouter/sdk` doesn't send it,
 *  and `ttl:"1h"` without it → 0 cache writes), so it is intentionally not offered yet. */
export const ANTHROPIC_CACHE_5M = { type: "ephemeral" } as const;

/** A history/system text block carrying an Anthropic cache breakpoint. The runner converts the message at
 *  its chosen offset into this shape (see {@link cacheControlBlock}). */
export interface CacheControlTextBlock {
  readonly type: "text";
  readonly text: string;
  readonly cacheControl: typeof ANTHROPIC_CACHE_5M;
}

// The load-bearing anchor (Esoteric §7): matches the bare Anthropic id (`claude-opus-…`) and the
// OpenRouter form (`anthropic/claude-…`) ONLY. A third-party fork (`some-org/claude-fork`) does NOT match
// — an alien backend whose name merely contains "claude" must never receive Anthropic-only cache_control.
// Mirrors connection's `detectModelFamily` anchor; both must keep this exact shape.
const ANTHROPIC_MODEL_ANCHOR = /^(?:anthropic\/)?claude[-/]/i;

// OpenRouter's own provider name for the Anthropic-direct route (a wire literal, not a magic constant).
const ANTHROPIC_PROVIDER_NAME = "Anthropic";

/** True when the model id routes to Anthropic — the only family that honors explicit `cache_control`.
 *  Gates the wire send so non-Anthropic models never receive the directive. */
export function isAnthropicModel(model: string): boolean {
  return ANTHROPIC_MODEL_ANCHOR.test(model);
}

/**
 * Resolve the effective OpenRouter provider-routing prefs. A caller-supplied routing always wins (the user
 * is in control). Otherwise, for an Anthropic model we pin the Anthropic provider (order-only) so our
 * `cache_control` is honored; for everything else we return `undefined` (default routing). A fresh object
 * is returned per call so a caller can never mutate a shared singleton.
 */
export function effectiveProviderRouting(
  model: string,
  userRouting: OpenRouterProviderRouting | undefined,
): OpenRouterProviderRouting | undefined {
  if (userRouting !== undefined) {
    return userRouting;
  }
  return isAnthropicModel(model) ? { order: [ANTHROPIC_PROVIDER_NAME] } : undefined;
}

/** The placement primitive (Esoteric §5): wrap a content string into the Anthropic cache_control-bearing
 *  text block. The runner decides WHICH message/offset gets the breakpoint and the token gate; this does
 *  the mechanical block construction so the system-prompt breakpoint and the rolling-tail history
 *  breakpoint emit the identical shape. */
export function cacheControlBlock(text: string): CacheControlTextBlock {
  return { type: "text", text, cacheControl: ANTHROPIC_CACHE_5M };
}
