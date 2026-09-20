// Curated capability rows — qwen. DATA in ONE schema (`capabilityOverrideSchema`), checked at `tsc` through
// `satisfies` and re-parsed at load through the same zod the plugin/admin rows go through. File order is
// composition order (a later row refines an earlier one). Adding a model is a row here + the table test.

import type { CapabilityOverrideInput } from "@orb/contracts/inference";

export const qwenRows = [
  {
    match: {
      model: "(^|/)qwen",
    },
    kind: "generation",
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
      dated: "2026-09-19",
      cite: "the local Qwen3 checkpoints serve hermes parallel tools + guided decoding (resolve-model-capability.ts vllm arm); reasoning is DECLARED per row, never assumed (F15)",
    },
  },
  {
    match: {
      model: "(^|/)qwen[^/]*-vl",
    },
    generation: {
      input: ["text", "image", "video"],
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "a VL checkpoint accepts image + video parts (#317); non-VL Qwen stays text-only unless the connection declares otherwise",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
