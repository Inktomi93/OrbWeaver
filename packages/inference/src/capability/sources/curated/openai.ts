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
    // No reasoning or verbosity here: gpt-4.1 and gpt-4o have neither, and a nested `reasoning` merges one level
    // deep, so a family cell would leak its effort levels into every id a later row turns off.
    generation: {
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
      dated: "2026-09-25",
      cite: "resolve-model-capability.ts openai-family tools and structured output; OR's advertised row supersedes when present",
    },
  },
  // Each reasoning row lists the efforts its model page documents. `none` is the off switch (`enabled`), never a level.
  {
    match: {
      model: "^(openai/)?gpt-5(-mini|-nano)?(-[0-9]{4}-[0-9]{2}-[0-9]{2})?$",
    },
    generation: {
      reasoning: {
        mode: "effort",
        enabled: true,
        effortLevels: ["minimal", "low", "medium", "high"],
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "developers.openai.com/api/docs/models/gpt-5 'Reasoning.effort supports: minimal, low, medium, and high'; openai.com/index/introducing-gpt-5-for-developers: gpt-5, gpt-5-mini and gpt-5-nano take minimal in addition to low, medium and high",
    },
  },
  {
    match: {
      model: "^(openai/)?gpt-5\\.1(-[0-9]{4}-[0-9]{2}-[0-9]{2})?$",
    },
    generation: {
      reasoning: {
        mode: "effort",
        enabled: true,
        effortLevels: ["low", "medium", "high"],
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "developers.openai.com/api/docs/models/gpt-5.1 'Reasoning.effort supports: none (default), low, medium, and high'",
    },
  },
  {
    match: {
      model: "^(openai/)?gpt-5\\.(2|3-codex|4|4-mini|4-nano|5)(-[0-9]{4}-[0-9]{2}-[0-9]{2})?$",
    },
    generation: {
      reasoning: {
        mode: "effort",
        enabled: true,
        effortLevels: ["low", "medium", "high", "xhigh"],
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "developers.openai.com/api/docs/models/{gpt-5.2,gpt-5.4,gpt-5.4-mini,gpt-5.4-nano,gpt-5.5} 'Reasoning.effort supports: none, low, medium, high and xhigh'; gpt-5.3-codex 'supports low, medium, high, and xhigh'",
    },
  },
  {
    match: {
      model: "^(openai/)?gpt-(5\\.6-(sol|terra|luna)|6-(astra|sol|luna))(-[0-9]{4}-[0-9]{2}-[0-9]{2})?$",
    },
    generation: {
      reasoning: {
        mode: "effort",
        enabled: true,
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "developers.openai.com/api/docs/models/{gpt-5.6-sol,gpt-5.6-terra,gpt-5.6-luna,gpt-6-sol,gpt-6-luna} 'reasoning.effort supports none, low, medium (default), high, xhigh, and max'; gpt-6-astra 'supports low, medium, high, xhigh, and max'",
    },
  },
  {
    match: {
      model: "^(openai/)?gpt-6-astra(-[0-9]{4}-[0-9]{2}-[0-9]{2})?$",
    },
    generation: {
      reasoning: {
        mandatory: true,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "developers.openai.com/api/docs/guides/reasoning: 'GPT-6 Astra does not support none reasoning effort. Setting … reasoning_effort (Chat Completions) to none returns HTTP 400'",
    },
  },
  {
    match: {
      model: "^(openai/)?o[13](-[0-9]{4}-[0-9]{2}-[0-9]{2})?$",
    },
    generation: {
      reasoning: {
        mode: "effort",
        enabled: true,
        effortLevels: ["low", "medium", "high"],
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "openai.com/index/introducing-gpt-5-for-developers: 'In addition to the prior values—low, medium (default), and high—GPT‑5 also supports minimal'; the o-series model pages state no wider set",
    },
  },
  {
    match: {
      model: "^(openai/)?gpt-oss[-:](20b|120b)",
    },
    generation: {
      reasoning: {
        mode: "effort",
        enabled: true,
        effortLevels: ["low", "medium", "high"],
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "developers.openai.com/api/docs/models/{gpt-oss-120b,gpt-oss-20b} 'Configurable reasoning effort … (low, medium, high)'",
    },
  },
  {
    match: {
      model: "^(openai/)?gpt-[56]([.-]|$)",
    },
    generation: {
      verbosity: ["low", "medium", "high"],
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "openai.com/index/introducing-gpt-5-for-developers: 'GPT‑5 supports a new verbosity parameter (values: low, medium, high)'; Verbosity ✅ for gpt-6-astra/sol/luna at learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning. Curated and never derived from OpenRouter's inverted supported_parameters (H1: OR forwards text.verbosity for openai/gpt-5.4 while not listing it, rec-probe.mjs or-echo-gpt5 gen-1789884254-ZJVqE4m5N0aChJ7FY0x7)",
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
  // Every id of the GPT-5, GPT-6 and o1/o3/o4 reasoning families, with any variant suffix (-pro, -codex, -image,
  // -high, a date) or OpenRouter's `:batch`. A `-chat` id is the non-reasoning chat snapshot and takes neither cell;
  // gpt-oss is open-weight and served by third-party hosts with no encrypted reasoning, so it stays out.
  {
    match: {
      model: "^(?!.*-chat)(openai/)?(gpt-[56]|o[134])([.:-]|$)",
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
      dated: "2026-09-25",
      cite: "rec-probe.mjs openai-h2 — req_4609158162fd4953b00a62cf6f23d82f (temperature 0.7 → 400 unsupported_value); req_f68c8dc2e4a24908a2e5be64132edbc0 (max_tokens → 400 unsupported_parameter, the H2 outputCapField row); req_8eff1a4cbff5461b820f47331f2c26b2 (max_completion_tokens + reasoning_effort low → 200). GPT-6: developers.openai.com/api/docs/guides/latest-model 'When reasoning effort is not none, remove temperature, top_p, and top_logprobs'; developers.openai.com/api/docs/guides/reasoning 'reasoning items … include an encrypted_content property … that you can pass to future calls'. Families: developers.openai.com/api/docs/models/{o1-pro,o3-pro,gpt-5-pro,gpt-5.5-pro,gpt-5.1-codex,gpt-5.1-codex-max,gpt-5.2-codex} each list 'Reasoning token support'; the -pro ids of GPT-5.6 and GPT-6 are 'the same underlying model … served with reasoning.mode set to pro' (openrouter.ai/api/v1/models, per developers.openai.com/api/docs/guides/reasoning 'GPT-5.6 and GPT-6 models support standard and pro reasoning modes'); gpt-5-image and gpt-5.4-image-2 are GPT-5 and GPT-5.4 with image generation (openrouter.ai/api/v1/models). developers.openai.com/api/docs/models/{gpt-5-chat-latest,gpt-5.2-chat-latest,gpt-chat-latest} list no reasoning-token support",
    },
  },
  // A window row states the most input a request may carry, and its output cap the page's max output tokens. A
  // GPT-5-class id caps input at its context window less its max output (OpenAI states it for GPT-5); the older ids
  // share one window between input and output.
  {
    match: {
      model: "^(openai/)?gpt-(6-(astra|sol|luna)|5\\.6-(sol|terra|luna)|5\\.5|5\\.4)(-[0-9]{4}-[0-9]{2}-[0-9]{2})?$",
    },
    generation: {
      context: {
        window: 922_000,
      },
      output: {
        maxTokens: { min: 1, max: 128_000 },
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
      output: {
        maxTokens: { min: 1, max: 128_000 },
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
      output: {
        maxTokens: { min: 1, max: 100_000 },
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
      output: {
        maxTokens: { min: 1, max: 32_768 },
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
      output: {
        maxTokens: { min: 1, max: 16_384 },
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
