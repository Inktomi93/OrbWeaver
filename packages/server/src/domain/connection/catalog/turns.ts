// domain/connection/catalog/turns — the (wire-shape × model) `turns` cell derivation; the ONE place a model
// id/version is read for turn-caps. Entry points: `refineCuratedTurns` (the curated Claude shortlist cell),
// `synthesizeAnthropicTurns`/`NON_CACHING_TURNS` (the OR openai-compat synthesis + the static arms), and
// `VLLM_TURNS` (the one MEASURED, err-open arm — D143).

import type { ModelCapability } from "@orb/contracts/connection";
import { CACHE_MIN_FLOOR, TURNS_FLOOR } from "@orb/contracts/connection";
import type { WIRE_SHAPES } from "./wire-shape.ts";

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

/** MID-HISTORY system rows per (id × wire-shape) — the gate for a DEPTH \> 0 system INJECTION (an author's
 *  note, a depth-N world-info entry). Not a narrator gate: the D129(B) narrator mapping that also read this
 *  bit was owner-ruled out 2026-08-18 (group narration is the assistant's own output voice).
 *
 *  UNMEASURED on every anthropic arm, so `false` everywhere here, and that is the whole content of this
 *  function today: the fact is a LIVE-WIRE MEASUREMENT (`pnpm probe:history-system-rows`), never a model-name
 *  regex (D69), and never an inference from {@link anthropicMidConvSystem} — that bit is wire-tested for the
 *  DEPTH-0 TAIL only and a depth-N note is mid-history. It exists as a named function rather than an inline `false` so the
 *  measured table lands HERE, in the ONE (wire-shape × model) derivation, when the probe produces one — the
 *  same measure-then-declare seam `tools.silencesProse` rides in `resolve-model-capability`. */
function historySystemRows(_id: string, _wireShape: WireShape): boolean {
  return false;
}

/** The curated Claude shortlist `turns` cell for the resolved wire-shape. Every Claude arm is
 *  `roleHandlingFloor:"strict"` + `explicitPromptCache:true` with the per-version `cacheMinTokens`. */
export function refineCuratedTurns(id: string, wireShape: WireShape): Turns {
  return {
    assistantPrefill: anthropicPrefill(id, wireShape),
    midConversationSystem: anthropicMidConvSystem(id, wireShape),
    historySystemRows: historySystemRows(id, wireShape),
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
    historySystemRows: historySystemRows(id, wireShape),
    roleHandlingFloor: "strict",
    explicitPromptCache: true,
    cacheMinTokens: anthropicCacheMin(id),
  };
}

/** The non-caching `turns` cell — TURNS_FLOOR with an explicit `strict` floor (fail-closed for every
 *  non-anthropic family + the static arms). */
export const NON_CACHING_TURNS: Turns = { ...TURNS_FLOOR };

/** THE vLLM `turns` CELL — the ONE arm that does not inherit the fail-closed floor, because it is the ONE
 *  wire we can measure end to end: our engine, our vendored template
 *  (`scripts/dev/qwen3_gen_thinking_serve.jinja`, served by `genArgv`), reachable from a dev box for free.
 *  D143 is what makes that a decision rather than an optimization: on this source capability varies per
 *  CHECKPOINT and is undetectable, so the descriptor errs OPEN and the user's preset decides — the same
 *  ruling that put every effort level back on `VLLM_REASONING`.
 *
 *  `roleHandlingFloor: "none"` — the LEAST-strict member, i.e. this wire imposes NO floor. The floor exists
 *  for wires that hard-error on adjacent same-role rows (Anthropic) — an openai-compat vLLM does not; the
 *  template renders each message as its own `<|im_start|>` block whatever the adjacency. Carrying `strict`
 *  here also made the preset's message-handling pane say "This model enforces at least Strict" about a model
 *  that enforces nothing (the owner-reported defect, #201). A user who wants merging picks it; the clamp
 *  (`assembly/role-squash::clampRoleHandling`) still takes `max(floor, knob)`, so the knob is now the whole
 *  answer on this source.
 *
 *  `midConversationSystem` / `historySystemRows` — BOTH true, and both MEASURED 2026-08-18 against the gen
 *  engine (`Qwen3.8-27B-heretic-ara-W8A8-Dynamic-Per-Token`, :8703), never inferred from each other (D69):
 *    • `/tokenize` (renders the template without generating): a `system` row at index 3 of a 5-row array
 *      renders IN PLACE as its own `<|im_start|>system … <|im_end|>` block between the assistant and user
 *      blocks — the template neither hoists it to the head nor drops it. The tail-positioned case renders the
 *      same way. That is the ACCEPTS half, for both the tail channel and mid-history.
 *    • `pnpm probe:history-system-rows --endpoint http://127.0.0.1:8703/v1/chat/completions`: mid-array
 *      system row status=200 obeyed=true ⇒ ACCEPTED + HONORED. Qualified exactly as the probe prints it: the
 *      assistant-voiced control also obeyed, so the run shows the row SURVIVES and is READ, not that `system`
 *      carries authority the ordinary delivery lacks — which is precisely what the injection splice needs.
 *
 *  WHAT `historySystemRows: true` DOES AND DOES NOT BUY ON THIS WIRE (owner ruling 2026-08-18, verbatim: "if
 *  you mean group chat narration mode then that is the wrong behavior"): it delivers a DEPTH \> 0 system
 *  INJECTION — an author's note, a depth-N world-info entry — at its depth as a real `system` row. It does
 *  NOT re-role narrator CANON rows; that D129(B) mapping read the same bit until the ruling and is gone.
 *  Group narration is one generation voicing the whole cast, i.e. the assistant's own output voice. The
 *  measurement is honored; it answers where a system row may SIT, never which rows ARE system.
 *
 *  `assistantPrefill: false` — measured too, and it stays false: the same `/tokenize` render appends the
 *  template's OWN `<|im_start|>assistant` header (plus the empty `<think>` block) after the last message, so
 *  a delivered trailing-assistant row becomes a completed prior turn rather than a prefix the model continues.
 *  Prefill on this wire is a different mechanism (`continue_final_message`/`add_generation_prompt`), not this
 *  bit — err-open never means claiming a capability the render disproves.
 *
 *  `explicitPromptCache: false` — unchanged: vLLM's prefix cache is automatic, with no per-block breakpoint
 *  to place. */
export const VLLM_TURNS: Turns = {
  assistantPrefill: false,
  midConversationSystem: true,
  historySystemRows: true,
  roleHandlingFloor: "none",
  explicitPromptCache: false,
};
