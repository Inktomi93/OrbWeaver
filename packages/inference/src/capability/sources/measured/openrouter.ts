// DATED PROBE RECEIPTS measured THROUGH OpenRouter (`match.provider: "openrouter"`, any model family). WHY a tier
// above the advertisement exists at all (inference audit B3/H3): OpenRouter's `GET /models` `supported_parameters`
// is per-model but its upstream normalisation is per-provider, and the two disagree — the list ADVERTISES
// `temperature` for `anthropic/claude-opus-5` and `claude-opus-4.8` (2026-09-20 catalog read) while the body OR
// builds upstream carries no `temperature`/`top_p` and nothing warns. A measured `sampling: {}` is the stated set
// (the fold REPLACES `sampling`, `capability/synthesize.ts`), so the knobs stop rendering and the funnel drops a
// preset value with `sampling_knob_dropped` instead of the record claiming it applied. The other SDK-table ids
// (fable-5 / fable-5.1 / sonnet-5 / opus-4.7) are advertised WITHOUT temperature already, so they need no row.
// Script: `rec-probe.mjs` (session scratch, `debug.echo_upstream_body` under `includeRawChunks`), maxOutputTokens 60.

import type { CapabilityOverrideInput } from "@orb/contracts/inference";

export const measuredOpenRouterRows = [
  {
    match: {
      provider: "openrouter",
      model: "^anthropic/claude-opus-5",
    },
    generation: {
      sampling: {},
    },
    evidence: {
      tier: "measured",
      dated: "2026-09-20",
      cite: "rec-probe.mjs or-echo-opus5 — gen-1789884252-n94Ebcm1uMVMG1XhxsbB: temperature 0.7 + topP 0.9 sent; the echoed upstream body carried neither (thinking adaptive/summarized, max_tokens, stop_sequences only); no 400, no warning",
    },
  },
  {
    match: {
      provider: "openrouter",
      model: "^anthropic/claude-opus-4[-.]8",
    },
    generation: {
      sampling: {},
    },
    evidence: {
      tier: "measured",
      dated: "2026-09-20",
      cite: "rec-probe.mjs or-echo-opus48 — gen-1789884543-OomBi0lVg4zDXFmCZ3Pk: temperature 0.7 + topP 0.9 sent; the echoed upstream body carried neither (thinking disabled, max_tokens, stop_sequences only); no 400, no warning",
    },
  },
  // The catalog's reasoning object carries no thinking TYPE, so the advertised tier spells every reasoning model
  // `mode: "effort"`. What OpenRouter actually sends Anthropic for a `reasoning.effort` on these ids is adaptive
  // thinking plus `output_config.effort`, so the measured mode outranks that spelling and the house default effort
  // (`ADAPTIVE_DEFAULT_EFFORT`) reaches this route the same as the direct and agent-sdk ones.
  {
    match: {
      provider: "openrouter",
      model: "^anthropic/claude-(opus-5|fable-5|sonnet-5|opus-4[-.][78])",
    },
    generation: {
      reasoning: {
        mode: "adaptive",
      },
    },
    evidence: {
      tier: "measured",
      dated: "2026-09-23",
      cite: 'wire-fixes-or-echo.mjs, reasoning.effort "high" + debug.echo_upstream_body, upstream thinking {type:"adaptive",display:"summarized"} + output_config.effort "high" on every id: opus-5 gen-1790141847-svcaPqDtmlhF34sxweVp, opus-5.5 gen-1790141848-AAT0DrIn490dia4WrPeZ, fable-5 gen-1790141850-miDQ7EvBTSfb094Vfizh, fable-5.1 gen-1790141854-B8vCTCWKmFmNVeTy79fm, sonnet-5 gen-1790141857-ck66LEE8k2VXqYoS3f6i, opus-4.8 gen-1790141839-NIM1Oo4iEXg70CSFDnfh, opus-4.7 gen-1790141840-K2jBVGtiQQxYNsqWgpf7',
    },
  },
  // OpenRouter's chat body has no spelling for Sonnet 5.5's `between_tools`, and it refuses every off it does have,
  // so an off turn on this route clamps up to the lowest effort instead of spending a request on the 400.
  {
    match: {
      provider: "openrouter",
      model: "^anthropic/claude-sonnet-5[-.]5(?![0-9])",
    },
    generation: {
      reasoning: {
        mandatory: true,
      },
    },
    evidence: {
      tier: "measured",
      dated: "2026-10-03",
      cite: 'OR-14 (scripts/probes/openrouter/or14-sonnet-5-5-thinking-off.ts, RESULTS.md), Anthropic pinned: reasoning {effort:"none"} and {enabled:false} both -> 400 "Reasoning is mandatory for this endpoint and cannot be disabled"; control reasoning.effort "high" -> 200 with upstream thinking {type:"adaptive",display:"summarized"} + output_config.effort "high" (gen-1790992425-FFU2VVqASPD1EKOpi6RQ); tool_choice "required" -> upstream 400 "tool_choice: type tool and any are not supported for this model" (req_011CfeUBBXSm15nSnRHEqM1Y); the catalog agrees (GET /api/v1/models 2026-10-03: reasoning.mandatory true). OpenRouter\'s Messages endpoint (/api/v1/messages) does take thinking between_tools (gen-1790993688-wJirlq1BbjQ0C7PB0zwh), but this route is chat completions',
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
