// domain/connection/catalog/turns — the (wire-shape × model) `turns` cell derivation; the ONE place a model
// id/version is read for turn-caps. Two entry points: `refineCuratedTurns` (the curated Claude shortlist
// cell) and `synthesizeAnthropicTurns`/`NON_CACHING_TURNS` (the OR openai-compat synthesis + static arms).

import type { ModelCapability, Range } from "@orb/contracts/connection";
import { CACHE_MIN_FLOOR, TURNS_FLOOR } from "@orb/contracts/connection";
import type { WIRE_SHAPES } from "./wire-shape";

type WireShape = (typeof WIRE_SHAPES)[number];
type Turns = NonNullable<ModelCapability["turns"]>;
type Sampling = ModelCapability["sampling"];

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
const OPUS_41_RE = /opus-4[-.]1/i;
const HAIKU_45_RE = /haiku-4[-.]5/i;
// Pre-cutoff Sonnet ids ONLY — deliberately EXCLUDES sonnet-5 (post-cutoff, fail-closed). SONNET_MODERN_RE
// (which DOES match sonnet-5) is the cache-min lens and must never seed the sampling table.
const SONNET_45_RE = /sonnet-4[-.]5/i;
const SONNET_46_RE = /sonnet-4[-.]6/i;
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
 *  openai-compat + anthropic-direct shapes: opus-4.5/haiku-4.5 `true`, everything newer `false`. */
function anthropicPrefill(id: string, wireShape: WireShape): boolean {
  if (wireShape === "anthropic-cli") {
    return false;
  }
  return OPUS_45_RE.test(id) || HAIKU_45_RE.test(id);
}

/** Mid-conversation system authority per (id × wire-shape). Wire-tested: only Opus 4.8 on anthropic wires. */
function anthropicMidConvSystem(id: string, wireShape: WireShape): boolean {
  const anthropicWire = wireShape === "anthropic-cli" || wireShape === "anthropic-direct";
  return anthropicWire && OPUS_48_RE.test(id);
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

// The direct-transport Claude sampling seed. Post-Opus-4.6 models reject non-default temperature/top_p/
// top_k, so a blanket unlock is a 400 factory. Only the `anthropic-direct` shape gets non-`{}` sampling;
// every curated entry starts `{}` until a hand-run probe verifies its live honor matrix and opens the entry.

/** Anthropic's temperature range is 0–1 (not the OpenAI 0–2). */
export const ANTHROPIC_TEMP_RANGE: Range = { min: 0, max: 1 };
const ANTHROPIC_TOP_P_RANGE: Range = { min: 0, max: 1 };
const ANTHROPIC_TOP_K_RANGE: Range = { min: 0, max: 200 };

/** The full pre-cutoff Messages sampling set — the capability an opened 4.5-era entry resolves to once the
 *  probe confirms its honor matrix. Opening an entry maps its version regex → this in {@link ANTH_DIRECT_SAMPLING}. */
export const ANTH_DIRECT_PRE_CUTOFF_SAMPLING: Sampling = {
  temperature: ANTHROPIC_TEMP_RANGE,
  topP: ANTHROPIC_TOP_P_RANGE,
  topK: ANTHROPIC_TOP_K_RANGE,
  stop: true,
};

/** Per-(anthropic model version) direct-transport sampling seed. An entry opens ONLY after the hand-run
 *  first-party probe (`pnpm sdk:anth-direct-cache-probe --arm anth-first-party`) confirms a clean 200-trio
 *  for that model on the REAL `api.anthropic.com` wire; most-specific pattern first. Everything else stays
 *  fail-closed `{}` (post-cutoff models 400 on temperature/top_p/top_k).
 *
 *  PROBED (first-party wire, raw api.anthropic.com) — the cutoff is EXACTLY Opus 4.6:
 *    2026-07-17: Haiku 4.5 (`claude-haiku-4-5-…`) → all 200 → OPEN. Opus 4.8 + Sonnet 5 → 400
 *      ("`<knob>` is deprecated for this model") → fail-closed.
 *    2026-07-18: Opus 4.1 / 4.5 / 4.6 and Sonnet 4.5 / 4.6 → all 200 (temperature/top_p/top_k) → OPEN;
 *      Opus 4.7 + Fable 5 → 400 → fail-closed. So every id at/below Opus 4.6 honors sampling; every id
 *      released after Opus 4.6 (opus-4.7/4.8, sonnet-5, fable-5) refuses it — matching the SDK deprecation.
 *  NOTE: the OR-skin (`--arm anth-direct`) is NOT a valid seeder — it validates temperature against the
 *  OpenAI 0–2 range, so its 200s do not reflect raw Anthropic honor. */
const ANTH_DIRECT_SAMPLING: readonly (readonly [RegExp, Sampling])[] = [
  [OPUS_41_RE, ANTH_DIRECT_PRE_CUTOFF_SAMPLING],
  [OPUS_45_RE, ANTH_DIRECT_PRE_CUTOFF_SAMPLING],
  [OPUS_46_RE, ANTH_DIRECT_PRE_CUTOFF_SAMPLING],
  [SONNET_45_RE, ANTH_DIRECT_PRE_CUTOFF_SAMPLING],
  [SONNET_46_RE, ANTH_DIRECT_PRE_CUTOFF_SAMPLING],
  [HAIKU_45_RE, ANTH_DIRECT_PRE_CUTOFF_SAMPLING],
];

/** The direct-transport sampling capability for a Claude id. Only `anthropic-direct` reaches a non-`{}`
 *  seed; every other shape returns `base` unchanged. */
export function refineAnthDirectSampling(id: string, wireShape: WireShape, base: Sampling): Sampling {
  if (wireShape !== "anthropic-direct") {
    return base;
  }
  for (const [pattern, seed] of ANTH_DIRECT_SAMPLING) {
    if (pattern.test(id)) {
      return seed;
    }
  }
  return {};
}
