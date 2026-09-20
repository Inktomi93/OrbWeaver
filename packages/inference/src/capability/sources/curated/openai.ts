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
      dated: "2026-09-19",
      cite: "resolve-model-capability.ts FAMILY_REASONING.openai (effort, no budget) + the openai-family verbosity arm; OR's advertised row supersedes when present",
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
