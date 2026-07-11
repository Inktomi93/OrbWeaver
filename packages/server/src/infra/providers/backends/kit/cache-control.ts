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
// PLACEMENT SPLIT (Esoteric §5 / R1): the chat domain COMPUTES the ONE safe breakpoint offset; the RUNNER
// PLACES the rolling PAIR (`depth` AND `depth+2`). The pure positional core — `computeCacheBreakpointOffsets`
// (which offsets clear the per-model `cacheMinTokens` floor) — is HOISTED HERE so BOTH the openrouter
// chat-completions runner and the anth-direct runner reuse it (backends never import each other, invariant
// #2); each runner then emits its own wire dialect (`ChatContentText` per-block vs the SDK's
// `CacheControlEphemeral`) at the returned offsets. THIS module also provides the block primitive
// (`cacheControlBlock`). So "the runner places" and "kit provides the placement core" both hold.

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

/**
 * The pure positional core of the R1 rolling cache PAIR (part 01 §1d / part 02 §5d). From the ONE safe
 * offset-from-end SHAPE computed, return the pair of offsets `depth` AND `depth+2` whose cumulative prefix
 * (systemStatic + every message up to and including the target) clears the per-model `cacheMinTokens`
 * floor. Both breakpoints sit on already-cached stable content, so the deeper (`depth+2`) read is FREE —
 * it keeps a cache hit inside Anthropic's 20-block lookback window that a single breakpoint drops on a long
 * conversation. Drops the deeper offset when it runs off the front of the array or its prefix is below the
 * floor; drops BOTH (returns `[]`) when even `depth` is below the floor. No wire types — each runner maps
 * the returned offsets to its own block dialect (the openrouter `ChatContentText` per-part form, the
 * anth-direct `CacheControlEphemeral` block). The single-breakpoint code this replaces was the regression.
 */
export function computeCacheBreakpointOffsets(args: {
  /** Per-message prefix token contribution, in message order (0 for a message with no cacheable text). */
  readonly messageTokens: readonly number[];
  /** The static system-block tokens — they count toward the prefix floor (the system block is first). */
  readonly systemStaticTokens: number;
  /** The ONE safe offset-from-end SHAPE computed (the last stable message). */
  readonly offsetFromEnd: number;
  /** The per-model minimum cacheable prefix (tokens); a breakpoint below it burns a slot for no cache. */
  readonly cacheMinTokens: number;
}): readonly number[] {
  const { messageTokens, systemStaticTokens, offsetFromEnd, cacheMinTokens } = args;
  const len = messageTokens.length;
  const placed: number[] = [];
  // `depth` first (the nearer breakpoint), then `depth+2` (the deeper, more-stable one). The deeper is
  // FURTHER from the end, so it is only worth placing when the nearer one already qualified.
  for (const offset of [offsetFromEnd, offsetFromEnd + 2]) {
    const targetIdx = len - 1 - offset;
    if (targetIdx < 0) {
      continue;
    }
    let prefixTokens = systemStaticTokens;
    for (let i = 0; i <= targetIdx; i += 1) {
      prefixTokens += messageTokens[i] ?? 0;
    }
    if (prefixTokens >= cacheMinTokens) {
      placed.push(offset);
    }
  }
  return placed;
}
