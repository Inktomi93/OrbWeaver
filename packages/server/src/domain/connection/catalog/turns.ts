// domain/connection/catalog/turns — the (WIRE-SHAPE × MODEL) `turns` cell derivation (D66, part 01 §4b).
//
// The ONE place a model id / version is read for turn-caps (§4b: "the ONE place allowed to read a model
// id"). Everything OUTSIDE `turns` is shape-invariant; only this axis is refined per wire-shape, so the
// resolver's curated-first short-circuit stays correct for reasoning/sampling/output/context.
//
// Two entry points:
//   • refineCuratedTurns(id, tier, wireShape) — the curated Claude shortlist cell (part 01 §3.3): honor
//     facts from the 2026-07-10 live matrix (part 01 §2), selected for the resolved shape.
//   • synthesizeAnthropicTurns / NON_CACHING_TURNS — the OR openai-compat synthesis + static arms (§4b):
//     anthropic family ⇒ explicitPromptCache TRUE + per-version cacheMinTokens; every other family FALSE.
//
// W1 SEEDS every cell to TODAY's behavior so no later reader changes current output (part 04 §1):
// `explicitPromptCache:true` for ANTHROPIC only, the per-model `cacheMinTokens`, `roleHandlingFloor:"strict"`
// on every Claude arm, `assistantPrefill:false` on the `cli`/agent-sdk shape, `midConversationSystem`
// matching the wire-honor fact. Non-anthropic ⇒ TURNS_FLOOR (behavior-neutral: no runner cache-places today
// where the flag is false).

import type { ModelCapability, Range } from "@orb/contracts/connection";
import { CACHE_MIN_FLOOR, TURNS_FLOOR } from "@orb/contracts/connection";
import type { WIRE_SHAPES } from "./wire-shape";

type WireShape = (typeof WIRE_SHAPES)[number];
type Turns = NonNullable<ModelCapability["turns"]>;
type Sampling = ModelCapability["sampling"];

// ── Per-model min cacheable-prefix floors (part 02 §5d table). The exact Anthropic per-model minimum below
//    which a cache breakpoint burns a slot without forming an entry. A version NOT listed falls to
//    CACHE_MIN_FLOOR (the conservative highest-common floor) so an unseeded arm never under-caches. ──────
const HAIKU_45_MIN = 4096;
const OPUS_48_MIN = 1024;
const OPUS_47_MIN = 2048;
const OPUS_LEGACY_MIN = 4096; // Opus 4.6 / 4.5
const SONNET_MODERN_MIN = 1024; // Sonnet 5 / 4.6 / 4.5
const FABLE_MYTHOS_MIN = 512; // Fable 5 / Mythos 5

// Version tokens read from the id (resolver-internal — the ONE model-id read, §4b). Anchored so a fork id
// that merely contains the token can't false-match (the id is already anthropic-family-gated by the caller).
const OPUS_48_RE = /opus-4[-.]8/i;
const OPUS_47_RE = /opus-4[-.]7/i;
const OPUS_46_RE = /opus-4[-.]6/i;
const OPUS_45_RE = /opus-4[-.]5/i;
const HAIKU_45_RE = /haiku-4[-.]5/i;
const SONNET_MODERN_RE = /sonnet-(?:5|4[-.]6|4[-.]5)/i;
const FABLE_5_RE = /fable-5/i;
const MYTHOS_5_RE = /mythos-5/i;

/** The per-model cacheMinTokens (part 02 §5d). Reads the id for the exact version; falls to CACHE_MIN_FLOOR
 *  for an anthropic id whose version isn't in the table (fail-closed — never under-cache). */
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

/** Assistant-prefill honor per (id × wire-shape). The CLI transport (agent-sdk) NEVER emits prefill (§4b:
 *  the sub/OR-key CLI never emits it; 4.6+ refuse anyway) ⇒ always `false`. On the openai-compat +
 *  anthropic-direct shapes the live matrix rules: opus-4.5/haiku-4.5 `true`, opus-4.8/sonnet-4.6 (+ every
 *  newer, fail-closed) `false`. */
function anthropicPrefill(id: string, wireShape: WireShape): boolean {
  if (wireShape === "anthropic-cli") {
    return false;
  }
  // The live-matrix `true` set — the older models that still honor a delivered trailing-assistant.
  return OPUS_45_RE.test(id) || HAIKU_45_RE.test(id);
}

/** Mid-conversation system AUTHORITY per (id × wire-shape). Wire-tested: Opus 4.8 HONORS it on the
 *  anthropic-messages shape (both transports); every other model / the openai shapes = `false` (accepted
 *  with no operator authority, or no channel). Operator authority is anthropic-wire-only (part 01 §2). */
function anthropicMidConvSystem(id: string, wireShape: WireShape): boolean {
  const anthropicWire = wireShape === "anthropic-cli" || wireShape === "anthropic-direct";
  return anthropicWire && OPUS_48_RE.test(id);
}

/**
 * The curated Claude shortlist `turns` cell for the resolved wire-shape (part 01 §3.3). Every Claude arm is
 * `roleHandlingFloor:"strict"` + `explicitPromptCache:true` (both cache-bearing shapes) with the per-version
 * `cacheMinTokens`; prefill + mid-conv-system are the per (id × shape) honor facts above. Seeded to
 * TODAY's behavior (part 04 §1) so W1 is behavior-neutral. The id carries the version — the tier is
 * label-only (not load-bearing), so the honor facts derive from the id, not the tier.
 */
export function refineCuratedTurns(id: string, wireShape: WireShape): Turns {
  return {
    assistantPrefill: anthropicPrefill(id, wireShape),
    midConversationSystem: anthropicMidConvSystem(id, wireShape),
    roleHandlingFloor: "strict",
    explicitPromptCache: true,
    cacheMinTokens: anthropicCacheMin(id),
  };
}

/**
 * The OR openai-compat synthesis `turns` cell for an ANTHROPIC-family model resolved through synthesis (a
 * non-curated Claude-via-OR id — §4b `FAMILY_TURNS` anthropic arm). `explicitPromptCache:true` + the
 * per-version floor; prefill/mid-conv from the same live-matrix facts on the resolved shape. Only anthropic
 * reaches this — every other family gets NON_CACHING_TURNS (the caller family-gates).
 */
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
 *  non-anthropic family + the static arms). `explicitPromptCache:false` matches today's behavior (OR
 *  auto-caches non-Anthropic with no field — ruling 3; no runner cache-places here). ONE spread of the
 *  contract floor so a floor change flows through. */
export const NON_CACHING_TURNS: Turns = { ...TURNS_FLOOR };

// ── The direct-transport Claude SAMPLING seed (D68-C, part 03 §3). ──────────────────────────────────────
// The raw Messages wire carries temperature/top_p/top_k/stop_sequences, but the SDK documents post-Opus-4.6
// models as REJECTING non-default values ("only 1.0 accepted" / "any top_k value 400s" / "top_p only ≥0.99")
// — so this is a PER-MODEL fact, not a blanket unlock, and a blanket unlock is a 400 factory. The
// `anthropic-direct` transport is the ONLY shape where a curated Claude gets sampling: the agent-sdk `cli`
// wire carries no sampling field (curated `{}`), and the openai-compat curated Claude keeps `{}` too (its OR
// synthesis path is separate). SEEDED FAIL-CLOSED: every curated entry starts `{}` here until the W9 hand-run
// probe (part 02 §6) verifies its live honor matrix and opens the entry — one edit to ANTH_DIRECT_SAMPLING.

/** Anthropic's temperature range is 0–1 (NOT the OpenAI 0–2) — a distinct bound (part 03 §3). Named here so
 *  an opened entry cites the right ceiling (the funnel clamps a user temperature to it). */
export const ANTHROPIC_TEMP_RANGE: Range = { min: 0, max: 1 };
const ANTHROPIC_TOP_P_RANGE: Range = { min: 0, max: 1 };
const ANTHROPIC_TOP_K_RANGE: Range = { min: 0, max: 200 };

/** The full pre-cutoff Messages sampling set (temperature/topP/topK/stop) — the capability an OPENED 4.5-era
 *  entry resolves to once the probe confirms its honor matrix. THE ONE opened-entry definition: opening an
 *  entry is mapping its version regex → this (or a narrower probe-measured slice) in {@link
 *  ANTH_DIRECT_SAMPLING}, never re-spelling the knob set. Exported so the W9 unit test can assert the seam is
 *  wired (an opened entry WOULD surface it) without opening a live entry. */
export const ANTH_DIRECT_PRE_CUTOFF_SAMPLING: Sampling = {
  temperature: ANTHROPIC_TEMP_RANGE,
  topP: ANTHROPIC_TOP_P_RANGE,
  topK: ANTHROPIC_TOP_K_RANGE,
  stop: true,
};

/** Per-(anthropic model version) direct-transport sampling seed. EMPTY today (fail-closed): every entry
 *  resolves `{}` until the W9 probe verifies its live matrix. The generational seam LIKELY matches the prefill
 *  matrix (opus-4.5/haiku-4.5 honor sampling; opus-4.8/sonnet-4.6 are post-cutoff), but "likely" is not a
 *  capability fact — the probe is. To open an entry after the probe: push a `[versionRegExp, sampling]` tuple
 *  pairing its version pattern with {@link ANTH_DIRECT_PRE_CUTOFF_SAMPLING} (or a narrower probe-measured
 *  slice). More-specific version patterns first so a prefix can't shadow them. */
const ANTH_DIRECT_SAMPLING: readonly (readonly [RegExp, Sampling])[] = [
  // e.g. [OPUS_45_RE, ANTH_DIRECT_PRE_CUTOFF_SAMPLING] — OPENED ONLY AFTER THE W9 PROBE VERIFIES THE ENTRY.
];

/**
 * The direct-transport sampling capability for a Claude id (D68-C). ONLY the `anthropic-direct` wire-shape
 * reaches a non-`{}` seed — the cli/openai shapes keep the curated `{}` (their sampling is a separate path,
 * part 03 §3). Reads the id (resolver-internal, the ONE model-id read alongside the turns cell) to look up
 * the per-version seed; unmatched ⇒ `{}` (fail-closed). Returns `base` unchanged on every non-direct shape so
 * the curated-first short-circuit stays correct for the other axes.
 */
export function refineAnthDirectSampling(
  id: string,
  wireShape: WireShape,
  base: Sampling,
): Sampling {
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
