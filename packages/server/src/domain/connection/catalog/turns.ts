// domain/connection/catalog/turns — the (wire-shape × model) `turns` cell derivation; the ONE place a model
// id/version is read for turn-caps. Two entry points: `refineCuratedTurns` (the curated Claude shortlist
// cell) and `synthesizeAnthropicTurns`/`NON_CACHING_TURNS` (the OR openai-compat synthesis + static arms).

import type { ModelCapability } from "@orb/contracts/connection";
import { CACHE_MIN_FLOOR, TURNS_FLOOR } from "@orb/contracts/connection";
import type { WIRE_SHAPES } from "./wire-shape";

type WireShape = (typeof WIRE_SHAPES)[number];
type Turns = NonNullable<ModelCapability["turns"]>;

// Per-model min cacheable-prefix floors. A version not listed falls to CACHE_MIN_FLOOR so an unseeded
// arm never under-caches.
const HAIKU_45_MIN = 4096;
const OPUS_48_MIN = 1024;
const OPUS_47_MIN = 2048;
const OPUS_LEGACY_MIN = 4096; // Opus 4.6 / 4.5
const SONNET_MODERN_MIN = 1024; // Sonnet 5 / 4.6 / 4.5
const FABLE_MYTHOS_MIN = 512; // Fable 5 / Mythos 5

// Version tokens read from the id. Anchored so a fork id that merely contains the token can't false-match.
const OPUS_48_RE = /opus-4[-.]8/i;
const OPUS_47_RE = /opus-4[-.]7/i;
const OPUS_46_RE = /opus-4[-.]6/i;
const OPUS_45_RE = /opus-4[-.]5/i;
const HAIKU_45_RE = /haiku-4[-.]5/i;
const SONNET_MODERN_RE = /sonnet-(?:5|4[-.]6|4[-.]5)/i;
const FABLE_5_RE = /fable-5/i;
const MYTHOS_5_RE = /mythos-5/i;

/** The per-model cacheMinTokens. Falls to CACHE_MIN_FLOOR for a version not in the table (fail-closed). */
function anthropicCacheMin(id: string): number {
  if (OPUS_48_RE.test(id)) {
    return OPUS_48_MIN;
  }
  if (OPUS_47_RE.test(id)) {
    return OPUS_47_MIN;
  }
  if (OPUS_46_RE.test(id) || OPUS_45_RE.test(id)) {
    return OPUS_LEGACY_MIN;
  }
  if (HAIKU_45_RE.test(id)) {
    return HAIKU_45_MIN;
  }
  if (SONNET_MODERN_RE.test(id)) {
    return SONNET_MODERN_MIN;
  }
  if (FABLE_5_RE.test(id) || MYTHOS_5_RE.test(id)) {
    return FABLE_MYTHOS_MIN;
  }
  return CACHE_MIN_FLOOR;
}

/** Assistant-prefill honor per (id × wire-shape). The CLI transport never emits prefill. On the
 *  openai-compat shape: opus-4.5/haiku-4.5 `true`, everything newer `false`. */
function anthropicPrefill(id: string, wireShape: WireShape): boolean {
  if (wireShape === "anthropic-cli") {
    return false;
  }
  return OPUS_45_RE.test(id) || HAIKU_45_RE.test(id);
}

/** Mid-conversation system authority per (id × wire-shape). Wire-tested: only Opus 4.8 on the anthropic wire. */
function anthropicMidConvSystem(id: string, wireShape: WireShape): boolean {
  return wireShape === "anthropic-cli" && OPUS_48_RE.test(id);
}

/** The curated Claude shortlist `turns` cell for the resolved wire-shape. Every Claude arm is
 *  `roleHandlingFloor:"strict"` + `explicitPromptCache:true` with the per-version `cacheMinTokens`. */
export function refineCuratedTurns(id: string, wireShape: WireShape): Turns {
  return {
    assistantPrefill: anthropicPrefill(id, wireShape),
    midConversationSystem: anthropicMidConvSystem(id, wireShape),
    roleHandlingFloor: "strict",
    explicitPromptCache: true,
    cacheMinTokens: anthropicCacheMin(id),
  };
}

/** The OR openai-compat synthesis `turns` cell for an anthropic-family model. Only anthropic reaches this
 *  — every other family gets `NON_CACHING_TURNS` (the caller family-gates). */
export function synthesizeAnthropicTurns(id: string, wireShape: WireShape): Turns {
  return {
    assistantPrefill: anthropicPrefill(id, wireShape),
    midConversationSystem: anthropicMidConvSystem(id, wireShape),
    roleHandlingFloor: "strict",
    explicitPromptCache: true,
    cacheMinTokens: anthropicCacheMin(id),
  };
}

/** The non-caching `turns` cell — TURNS_FLOOR with an explicit `strict` floor (fail-closed for every
 *  non-anthropic family + the static arms). */
export const NON_CACHING_TURNS: Turns = { ...TURNS_FLOOR };
