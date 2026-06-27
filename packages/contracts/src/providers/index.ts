// @orb/contracts/providers — the cross-boundary provider RESULT shapes (DAG Layer 0, kit-only).
//
// These are the role-result contracts produced by the sealed `infra/providers` runners and consumed
// by the `@orb/contracts/role-clients` bundle (and, through it, the embeddings / search / discovery /
// workloads domains). They are what `role-clients` depends on, so they must land first
// (shared-dissolution §8; tiers/providers.md movement table).
//
// SCOPE (resolved — tiers/providers.md is the authority, contracts-dag §2 providers FLAG): this node
// holds ONLY the cross-boundary RESULT shapes. The REQUEST shapes (EmbedRequest / ChatRequest /
// AgentTurnRequest) stay infra-internal behind `infra/providers/contract/` — they carry an
// `AbortSignal` (no DOM/node lib here) and a branded `ResolvedCredential`, which are not wire shapes.
// `embeddings.md` lists `EmbedRequest` here; that is reconciled OUT (see report FLAG).
//
// Vectors are `Float32Array` — the same binary format libSQL's `vector_idx` consumes, so the local
// embedder stores them without a copy; the OpenRouter runner wraps its `number[]` response into a
// `Float32Array` at the runner boundary so the caller-side type is uniform across families.

import { z } from "zod";

/** One embedding vector. Single binary type across all families (the OR runner converts `number[]` →
 *  `Float32Array` at its boundary). */
const embedVectorSchema = z.instanceof(Float32Array);

/** Token-usage half of a (text) embed result. `null` when the family doesn't report — in-process
 *  embedders don't meter. */
const embedUsageSchema = z.object({
  /** Tokens billed. `null` when the family doesn't report. */
  promptTokens: z.number().nullable(),
  totalTokens: z.number().nullable(),
});

/** Cross-family TEXT embed result. One `vectors` entry per input (same order as the request `input`
 *  array; a single-string input produces a one-element array). `null` entries mark filtered inputs
 *  (empty/whitespace) — the local family filters; OpenRouter never emits `null`. Callers that always
 *  pass non-empty inputs can `.filter((v): v is Float32Array => v !== null)`. */
export const embedResultSchema = z.object({
  vectors: z.array(embedVectorSchema.nullable()),
  /** Which model actually served the embedding — provenance for the row's `model` column. */
  model: z.string(),
  usage: embedUsageSchema,
});
export type EmbedResult = z.infer<typeof embedResultSchema>;

/** A single rerank result — preserves the caller's id (NOT an array index), stable across
 *  reorderings; the caller looks up text via their own map rather than re-indexing the documents. */
export const rerankHitSchema = z.object({
  /** The caller-supplied id from the request's `documents[].id`. */
  id: z.string(),
  /** Relevance score; higher = more relevant. Range is family-dependent (local: raw monotonic logit;
   *  hosted: provider-normalized, often `[0, 1]`). */
  score: z.number(),
});
export type RerankHit = z.infer<typeof rerankHitSchema>;

/** Cross-family rerank result. `hits` is sorted descending by score; length ≤ request `topN` (or the
 *  full scored-document count when `topN` was unset). Empty-text documents were filtered before
 *  scoring. */
export const rerankResultSchema = z.object({
  hits: z.array(rerankHitSchema),
  model: z.string(),
  usage: z.object({
    /** Tokens billed (some families don't report — `null` then). */
    totalTokens: z.number().nullable(),
  }),
});
export type RerankResult = z.infer<typeof rerankResultSchema>;

/** Cross-family joint-modality embed result. Vectors live in the SHARED image/text space defined by
 *  the model — an image embedding and a text embedding from the SAME model compare directly. Vectors
 *  from different models (or non-space-sharing modes) are NOT comparable; `model` is the provenance
 *  for catching cross-space bugs at the storage boundary. `null` entries mark filtered inputs. */
export const imageEmbedResultSchema = z.object({
  vectors: z.array(embedVectorSchema.nullable()),
  model: z.string(),
});
export type ImageEmbedResult = z.infer<typeof imageEmbedResultSchema>;

/** One summary per input (same order as request `inputs`). */
export const summarizeResultItemSchema = z.object({
  /** The summary text — `<think>…</think>` blocks stripped at the runner boundary so callers never
   *  see CoT scaffolding. */
  text: z.string(),
  usage: z.object({
    tokensIn: z.number().nullable(),
    tokensOut: z.number().nullable(),
    /** Generation cost in USD. `null` for local families (no metered cost). */
    costUsd: z.number().nullable(),
  }),
});
export type SummarizeResultItem = z.infer<typeof summarizeResultItemSchema>;

/** Cross-family summarize result. `items` length matches `request.inputs`; index-aligned. */
export const summarizeResultSchema = z.object({
  items: z.array(summarizeResultItemSchema),
  /** Which model actually produced the summaries — provenance for `chat_digests.summarizerModel` and
   *  similar storage seams. */
  model: z.string(),
});
export type SummarizeResult = z.infer<typeof summarizeResultSchema>;
