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
] as const satisfies readonly CapabilityOverrideInput[];
