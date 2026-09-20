// Curated capability rows — xai. DATA in ONE schema (`capabilityOverrideSchema`), checked at `tsc` through
// `satisfies` and re-parsed at load through the same zod the plugin/admin rows go through. File order is
// composition order (a later row refines an earlier one). Adding a model is a row here + the table test.

import type { CapabilityOverrideInput } from "@orb/contracts/inference";

export const xaiRows = [
  {
    match: {
      model: "^(x-ai/)?grok",
    },
    kind: "generation",
    generation: {
      reasoning: {
        mode: "none",
        enabled: false,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "resolve-model-capability.ts FAMILY_REASONING.xai (no reasoning by family; OR advertises the reasoning variants)",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
