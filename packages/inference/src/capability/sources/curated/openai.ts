// Curated capability rows — openai. DATA in ONE schema (`capabilityOverrideSchema`), checked at `tsc` through
// `satisfies` and re-parsed at load through the same zod the plugin/admin rows go through. File order is
// composition order (a later row refines an earlier one). Adding a model is a row here + the table test.

import type { CapabilityOverrideInput } from "@orb/contracts/inference";

export const openaiRows = [
  {
    match: {
      model: "^(openai/)?(gpt-|o[13]|chatgpt)",
    },
    kind: "generation",
    generation: {
      reasoning: {
        mode: "effort",
        enabled: true,
        effortLevels: ["minimal", "low", "medium", "high", "xhigh"],
      },
      verbosity: ["low", "medium", "high"],
      tools: {
        parallel: true,
      },
      output: {
        structured: true,
        modalities: ["text"],
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-20",
      cite: "resolve-model-capability.ts FAMILY_REASONING.openai (effort, no budget) + the openai-family verbosity arm; verbosity is CURATED here and never derived from OpenRouter's inverted supported_parameters (H1: OR forwards text.verbosity for openai/gpt-5.4 while not listing it — 2026-09-20 rec-probe.mjs or-echo-gpt5 gen-1789884254-ZJVqE4m5N0aChJ7FY0x7); OR's advertised row supersedes the other fields when present",
    },
  },
  {
    match: {
      model: "^(openai/)?(gpt-5|o[1-9])",
    },
    generation: {
      // The reasoning models take temperature at its default only (`unsupported_value: 'temperature' does not
      // support 0.7 with this model. Only the default (1) value is supported`, measured 2026-09-20 on gpt-5-mini) —
      // the stated set is empty. On the direct `openai` row this was ALREADY the floor (an apiKey row advertises no
      // sampling); via OpenRouter the advertised set replaces it (the fold's REPLACE rule), and OR's own list
      // omits temperature for gpt-5.4 (consistent with the upstream strip measured in H3). Stated and cited so
      // nobody re-derives the fail-closed floor as an accident.
      sampling: {},
      // The REASONING ids only: via OpenRouter these route to the Responses API with
      // `include: ["reasoning.encrypted_content"]` (measured, H3), which is the same signed-replay contract.
      // The broader non-reasoning GPT row below deliberately does NOT carry it — there is nothing to replay.
      reasoning: {
        replay: "signed",
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-20",
      cite: "rec-probe.mjs openai-h2 — req_4609158162fd4953b00a62cf6f23d82f (temperature 0.7 → 400 unsupported_value); req_f68c8dc2e4a24908a2e5be64132edbc0 (max_tokens → 400 unsupported_parameter, the H2 outputCapField row); req_8eff1a4cbff5461b820f47331f2c26b2 (max_completion_tokens + reasoning_effort low → 200)",
    },
  },
  {
    match: {
      model: "^(openai/)?gpt-image",
    },
    kind: "generation",
    generation: {
      reasoning: {
        mode: "none",
        enabled: false,
      },
      input: ["text", "image"],
      output: {
        modalities: ["image"],
      },
      imageEdit: true,
      imageReferences: true,
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "the images API arm (§6.7 arm 1): generations + edits with reference images",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
