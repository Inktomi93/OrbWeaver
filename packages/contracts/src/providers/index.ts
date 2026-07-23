// @orb/contracts/providers — the cross-boundary provider RESULT shapes. These are the role-result
// contracts produced by the sealed `infra/providers` runners and consumed by `role-clients`. Holds
// ONLY result shapes — request shapes carry an `AbortSignal`/`ResolvedCredential` and stay infra-internal.
// Vectors are `Float32Array` — the same binary format libSQL's `vector_idx` consumes.

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

/** A hosted credential's account balance — the `accountCredits` surface returns it. Family-neutral:
 *  OpenRouter reports USD credits; `total` is the lifetime granted, `used` the cumulative spend. */
export const accountCreditsSchema = z.object({
  total: z.number(),
  used: z.number(),
});
export type AccountCredits = z.infer<typeof accountCreditsSchema>;

/** The settled upstream cost of ONE generation. Token counts are `null` when the provider doesn't
 *  break them out. */
export const generationCostSchema = z.object({
  totalCost: z.number(),
  tokensPrompt: z.number().nullable(),
  tokensCompletion: z.number().nullable(),
});
export type GenerationCost = z.infer<typeof generationCostSchema>;

/** The "Test endpoint" inspector's result — the `inspect` surface returns it. Carries the ACTUAL shaped
 *  request (headers REDACTED — the key never leaves the server) plus the raw response, or a `null`
 *  response + an `error` message when the request never completed (DNS / refused / timeout). */
export const endpointInspectionSchema = z.object({
  /** True iff the endpoint answered with a 2xx. */
  ok: z.boolean(),
  request: z.object({
    url: z.string(),
    /** REDACTED — Authorization / key-shaped headers are masked. */
    headers: z.record(z.string(), z.string()),
    /** Pretty-printed JSON of the outbound body. */
    body: z.string(),
  }),
  /** The raw response, or `null` when the request never completed. */
  response: z
    .object({
      status: z.number(),
      statusText: z.string(),
      bodyPreview: z.string(),
    })
    .nullable(),
  /** Transport error message; present only when `response` is `null`. */
  error: z.string().optional(),
});
export type EndpointInspection = z.infer<typeof endpointInspectionSchema>;

/** The authenticated account's identity/plan metadata — an SDK-free projection of the agent-sdk
 *  `accountInfo()` control response. Best-effort: omitted on any failure/timeout (the verify turn must
 *  never fail or delay on this). `apiProvider: "firstParty"` is the healthy Max-sub answer. */
export const verifyAuthAccountSchema = z.object({
  email: z.string().optional(),
  organization: z.string().optional(),
  /** The plan tier the account is on (SDK `subscriptionType`). */
  subscriptionType: z.string().optional(),
  /** The active API backend (SDK `apiProvider`) — the union the SDK declares. */
  apiProvider: z.enum(["firstParty", "bedrock", "vertex", "foundry", "anthropicAws", "mantle", "gateway", "anthropicGoogleCloud"]).optional(),
});
export type VerifyAuthAccount = z.infer<typeof verifyAuthAccountSchema>;

export const verifyAuthResultSchema = z.object({
  source: z.literal("max-pro-sub"),
  ok: z.boolean(),
  /** Which credential the spawned runtime used (`"none"` = the host login was active — the healthy
   *  Max-sub answer; an unexpected key name means an env leak reached the spawn). */
  apiKeySource: z.string(),
  model: z.string(),
  /** The trimmed probe reply (expected `"ok"`). */
  reply: z.string(),
  /** Metered-equivalent cost; on a flat-rate Max sub this is allowance, not dollars. */
  costUsd: z.number(),
  /** The authenticated account's identity/plan metadata (agent-sdk `accountInfo()`); ABSENT when the
   *  best-effort probe failed/timed out (never fails the verify turn). */
  account: verifyAuthAccountSchema.optional(),
});
export type VerifyAuthResult = z.infer<typeof verifyAuthResultSchema>;
