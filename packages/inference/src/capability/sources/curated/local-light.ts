// Curated capability rows — local-light. DATA in ONE schema (`capabilityOverrideSchema`), checked at `tsc` through
// `satisfies` and re-parsed at load through the same zod the plugin/admin rows go through. File order is
// composition order (a later row refines an earlier one). Adding a model is a row here + the table test.

import type { CapabilityOverrideInput } from "@orb/contracts/inference";

export const localLightRows = [
  {
    match: {
      ids: ["jinaai/jina-clip-v2"],
      provider: "local-light",
    },
    kind: "embedding",
    embedding: {
      dims: 1024,
      mrl: true,
      maxInputTokens: 8192,
      input: ["text", "image"],
      output: ["vector"],
      instructionAware: false,
      dtype: "q8",
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "backends/local-light/embed.ts DEFAULT_EMBED_MODEL + image-embed.ts (one multimodal space); the q8 dtype is the served precision (#2417, role-clients.ts:187-204)",
    },
  },
  {
    match: {
      ids: ["Xenova/ms-marco-MiniLM-L-6-v2"],
      provider: "local-light",
    },
    kind: "rerank",
    rerank: {
      maxInputTokens: 512,
      input: ["text"],
      instructionAware: false,
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "backends/local-light/rerank.ts DEFAULT_RERANK_MODEL — a text-only cross-encoder (the image side of a query is ignored, no-op knob doctrine)",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
