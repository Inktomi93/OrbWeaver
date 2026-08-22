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
 *  non-anthropic family + the static arms).
 *
 *  `assistantPrefill: false` HERE IS UNMEASURED-FALSE, and the 2026-08-19 audit (issue #287 item 4) leaves it
 *  that way deliberately. This ONE cell serves every non-anthropic OpenRouter model (gemini/openai/llama/…),
 *  `local-light`, `custom_openai` and the cold `max-pro-sub` fallback, so it cannot carry a per-model truth:
 *  flipping it would claim the capability for every model that lands here, and D69 bans deriving it from the
 *  id. What OpenRouter publishes is PLATFORM support, not per-upstream honoring — "OpenRouter supports asking
 *  models to complete a partial response … include a message with `role: "assistant"` at the end of your
 *  `messages` array" (openrouter.ai/docs/api_reference/overview §"Assistant prefill", read 2026-08-19) — and
 *  the anthropic arm right above is the standing proof that honoring is per-MODEL even inside one platform
 *  (opus-4.5/haiku-4.5 continue a prefill on the openai-compat shape; every newer Claude does not).
 *
 *  So a flip needs the same thing the vLLM and anthropic cells have: a render/wire measurement per
 *  (model × wire-shape). A gemini row does not exist to flip — google models resolve through
 *  `synthesizeOpenRouter`'s non-anthropic arm into this cell — so the unit of work is a per-model probe plus
 *  a refinement function beside {@link anthropicPrefill}, not an edit here. */
export const NON_CACHING_TURNS: Turns = { ...TURNS_FLOOR };

/** THE vLLM `turns` CELL — the ONE arm that does not inherit the fail-closed floor, because it is the ONE
 *  wire we can measure end to end: our engine, our vendored template
 *  (`packages/server/src/infra/providers/vllm/engine/templates/qwen3_gen_thinking_serve.jinja`, served by `genArgv`), reachable from a dev box for free.
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
 *  `assistantPrefill: true` — RE-MEASURED 2026-08-19, same `/tokenize` discipline, same engine. It was
 *  honestly `false` UNTIL the prefill-forge template landed (86ecb0f24): on the OLD template the render
 *  appended the template's own `<|im_start|>assistant` header after the last message, so a delivered
 *  trailing-assistant row became a completed prior turn rather than a prefix the model continues, and the
 *  cell said so. That template is gone; the vendored one it replaced it with has a continuation arm
 *  (`packages/server/src/infra/providers/vllm/engine/templates/qwen3_gen_thinking_serve.jinja` :240), and the bit follows the render, not its own history.
 *
 *  THE TWO ARMS, verbatim tails of the 2026-08-19 `/tokenize` renders (3 rows: system, user,
 *  assistant "The rain fell"):
 *    • WITHOUT the flags (`add_generation_prompt` at its default `true`) — 35 tokens, THE FENCE:
 *      `…<|im_start|>assistant\nThe rain fell<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`
 *      — closed, plus a fresh header. That is the render the old receipt recorded, and it is exactly what a
 *      GROUP round still needs (a historical assistant-last conversation must open a NEW turn), so the fence
 *      is not collateral damage of the flip: it is the untouched default arm.
 *    • WITH `continue_final_message: true` + `add_generation_prompt: false` — 30 tokens, OPEN:
 *      `…<|im_start|>assistant\n<think>\n\n</think>\n\nThe rain fell` — one assistant block, no `<|im_end|>`,
 *      no fresh header. The model continues the row it was handed.
 *  The template's OTHER door (`chat_template_kwargs: {"assistant_prefill": true}`) renders byte-identically
 *  (30 tokens); the surface takes the STANDARD flags because we build the request and the kwarg door exists
 *  for static bodies that cannot set them.
 *
 *  THE `<think></think>` SCAFFOLD IS THE TEMPLATE'S, NOT OURS, and it is why a CONTENT prefill works with
 *  thinking off: this checkpoint EOSes an assistant turn that lacks a think block, so the template injects an
 *  EMPTY CLOSED one ahead of the prefill content. Measured with the thinking kwargs on too (56 tokens — the
 *  reasoning-effort instruction joins the system block): the scaffold is still emitted CLOSED, so a content
 *  prefill does not reopen reasoning — which is also why the vLLM chat surface DROPS the thinking kwargs on a
 *  content prefill (told to think, the qwen3 reasoning parser swallows the whole continuation into the
 *  reasoning channel and the reply comes back empty; measured the same day, two seed-pinned turns). Every
 *  claim in this block is executable: `tests/e2e/vllm-prefill-render.live.int.test.ts` (live-gated by
 *  `E2E_LIVE=1`) re-runs both render arms and both channel arms against the live gen engine.
 *
 *  WHAT THE BIT AUTHORIZES: SHAPE keeps an assistant\@depth-0 injection at depth 0 and skips the continuation
 *  nudge, and — because continuation on this wire is a REQUEST FIELD rather than an array shape — the vLLM
 *  chat surface sends the flag pair when the delivered array ends on an assistant row
 *  (`infra/providers/vllm/surfaces/chat.ts`). Delivering the row WITHOUT the pair would be the old fence with
 *  extra steps: silent, no error, the prefill folded into history.
 *
 *  `explicitPromptCache: false` — unchanged: vLLM's prefix cache is automatic, with no per-block breakpoint
 *  to place. */
export const VLLM_TURNS: Turns = {
  assistantPrefill: true,
  midConversationSystem: true,
  historySystemRows: true,
  roleHandlingFloor: "none",
  explicitPromptCache: false,
};
