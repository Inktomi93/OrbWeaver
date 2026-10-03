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
      ids: ["cross-encoder/ettin-reranker-32m-v1"],
      provider: "local-light",
    },
    kind: "rerank",
    rerank: {
      // The SERVED window, not the model's 7999: its ONNX export runs full attention in every layer, so a pair's
      // CPU time and memory grow quadratically (a 4096-token pair is about 3.9 s and 1.65 GB on 4 cores).
      maxInputTokens: 2048,
      input: ["text"],
      instructionAware: false,
      onnx: {
        head: "sentence-transformers",
        // The quantized files are named per instruction set, not by the dtype suffix, so the file picks the precision.
        dtype: "fp32",
        files: { x64: "model_quint8_avx2", arm64: "model_qint8_arm64" },
      },
    },
    evidence: {
      tier: "curated",
      dated: "2026-10-03",
      cite: "backends/local-light/tasks.ts DEFAULT_RERANK_MODEL; config.json max_position_embeddings 7999; quality, window and cost in scripts/probes/reranker-swap/RESULTS.md, measured on x64 only (the arm64 file is untested)",
    },
  },
  {
    match: {
      ids: ["cross-encoder/ettin-reranker-17m-v1"],
      provider: "local-light",
    },
    kind: "rerank",
    rerank: {
      maxInputTokens: 2048,
      input: ["text"],
      instructionAware: false,
      // fp32 on purpose: the quantized 17m mis-ranks the probe's persona and long-range cases.
      onnx: { head: "sentence-transformers", dtype: "fp32" },
    },
    evidence: {
      tier: "curated",
      dated: "2026-10-03",
      cite: "the light long-window option for a small box; quality and cost in scripts/probes/reranker-swap/RESULTS.md, measured on x64",
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
      onnx: { head: "sequence-classification", dtype: "q8" },
    },
    evidence: {
      tier: "curated",
      dated: "2026-10-03",
      cite: "the earlier default, still selectable; the window is its tokenizer's model_max_length; q8 ranks the probe's cases as fp32 does (scripts/probes/reranker-swap/RESULTS.md)",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
