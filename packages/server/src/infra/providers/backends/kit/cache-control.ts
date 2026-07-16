// Anthropic `cache_control` wire constants + the provider-routing pin + the breakpoint placement
// primitive, shared by every HTTP runner talking to an Anthropic-backed endpoint. OpenRouter's
// `cache_control` is Anthropic-only, so we emit it iff the routed model is Anthropic, and pin the
// Anthropic provider (order-only) so an unpinned model can't silently land on a non-caching endpoint.
// `computeCacheBreakpointOffsets` is the pure positional core both the openrouter and anth-direct runners
// reuse (backends never import each other); each maps the returned offsets to its own wire dialect.

import type { OpenRouterProviderRouting } from "@orb/contracts/connection";

// No explicit `ttl` field — the default 5m is shippable everywhere; a 1h variant needs a beta header we
// don't send yet.
export const ANTHROPIC_CACHE_5M = { type: "ephemeral" } as const;

export interface CacheControlTextBlock {
  readonly type: "text";
  readonly text: string;
  readonly cacheControl: typeof ANTHROPIC_CACHE_5M;
}

// Matches the bare Anthropic id and the OpenRouter `anthropic/claude-…` form ONLY — a third-party fork
// (`some-org/claude-fork`) must never receive Anthropic-only cache_control. Mirrors connection's
// `detectModelFamily` anchor; both must keep this exact shape.
const ANTHROPIC_MODEL_ANCHOR = /^(?:anthropic\/)?claude[-/]/i;

const ANTHROPIC_PROVIDER_NAME = "Anthropic";

export function isAnthropicModel(model: string): boolean {
  return ANTHROPIC_MODEL_ANCHOR.test(model);
}

// A caller-supplied routing always wins; otherwise pin Anthropic (order-only) so cache_control is honored.
export function effectiveProviderRouting(model: string, userRouting: OpenRouterProviderRouting | undefined): OpenRouterProviderRouting | undefined {
  if (userRouting !== undefined) {
    return userRouting;
  }
  return isAnthropicModel(model) ? { order: [ANTHROPIC_PROVIDER_NAME] } : undefined;
}

export function cacheControlBlock(text: string): CacheControlTextBlock {
  return { type: "text", text, cacheControl: ANTHROPIC_CACHE_5M };
}

// Returns the pair of offsets `depth` and `depth+2` whose cumulative prefix clears the per-model
// cacheMinTokens floor. The deeper offset keeps a cache hit inside Anthropic's 20-block lookback window
// that a single breakpoint drops on a long conversation. Drops the deeper offset when it runs off the
// front or is below the floor; drops both when even `depth` is below the floor.
export function computeCacheBreakpointOffsets(args: {
  readonly messageTokens: readonly number[];
  readonly systemStaticTokens: number;
  readonly offsetFromEnd: number;
  readonly cacheMinTokens: number;
}): readonly number[] {
  const { messageTokens, systemStaticTokens, offsetFromEnd, cacheMinTokens } = args;
  const len = messageTokens.length;
  const placed: number[] = [];
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
