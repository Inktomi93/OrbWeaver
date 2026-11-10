// @orb/contracts/providers — the cross-boundary provider RESULT shapes. These are the role-result
// contracts produced by the sealed `infra/providers` runners and consumed by `role-clients`. Holds
// ONLY result shapes — request shapes carry an `AbortSignal`/`ResolvedCredential` and stay infra-internal.
// Vectors are `Float32Array` — the same binary format libSQL's `vector_idx` consumes.

// Strip mode: these schemas also read upstream responses, which can carry keys this release does not declare; the wire parses a strict form (`strictTwin` or a `.strict()` view).
import { z } from "zod";
import { responseCacheSchema } from "../inference/usage.ts";

/** One embedding vector. Single binary type across all families (the OR runner converts `number[]` →
 *  `Float32Array` at its boundary). */
const embedVectorSchema = z.instanceof(Float32Array);

/** Token usage of one embed batch observation. `null` when the family doesn't report — in-process
 *  embedders don't meter. */
export const embedUsageSchema = z.strictObject({
  responseCache: responseCacheSchema.optional(),
  /** Tokens billed. `null` when the family doesn't report. */
  promptTokens: z.number().nullable(),
  totalTokens: z.number().nullable(),
});

// Cross-family TEXT embed result. One `vectors` entry per input (same order as the request `input`
//  array; a single-string input produces a one-element array). `null` entries mark filtered inputs
//  (empty/whitespace) — the local family filters; OpenRouter never emits `null`. Callers that always
//  pass non-empty inputs can `.filter((v): v is Float32Array => v !== null)`.
const embedResultSchema = z.strictObject({
  vectors: z.array(embedVectorSchema.nullable()),
  /** Which model actually served the embedding — provenance for the row's `model` column. */
  model: z.string(),
});
export type EmbedResult = z.infer<typeof embedResultSchema>;

// A single rerank result — preserves the caller's id (NOT an array index), stable across
//  reorderings; the caller looks up text via their own map rather than re-indexing the documents.
const rerankHitSchema = z.strictObject({
  /** The caller-supplied id from the request's `documents[].id`. */
  id: z.string(),
  /** Relevance score; higher = more relevant. Range is family-dependent (local: raw monotonic logit;
   *  hosted: provider-normalized, often `[0, 1]`). */
  score: z.number(),
});
export type RerankHit = z.infer<typeof rerankHitSchema>;

// Cross-family rerank result. `hits` is sorted descending by score; length ≤ request `topN` (or the
//  full scored-document count when `topN` was unset). Empty-text documents were filtered before
//  scoring.
const rerankResultSchema = z.strictObject({
  hits: z.array(rerankHitSchema),
});
export type RerankResult = z.infer<typeof rerankResultSchema>;

// Cross-family joint-modality embed result. Vectors live in the SHARED image/text space defined by
//  the model — an image embedding and a text embedding from the SAME model compare directly. Vectors
//  from different models (or non-space-sharing modes) are NOT comparable; `model` is the provenance
//  for catching cross-space bugs at the storage boundary. `null` entries mark filtered inputs.
const imageEmbedResultSchema = z.strictObject({
  vectors: z.array(embedVectorSchema.nullable()),
  model: z.string(),
});
export type ImageEmbedResult = z.infer<typeof imageEmbedResultSchema>;

// One summary per input (same order as request `inputs`).
const summarizeResultItemSchema = z.strictObject({
  /** The summary text — `<think>…</think>` blocks stripped at the runner boundary so callers never
   *  see CoT scaffolding. */
  text: z.string(),
  usage: z.strictObject({
    tokensIn: z.number().nullable(),
    tokensOut: z.number().nullable(),
    /** Generation cost in USD. `null` for local families (no metered cost). */
    costUsd: z.number().nullable(),
  }),
});
export type SummarizeResultItem = z.infer<typeof summarizeResultItemSchema>;

// Cross-family summarize result. `items` length matches `request.inputs`; index-aligned.
const summarizeResultSchema = z.strictObject({
  items: z.array(summarizeResultItemSchema),
});
export type SummarizeResult = z.infer<typeof summarizeResultSchema>;

/** A hosted credential's account balance — the `accountCredits` surface returns it. Family-neutral:
 *  OpenRouter reports USD credits; `total` is the lifetime granted, `used` the cumulative spend. */
export const accountCreditsSchema = z.strictObject({
  total: z.number(),
  used: z.number(),
});
export type AccountCredits = z.infer<typeof accountCreditsSchema>;

/** The settled upstream cost of ONE generation. */
export const generationCostSchema = z.strictObject({
  totalCost: z.number(),
});
export type GenerationCost = z.infer<typeof generationCostSchema>;

// Scrubbing credentials can remove part of the URL. A failure before the send has no URL.
const inspectionDisplayText = z.string();

/** The "Test endpoint" inspector's result — the `inspect` surface returns it. Carries the request one chat
 *  call sent on the route chat uses (headers REDACTED — the key never leaves the server) plus the raw
 *  response, or a `null` response + an `error` message when the request never completed (DNS / refused / timeout). */
const endpointInspectionBaseSchema = z.strictObject({
  request: z.strictObject({
    url: inspectionDisplayText,
    /** REDACTED — Authorization / key-shaped headers are masked. */
    headers: z.record(z.string(), z.string()),
    /** Pretty-printed JSON of the outbound body. */
    body: inspectionDisplayText,
  }),
  /** The raw response, or `null` when the request never completed. */
  response: z.strictObject({
    status: z.number(),
    statusText: z.string(),
    bodyPreview: z.string(),
  }),
});
export const endpointInspectionSchema = z.discriminatedUnion("ok", [
  endpointInspectionBaseSchema.extend({ ok: z.literal(true), error: z.never().exactOptional() }),
  endpointInspectionBaseSchema.extend({ ok: z.literal(false), response: endpointInspectionBaseSchema.shape.response.nullable(), error: z.string().optional() }),
]);
export type EndpointInspection = z.infer<typeof endpointInspectionSchema>;

/** The authenticated account's identity/plan metadata — an SDK-free projection of the agent-sdk
 *  `accountInfo()` control response. Best-effort: omitted on any failure/timeout (the verify turn must
 *  never fail or delay on this).
 *
 *  @remarks Strip mode on purpose: this parses the SDK's own response, so a field the SDK adds is dropped from
 *  the projection instead of failing it. The wire result below re-reads it strictly. */
export const verifyAuthAccountSchema = z
  .object({
    email: z.email().optional(),
    organization: z.string().optional(),
    /** The plan tier the account is on (SDK `subscriptionType`). */
    subscriptionType: z.string().optional(),
  })
  .strip();
export type VerifyAuthAccount = z.infer<typeof verifyAuthAccountSchema>;

export const verifyAuthResultSchema = z.strictObject({
  ok: z.boolean(),
  /** Which credential the spawned runtime used (`"none"` = the host login was active — the healthy
   *  Max-sub answer; an unexpected key name means an env leak reached the spawn). */
  apiKeySource: z.string(),
  /** The trimmed probe reply (expected `"ok"`). */
  reply: z.string(),
  /** Metered-equivalent cost; on a flat-rate Max sub this is allowance, not dollars. */
  costUsd: z.number(),
  /** The authenticated account's identity/plan metadata (agent-sdk `accountInfo()`); ABSENT when the
   *  best-effort probe failed/timed out (never fails the verify turn). */
  account: verifyAuthAccountSchema.strict().optional(),
});
export type VerifyAuthResult = z.infer<typeof verifyAuthResultSchema>;
