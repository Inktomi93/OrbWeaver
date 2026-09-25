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
      model: "^(openai/)?o(3|4)-mini(-[0-9]{4}-[0-9]{2}-[0-9]{2})?$",
    },
    generation: {
      reasoning: {
        mode: "effort",
        enabled: true,
        effortLevels: ["low", "medium", "high"],
        mandatory: true,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-20",
      cite: "o4-mini-2025-04-16 live request: reasoning effort 'none' → 400 unsupported_value; supported values reported as low, medium, high; o3-mini shares the measured mandatory-reasoning cell",
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
  // A window row states the most input a request may carry. A GPT-5-class id caps input at its context window less
  // its max output (OpenAI states it for GPT-5); the older ids share one window between input and output.
  {
    match: {
      model: "^(openai/)?gpt-(6-(astra|sol|luna)|5\\.6-(sol|terra|luna)|5\\.5|5\\.4)(-[0-9]{4}-[0-9]{2}-[0-9]{2})?$",
    },
    generation: {
      context: {
        window: 922_000,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "1,050,000 context window, 128,000 max output tokens: developers.openai.com/api/docs/models/{gpt-6-astra,gpt-6-sol,gpt-6-luna,gpt-5.6-sol,gpt-5.6-terra,gpt-5.6-luna,gpt-5.5,gpt-5.4}; input = window − max output per openai.com/index/introducing-gpt-5-for-developers ('a maximum of 272,000 input tokens and … 128,000 reasoning & output tokens, for a total context length of 400,000'); 922,000 stated as 'Maximum input tokens' for gpt-6-astra/sol/luna at learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning",
    },
  },
  {
    match: {
      model: "^(openai/)?gpt-(5(-mini|-nano)?|5\\.1|5\\.2|5\\.3-codex|5\\.4-(mini|nano))(-[0-9]{4}-[0-9]{2}-[0-9]{2})?$",
    },
    generation: {
      context: {
        window: 272_000,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "400,000 context window, 128,000 max output tokens: developers.openai.com/api/docs/models/{gpt-5,gpt-5-mini,gpt-5-nano,gpt-5.1,gpt-5.2,gpt-5.3-codex,gpt-5.4-mini,gpt-5.4-nano}; openai.com/index/introducing-gpt-5-for-developers: 'all GPT‑5 models can accept a maximum of 272,000 input tokens'",
    },
  },
  {
    match: {
      model: "^(openai/)?o(1|3|3-mini|4-mini)(-[0-9]{4}-[0-9]{2}-[0-9]{2})?$",
    },
    generation: {
      context: {
        window: 200_000,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "200,000 context window, 100,000 max output tokens: developers.openai.com/api/docs/models/{o1,o3,o3-mini,o4-mini}; no separate input cap is documented, so the fit's output reserve shares the window",
    },
  },
  {
    match: {
      model: "^(openai/)?gpt-4\\.1(-mini|-nano)?(-[0-9]{4}-[0-9]{2}-[0-9]{2})?$",
    },
    generation: {
      context: {
        window: 1_047_576,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "1,047,576 context window, 32,768 max output tokens: developers.openai.com/api/docs/models/{gpt-4.1,gpt-4.1-mini,gpt-4.1-nano}",
    },
  },
  {
    match: {
      model: "^(openai/)?gpt-4o(-mini)?(-[0-9]{4}-[0-9]{2}-[0-9]{2})?$",
    },
    generation: {
      context: {
        window: 128_000,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "128,000 context window, 16,384 max output tokens: developers.openai.com/api/docs/models/{gpt-4o,gpt-4o-mini}",
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
