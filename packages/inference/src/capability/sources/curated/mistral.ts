// Curated capability rows — mistral. DATA in ONE schema (`capabilityOverrideSchema`), checked at `tsc` through
// `satisfies` and re-parsed at load through the same zod the plugin/admin rows go through. File order is
// composition order (a later row refines an earlier one). Adding a model is a row here + the table test.

import type { CapabilityOverrideInput } from "@orb/contracts/inference";

export const mistralRows = [
  {
    match: {
      model: "^mistralai/",
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
      cite: "resolve-model-capability.ts FAMILY_REASONING.mistral (no reasoning)",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
