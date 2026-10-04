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
      cite: "the owner's vLLM embed engine (vllm/surfaces/embed.ts ChatML scaffold + query/doc instructions, engine/embedding.ts DOC_INSTRUCTION/QUERY_INSTRUCTION); dims = the width that engine serves",
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
  // The common local embedders (Ollama tags, LM Studio and Hugging Face ids). Each width becomes the owner's
  // space width when the row is bound, so stating it here spares the user a guessed `dims`.
  {
    match: {
      model: "nomic-embed-text",
    },
    kind: "embedding",
    embedding: {
      dims: 768,
      mrl: true,
      maxInputTokens: 8192,
      input: ["text"],
      output: ["vector"],
      instructionAware: false,
    },
    evidence: {
      tier: "curated",
      dated: "2026-10-02",
      cite: "huggingface.co/nomic-ai/nomic-embed-text-v1.5 config.json: n_embd 768, n_positions 8192; the card's Matryoshka section",
    },
  },
  {
    match: {
      model: "embeddinggemma",
    },
    kind: "embedding",
    embedding: {
      dims: 768,
      mrl: true,
      maxInputTokens: 2048,
      input: ["text"],
      output: ["vector"],
      instructionAware: false,
    },
    evidence: {
      tier: "curated",
      dated: "2026-10-02",
      cite: "huggingface.co/google/embeddinggemma-300m: 'Output embedding dimension size of 768 … (512, 256, or 128) via MRL'; 'Maximum input context length of 2048 tokens'",
    },
  },
  {
    match: {
      model: "all-minilm",
    },
    kind: "embedding",
    embedding: {
      dims: 384,
      mrl: false,
      maxInputTokens: 512,
      input: ["text"],
      output: ["vector"],
      instructionAware: false,
    },
    evidence: {
      tier: "curated",
      dated: "2026-10-02",
      cite: "huggingface.co/sentence-transformers/all-MiniLM-L6-v2 config.json: hidden_size 384, max_position_embeddings 512",
    },
  },
  {
    match: {
      model: "mxbai-embed-large",
    },
    kind: "embedding",
    embedding: {
      dims: 1024,
      mrl: true,
      maxInputTokens: 512,
      input: ["text"],
      output: ["vector"],
      instructionAware: false,
    },
    evidence: {
      tier: "curated",
      dated: "2026-10-02",
      cite: "huggingface.co/mixedbread-ai/mxbai-embed-large-v1 config.json: hidden_size 1024, max_position_embeddings 512; the card's Matryoshka section",
    },
  },
  {
    match: {
      model: "(^|/)qwen3-embedding",
    },
    kind: "embedding",
    embedding: {
      dims: 1024,
      mrl: true,
      maxInputTokens: 32_768,
      input: ["text"],
      output: ["vector"],
      instructionAware: true,
    },
    evidence: {
      tier: "curated",
      dated: "2026-10-02",
      cite: "huggingface.co/Qwen/Qwen3-Embedding-0.6B: 'Context Length: 32k'; 'Embedding Dimension: Up to 1024'; series table MRL Support Yes, Instruction Aware Yes",
    },
  },
  {
    match: {
      model: "(^|/)qwen3-embedding[-:]4b",
    },
    kind: "embedding",
    embedding: {
      dims: 2560,
    },
    evidence: {
      tier: "curated",
      dated: "2026-10-02",
      cite: "huggingface.co/Qwen/Qwen3-Embedding-0.6B series table: Qwen3-Embedding-4B embedding dimension 2560",
    },
  },
  {
    match: {
      model: "(^|/)qwen3-embedding([-:]8b|:latest$|$)",
    },
    kind: "embedding",
    embedding: {
      dims: 4096,
    },
    evidence: {
      tier: "curated",
      dated: "2026-10-02",
      cite: "huggingface.co/Qwen/Qwen3-Embedding-0.6B series table: Qwen3-Embedding-8B embedding dimension 4096; Ollama's untagged qwen3-embedding is the 8B",
    },
  },
] as const satisfies readonly CapabilityOverrideInput[];
