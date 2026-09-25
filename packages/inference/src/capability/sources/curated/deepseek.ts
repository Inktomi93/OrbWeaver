// Curated capability rows — deepseek. DATA in ONE schema (`capabilityOverrideSchema`), checked at `tsc` through
// `satisfies` and re-parsed at load through the same zod the plugin/admin rows go through. File order is
// composition order (a later row refines an earlier one). Adding a model is a row here + the table test.

import type { CapabilityOverrideInput } from "@orb/contracts/inference";

export const deepseekRows = [
  {
    match: {
      model: "^deepseek/",
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
      cite: "resolve-model-capability.ts FAMILY_REASONING.deepseek (no reasoning by family; OR advertises the reasoner variants)",
    },
  },
  // The direct API's own ids. The page states "1M", so the row takes the lower reading of it.
  {
    match: {
      model: "^deepseek-(flash|v4-pro|v4-flash|v4-flash-vision-exp)$",
    },
    generation: {
      context: {
        window: 1_000_000,
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-25",
      cite: "api-docs.deepseek.com/quick_start/pricing: CONTEXT LENGTH '1M' spanning deepseek-flash and deepseek-v4-pro (MAX OUTPUT 384K); the legacy names deepseek-v4-flash and deepseek-v4-flash-vision-exp are served by the same Flash model",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
