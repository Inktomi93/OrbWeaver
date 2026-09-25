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
  // The window is Google's input token limit. The direct route is the OpenAI-compatible layer, whose `/models` lists
  // bare `{id, object, owned_by}` rows with a `models/` id prefix, so these rows take that prefix too.
  {
    match: {
      model:
        "^(google/|models/)?gemini-(3[-.]8-flash|3[-.]7-flash|3[-.]6-flash|3[-.]5-flash|3[-.]5-flash-lite|3[-.]1-flash-lite|3[-.]1-pro-preview|3-flash-preview|2[-.]5-flash|2[-.]5-flash-lite|2[-.]5-pro)$",
    },
    generation: {
      context: {
        window: 1_048_576,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "Input token limit 1,048,576, output token limit 65,536: ai.google.dev/gemini-api/docs/models/<id> for each listed id; the compatibility list shape per discuss.ai.google.dev/t/openai-comp-get-model-details/66120",
    },
  },
  {
    match: {
      model: "^(google/|models/)?gemini-3[-.]1-flash-image$",
    },
    generation: {
      context: {
        window: 131_072,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "Input token limit 131,072, output token limit 32,768: ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image",
    },
  },
  {
    match: {
      model: "^(google/|models/)?gemini-(2[-.]5-flash-image|3[-.]1-flash-lite-image|3-pro-image)$",
    },
    generation: {
      context: {
        window: 65_536,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "Input token limit 65,536: ai.google.dev/gemini-api/docs/models/{gemini-2.5-flash-image,gemini-3.1-flash-lite-image,gemini-3-pro-image}",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
