// Anthropic `cache_control` wire constants + the provider-routing pin + the breakpoint placement
// primitive, shared by every HTTP runner talking to an Anthropic-backed endpoint. OpenRouter's
// `cache_control` is Anthropic-only, so we emit it iff the routed model is Anthropic, and pin the
// Anthropic provider (order + allow_fallbacks:false) so an unpinned model can't silently land on a
// non-caching endpoint. Measured wire facts (ttl "1h" honored, the fallback leak, the silent invalid-ttl
// drop) are recorded in docs/design/openrouter-provider-findings.md §1–§3.
// `computeCacheBreakpointOffsets` is the pure positional core the openrouter runner maps onto its own
// wire dialect.

import type { OpenRouterProviderRouting } from "@orb/contracts/connection";
import { providerLog } from "./provider-log";

const EPHEMERAL = "ephemeral";

// The two TTLs the Anthropic cache accepts. The allowlist is load-bearing, not decoration: an UNKNOWN ttl
// is NOT an upstream error — OpenRouter answers 200 and silently drops the WHOLE `cache_control` block
// (measured `ttl:"9z"` → cacheWrite 0, cacheRead 0, ~10x the cost of a cached turn, no signal anywhere;
// docs/design/openrouter-provider-findings.md §3). Nothing else stands between a typo and a silent 10x bill.
export const CACHE_TTLS = ["5m", "1h"] as const;
// Module-local by design: infra is not a type home (`no-inline-types`), and no consumer outside this file
// needs to NAME the union — the exported tuple + the directive interface carry it.
type CacheTtl = (typeof CACHE_TTLS)[number];

export interface AnthropicCacheDirective {
  readonly type: typeof EPHEMERAL;
  /** Absent = the provider default (5m). Only a CACHE_TTLS member ever reaches the wire. */
  readonly ttl?: CacheTtl | undefined;
}

// The ONE seam a ttl becomes a wire directive by. An off-allowlist value is STRIPPED (leaving the bare
// ephemeral directive — the always-accepted 5m default) and logged loud rather than shipped: upstream gives
// no signal at all, so this warning IS the signal (D41 no-silent-degrade).
export function anthropicCacheDirective(ttl: string): AnthropicCacheDirective {
  const allowed = CACHE_TTLS.find((candidate) => candidate === ttl);
  if (allowed !== undefined) {
    return { type: EPHEMERAL, ttl: allowed };
  }
  providerLog("openrouter", "warn", "provider.cache_ttl_rejected", { ttl, accepted: [...CACHE_TTLS], applied: null });
  return { type: EPHEMERAL };
}

// 1h IS honored on the OpenRouter wire with NO `anthropic-beta` header — measured on the cache-write price
// multiplier (5m writes bill 1.25x base input, 1h writes 2.0x; findings §1). The beta header is an
// Anthropic-DIRECT requirement that OpenRouter handles for us, so the old "a 1h variant needs a beta header
// we don't send" note was simply wrong. Economics on a ~10k stable prefix: a 1h write costs +$0.0198 over
// base and saves $0.0228 the first time a session goes quiet for more than five minutes — which, for RP
// think-gaps, is essentially always. A direct-Anthropic backend must NOT reuse this constant without
// sending the beta header itself. Typed `CacheTtl` (compile-time seal) AND built through the guard, so the
// validated path is the only path a ttl reaches the wire by.
const SHIPPED_CACHE_TTL: CacheTtl = "1h";
export const ANTHROPIC_CACHE_1H: AnthropicCacheDirective = anthropicCacheDirective(SHIPPED_CACHE_TTL);

export interface CacheControlTextBlock {
  readonly type: "text";
  readonly text: string;
  readonly cacheControl: AnthropicCacheDirective;
}

// Matches the bare Anthropic id and the OpenRouter `anthropic/claude-…` form ONLY — a third-party fork
// (`some-org/claude-fork`) must never receive Anthropic-only cache_control. Mirrors connection's
// `detectModelFamily` anchor; both must keep this exact shape.
const ANTHROPIC_MODEL_ANCHOR = /^(?:anthropic\/)?claude[-/]/i;

const ANTHROPIC_PROVIDER_NAME = "Anthropic";

export function isAnthropicModel(model: string): boolean {
  return ANTHROPIC_MODEL_ANCHOR.test(model);
}

// A caller-supplied routing always wins; otherwise pin Anthropic (order + NO fallbacks) so cache_control is
// honored. `order` ALONE does not pin: `allow_fallbacks` defaults TRUE, and a probe caught a turn walking
// Anthropic → Bedrock → Azure → Google — every hop a non-Anthropic endpoint that ignores `cache_control`
// and re-bills the whole prefix (findings §2). This arm runs only when the user supplied NO routing, so it
// can never override a user's own fallback choice; the MODEL-level chain is the orthogonal `models[]` axis
// (`resolveFallbackModels`, which reads that same user routing) and is unaffected.
export function effectiveProviderRouting(model: string, userRouting: OpenRouterProviderRouting | undefined): OpenRouterProviderRouting | undefined {
  if (userRouting !== undefined) {
    return userRouting;
  }
  return isAnthropicModel(model) ? { order: [ANTHROPIC_PROVIDER_NAME], allow_fallbacks: false } : undefined;
}

export function cacheControlBlock(text: string): CacheControlTextBlock {
  return { type: "text", text, cacheControl: ANTHROPIC_CACHE_1H };
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
