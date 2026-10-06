// `ChatUsage` — the NORMALIZED per-turn accounting core every wire reduces to (§5.3c). What a wire cannot
// normalize (Anthropic's 5m/1h cache-creation split, the SDK's warm-spare flag, OpenRouter's BYOK bit) is
// provider-opaque provenance under `providerMetadata[<providerId>]`, never a shared column with a
// per-wire meaning. Three fields have NO wire source and are filled by the caller: `contextWindow` from the
// resolved capability, `maxOutputTokens` from the funnel's cap, `costUsd`/`costDetails` from the
// transport's `extractMetadata` or the `estimated` arm.
//
// `costProvenance` REUSES `TOKEN_PROVENANCES` (never a second tuple beside `measured`): `measured` = the
// wire reported a cost; `estimated` = catalog/declared pricing × tokens, AND a subscription's SDK-computed
// notional price (no invoice exists — a rollup must not sum it with a metered figure); `unrecorded` = neither.
//
// `costDetails` is ALSO the read-seam parser for `message_variants.cost_details` (a PARSED JSON sidecar, §5.3c
// class 3 — `costDetailsSchema` is its one parser, a malformed blob degrades at the reader, never a cast).
// The per-phase split is OPTIONAL by design: only a wire that REPORTS one (OpenRouter's
// `usage.raw.cost_details.upstream_inference_{prompt,completions}_cost`, measured 2026-09-20) or the
// `estimated` arm (per-MTok pricing × tokens) can state it; Anthropic reports a total only. A required split
// would force a fabricated `0` — or an estimate laundered into a `measured` record — which is the exact class
// the provenance column exists to prevent. On a BYOK OpenRouter turn `totalUsd = gatewayUsd (OR's fee, its
// `cost`) + upstreamUsd (the provider's charge)`; on a passthrough turn `totalUsd` is OR's `cost` and the two
// are absent.

import type { ModelId, ProviderGenerationId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { tokenProvenanceSchema } from "../chat/token-provenance.ts";
import { normalizedFinishReasonSchema } from "./finish-reasons.ts";
import { modalitySchema } from "./modalities.ts";
import { providerIdSchema } from "./provider-id.ts";
import { wireSchema } from "./wires.ts";

const usd = z.number().nonnegative();

export const RESPONSE_CACHE_STATUSES = ["hit", "miss"] as const;
export const responseCacheSchema = z.object({
  status: z.enum(RESPONSE_CACHE_STATUSES),
  ageSeconds: z.number().int().nonnegative().nullable(),
  ttlSeconds: z.number().int().nonnegative().nullable(),
  sourceGenerationId: brandedId<ProviderGenerationId>().nullable(),
});
export type ResponseCache = z.infer<typeof responseCacheSchema>;

export const tokenPricingSchema = z.object({
  inputPerMTok: usd,
  outputPerMTok: usd,
  cacheReadPerMTok: usd.optional(),
  cacheWritePerMTok: usd.optional(),
});
export type TokenPricing = z.infer<typeof tokenPricingSchema>;

/** Per-phase / per-party upstream cost breakdown — the ONE parser for `message_variants.cost_details`. */
export const costDetailsSchema = z.object({
  totalUsd: usd,
  /** The inference split, when a wire reports one or the estimated arm derives one. */
  promptUsd: usd.optional(),
  completionUsd: usd.optional(),
  /** BYOK only: what the upstream provider charged and what the gateway charged on top. */
  upstreamUsd: usd.optional(),
  gatewayUsd: usd.optional(),
  /** Applied configured rates for an estimate, not a provider invoice or automatic price lookup. */
  pricing: tokenPricingSchema.optional(),
});
export type CostDetails = z.infer<typeof costDetailsSchema>;

export const costUsageSchema = z.object({
  costUsd: usd.nullable(),
  costDetails: costDetailsSchema.nullable(),
  costProvenance: tokenProvenanceSchema,
});
export type CostUsage = Readonly<z.infer<typeof costUsageSchema>>;

export const tokenUsageSchema = z.object({
  tokensIn: z.number().int().nonnegative().nullable(),
  tokensOut: z.number().int().nonnegative().nullable(),
  cacheReadTokens: z.number().int().nonnegative().nullable(),
  /** Billable cache-creation count, which may overlap cached reads; not physical writes or storage fees. */
  cacheWriteTokens: z.number().int().nonnegative().nullable(),
  reasoningTokens: z.number().int().nonnegative().nullable(),
});
export type TokenUsage = Readonly<z.infer<typeof tokenUsageSchema>>;

/** Provider-reported modality subsets. Lists may be partial; never derive totals from their sum. */
export const tokenDetailsSchema = z.object({
  input: z.array(z.object({ modality: modalitySchema, tokens: z.number().int().nonnegative() })).optional(),
  output: z.array(z.object({ modality: modalitySchema, tokens: z.number().int().nonnegative() })).optional(),
});
export type TokenDetails = z.infer<typeof tokenDetailsSchema>;

export const generationUsageSchema = tokenUsageSchema.extend({
  responseCache: responseCacheSchema.optional(),
  servedModel: z.string().min(1).nullable(),
  tokenDetails: tokenDetailsSchema.nullable(),
  ...costUsageSchema.shape,
});
export type GenerationUsage = z.infer<typeof generationUsageSchema>;

/** One completed SDK observation. numTurns/modelCalls is reported SDK cardinality, not inferred HTTP calls.
 * Private funding/connection context belongs to the retained chat observation, never this copied provenance. */
export const generationUsageLegSchema = generationUsageSchema.extend({
  model: brandedId<ModelId>(),
  provider: providerIdSchema,
  wire: wireSchema,
  observedAt: z.number().int().nonnegative(),
  contextWindow: z.number().int().nonnegative().nullable(),
  maxOutputTokens: z.number().int().nonnegative().nullable(),
  modelCalls: z.number().int().nonnegative().nullable(),
  durationApiMs: z.number().nonnegative().nullable(),
  ttftMs: z.number().nonnegative().nullable(),
  finishReason: normalizedFinishReasonSchema.nullable(),
  stopReason: z.string().nullable(),
  terminalReason: z.string().nullable(),
  generationId: brandedId<ProviderGenerationId>().nullable(),
});
export type GenerationUsageLeg = z.infer<typeof generationUsageLegSchema>;

export interface GenerationUsageProjection {
  readonly total: GenerationUsage;
  /** Explicitly partial when a leg is unknown. Never persist this as the complete variant total. */
  readonly knownSubtotal: GenerationUsage;
}

function countSum(rows: readonly GenerationUsage[], key: keyof TokenUsage, complete: boolean): number | null {
  let sum = 0;
  let known = false;
  for (const row of rows) {
    const value = row[key];
    if (value === null) {
      if (complete) {
        return null;
      }
    } else {
      known = true;
      sum += value;
    }
  }
  return known ? sum : null;
}

const costComponentSchema = costDetailsSchema.omit({ totalUsd: true, pricing: true }).keyof();
function detailSum(rows: readonly GenerationUsage[], key: z.infer<typeof costComponentSchema>): number | null {
  let sum = 0;
  for (const row of rows) {
    const value = row.costDetails?.[key];
    if (value === undefined) {
      return null;
    }
    sum += value;
  }
  return rows.length > 0 ? sum : null;
}

function incompatibleCostBases(rows: readonly (GenerationUsage | GenerationUsageLeg)[]): boolean {
  let notional = false;
  let metered = false;
  for (const row of rows) {
    if (!("wire" in row)) {
      continue;
    }
    if (row.wire === "agent-sdk") {
      notional = true;
    } else {
      metered = true;
    }
  }
  return notional && metered;
}

function projectedCost(rows: readonly (GenerationUsage | GenerationUsageLeg)[], complete: boolean): CostUsage {
  const known = rows.filter((row): row is GenerationUsage & { costUsd: number } => row.costUsd !== null);
  if (incompatibleCostBases(rows) || known.length === 0 || (complete && known.length !== rows.length)) {
    return { costUsd: null, costDetails: null, costProvenance: "unrecorded" };
  }
  const costUsd = known.reduce((sum, row) => sum + row.costUsd, 0);
  let costProvenance: CostUsage["costProvenance"] = "measured";
  if (known.some((row) => row.costProvenance === "unrecorded")) {
    costProvenance = "unrecorded";
  } else if (known.some((row) => row.costProvenance === "estimated")) {
    costProvenance = "estimated";
  }
  const promptUsd = detailSum(known, "promptUsd");
  const completionUsd = detailSum(known, "completionUsd");
  const upstreamUsd = detailSum(known, "upstreamUsd");
  const gatewayUsd = detailSum(known, "gatewayUsd");
  const pricing = known[0]?.costDetails?.pricing;
  const commonPricing =
    costProvenance === "estimated" &&
    pricing !== undefined &&
    known.every(
      (row) => row.costDetails?.pricing !== undefined && tokenPricingSchema.keyof().options.every((key) => row.costDetails?.pricing?.[key] === pricing[key]),
    );
  return {
    costUsd,
    costProvenance,
    costDetails: {
      totalUsd: costUsd,
      ...(promptUsd === null ? {} : { promptUsd }),
      ...(completionUsd === null ? {} : { completionUsd }),
      ...(upstreamUsd === null ? {} : { upstreamUsd }),
      ...(gatewayUsd === null ? {} : { gatewayUsd }),
      ...(commonPricing ? { pricing } : {}),
    },
  };
}

function projectedDetails(rows: readonly GenerationUsage[]): TokenDetails | null {
  const detail: TokenDetails = {};
  for (const axis of tokenDetailsSchema.keyof().options) {
    const reported = rows.flatMap((row) => row.tokenDetails?.[axis] ?? []);
    if (rows.some((row) => row.tokenDetails?.[axis] !== undefined)) {
      detail[axis] = modalitySchema.options.flatMap((modality) => {
        const members = reported.filter((entry) => entry.modality === modality);
        return members.length === 0 ? [] : [{ modality, tokens: members.reduce((sum, entry) => sum + entry.tokens, 0) }];
      });
    }
  }
  return Object.keys(detail).length === 0 ? null : detail;
}

function projectedUsage(rows: readonly (GenerationUsage | GenerationUsageLeg)[], complete: boolean): GenerationUsage {
  const served = rows[0]?.servedModel ?? null;
  return {
    tokensIn: countSum(rows, "tokensIn", complete),
    tokensOut: countSum(rows, "tokensOut", complete),
    cacheReadTokens: countSum(rows, "cacheReadTokens", complete),
    cacheWriteTokens: countSum(rows, "cacheWriteTokens", complete),
    reasoningTokens: countSum(rows, "reasoningTokens", complete),
    servedModel: served !== null && rows.every((row) => row.servedModel === served) ? served : null,
    tokenDetails: projectedDetails(rows),
    ...projectedCost(rows, complete),
    ...(rows.length === 1 && rows[0]?.responseCache !== undefined ? { responseCache: rows[0].responseCache } : {}),
  };
}

/** An absent paid axis is unknown, not zero. Keep the known subtotal separately from the complete total. */
export function projectGenerationUsage(rows: readonly (GenerationUsage | GenerationUsageLeg)[]): GenerationUsageProjection {
  return { total: projectedUsage(rows, true), knownSubtotal: projectedUsage(rows, false) };
}
/** Image provenance already has a scalar cost. Legacy rows retain an unknown source, not a fabricated one. */
export const generationUsageDetailsSchema = generationUsageSchema.omit({ costUsd: true }).extend({
  cacheReadTokens: tokenUsageSchema.shape.cacheReadTokens.nullable(),
  cacheWriteTokens: tokenUsageSchema.shape.cacheWriteTokens.nullable(),
  costProvenance: tokenProvenanceSchema.nullable(),
});
export type GenerationUsageDetails = z.infer<typeof generationUsageDetailsSchema>;

export interface ChatUsage extends GenerationUsage {
  readonly model: ModelId;
  readonly contextWindow: number | null;
  readonly maxOutputTokens: number | null;
}

/** The V4-shaped nested usage the Vercel SDK reports, re-spelled structurally so the fold has one input
 *  shape per hosted wire and no `@ai-sdk/provider` type crosses the contract. */
export interface NestedUsage {
  readonly inputTokens?: { readonly total?: number | undefined; readonly cacheRead?: number | undefined; readonly cacheWrite?: number | undefined } | undefined;
  readonly outputTokens?: { readonly total?: number | undefined; readonly reasoning?: number | undefined } | undefined;
}

export function foldTokenUsage(usage: NestedUsage | undefined): TokenUsage {
  return {
    tokensIn: usage?.inputTokens?.total ?? null,
    tokensOut: usage?.outputTokens?.total ?? null,
    cacheReadTokens: usage?.inputTokens?.cacheRead ?? 0,
    cacheWriteTokens: usage?.inputTokens?.cacheWrite ?? 0,
    reasoningTokens: usage?.outputTokens?.reasoning ?? null,
  };
}

/** nested → flat. `cacheRead`/`cacheWrite` default to 0 (a wire that reports no cache has none); the
 *  totals stay `null` when the wire reported nothing at all. */
export function foldNestedUsage(
  usage: NestedUsage | undefined,
  fill: { readonly model: ModelId; readonly contextWindow: number | null; readonly maxOutputTokens: number | null },
): Omit<ChatUsage, "costUsd" | "costDetails" | "costProvenance"> {
  return {
    ...foldTokenUsage(usage),
    servedModel: null,
    tokenDetails: null,
    model: fill.model,
    contextWindow: fill.contextWindow,
    maxOutputTokens: fill.maxOutputTokens,
  };
}
