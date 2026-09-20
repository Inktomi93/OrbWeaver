// Curated capability rows — embedders. DATA in ONE schema (`capabilityOverrideSchema`), checked at `tsc` through
// `satisfies` and re-parsed at load through the same zod the plugin/admin rows go through. File order is
// composition order (a later row refines an earlier one). Adding a model is a row here + the table test.

import type { CapabilityOverrideInput } from "@orb/contracts/inference";

export const embeddersRows = [
  {
    match: {
      model: "^(openai/)?text-embedding-3-large$",
    },
    kind: "embedding",
    embedding: {
      dims: 3072,
      mrl: true,
      maxInputTokens: 8191,
      input: ["text"],
      output: ["vector"],
      instructionAware: false,
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "OpenAI embeddings reference: text-embedding-3-large, 3072 native dims, `dimensions` truncation honoured, 8191-token input",
    },
  },
  {
    match: {
      model: "^(openai/)?text-embedding-3-small$",
    },
    kind: "embedding",
    embedding: {
      dims: 1536,
      mrl: true,
      maxInputTokens: 8191,
      input: ["text"],
      output: ["vector"],
      instructionAware: false,
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "OpenAI embeddings reference: text-embedding-3-small, 1536 native dims, `dimensions` truncation honoured",
    },
  },
  {
    match: {
      model: "(^|/)qwen3-vl-embedding",
    },
    kind: "embedding",
    embedding: {
      dims: 1024,
      mrl: true,
      maxInputTokens: 8192,
      input: ["text", "image"],
      output: ["vector"],
      instructionAware: true,
      promptScaffold: "chatml",
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "the owner's vLLM embed engine (vllm/surfaces/embed.ts ChatML scaffold + query/doc instructions, engine/embedding.ts DOC_INSTRUCTION/QUERY_INSTRUCTION); dims = the deployment's EMBED_SPACE_DIMS",
    },
  },
  {
    match: {
      model: "(^|/)qwen3-vl-reranker",
    },
    kind: "rerank",
    rerank: {
      maxInputTokens: 8192,
      input: ["text", "image"],
      instructionAware: true,
    },
    evidence: {
      tier: "curated",
      dated: "2026-09-19",
      cite: "vllm/surfaces/rerank.ts: the multimodal ScoreMultiModalParam body (`:58-68`) + the per-task `<Instruct>` override (`:152-153`)",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
