// Curated capability rows — google. DATA in ONE schema (`capabilityOverrideSchema`), checked at `tsc` through
// `satisfies` and re-parsed at load through the same zod the plugin/admin rows go through. File order is
// composition order (a later row refines an earlier one). Adding a model is a row here + the table test.

import type { CapabilityOverrideInput } from "@orb/contracts/inference";

export const googleRows = [
  {
    match: {
      model: "^(google/)?gemini",
    },
    kind: "generation",
    generation: {
      reasoning: {
        mode: "budget",
        enabled: true,
        budgetRange: {
          min: 1024,
          max: 32_000,
        },
        // Gemini's thought signatures are the same replay contract under a different name, and the OpenRouter
        // provider's `reasoning_details` covers them (audit H4 — A1 is not Anthropic-only on that route).
        replay: "signed",
      },
      tools: {
        parallel: true,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "resolve-model-capability.ts FAMILY_REASONING.google (budget) with ANTHROPIC_BUDGET_RANGE — the tree's existing cell; OR's advertised row supersedes when present",
    },
  },
  {
    match: {
      model: "^(google/)?gemini-2[-.]5-flash-image",
    },
    generation: {
      input: ["text", "image"],
      output: {
        modalities: ["text", "image"],
      },
      imageEdit: true,
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "§6.7 'go look at nano banana' — a chat model whose output modalities include image and that edits prior pictures across turns",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
