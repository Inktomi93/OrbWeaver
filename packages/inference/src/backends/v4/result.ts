// The drained V4 stream → the ONE `ChatResult` record every wire speaks (§8.4-7): the normalized usage core
// (`foldNestedUsage`), the finish-reason fold through the shared `FINISH_REASON_MAP`, the cost with its
// PROVENANCE (`measured` when the wire reported a figure, `estimated` from the row's pricing × tokens,
// `unrecorded` otherwise — §5.3c), and the wire-opaque metadata keyed by provider id.

import type { SharedV4ProviderMetadata, SharedV4Warning } from "@ai-sdk/provider";
import type { AdjustedKnob } from "@orb/contracts/chat";
import { ADJUSTED_KNOBS } from "@orb/contracts/chat";
import type {
  ChatUsage,
  CostDetails,
  EndpointFeatures,
  GenerationCapability,
  GenerationUsage,
  NestedUsage,
  ResponseCache,
  TokenDetails,
  TokenUsage,
} from "@orb/contracts/inference";
import { foldNestedUsage, foldTokenUsage } from "@orb/contracts/inference";
import type { EffortLevel } from "@orb/contracts/preset";
import type { ModelId } from "@orb/kit/ids";
import { z } from "zod";
import type { ChatResult } from "../../contract/chat.ts";
import { normalizeFinishReason } from "../../contract/chat.ts";
import type { ChatEvent, RateLimitSnapshot } from "../../contract/events.ts";
import type { ResolvedSampling, ResolvedWarning } from "../../contract/resolve.ts";
import { variantProviderMetadataOf } from "../kit/provider-metadata.ts";
import type { StreamDrain } from "./stream.ts";

const TOKENS_PER_MTOK = 1_000_000;
const OPENROUTER_KEY = "openrouter";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** What OpenRouter puts on the V4 `usage.raw` beyond the SDK's typed mapping (measured 2026-09-20,
 *  `gen-1789884256-ZeulFgkGknjAbAgCKe1S`): the per-phase upstream split and the BYOK bit. Optional throughout —
 *  a wire that reports none of it is simply not OpenRouter. */
const reportedUsd = z.number().nonnegative().nullish().catch(null);
const openRouterRawUsageSchema = z.object({
  cost: reportedUsd,
  cost_details: z
    .object({
      upstream_inference_cost: reportedUsd,
      upstream_inference_prompt_cost: reportedUsd,
      upstream_inference_completions_cost: reportedUsd,
    })
    .nullish()
    .catch(null),
  is_byok: z.boolean().nullish().catch(null),
});

/** A wire-reported cost WITH its breakdown — what `costProvenance: "measured"` records. */
export interface MeasuredCost {
  readonly costUsd: number;
  readonly costDetails: CostDetails;
}

function measuredCostWithDetails(args: {
  readonly cost: number;
  readonly upstreamCost: number | null | undefined;
  readonly prompt: number | null | undefined;
  readonly completions: number | null | undefined;
  readonly byok: boolean;
}): MeasuredCost {
  const { cost, upstreamCost, prompt, completions, byok } = args;
  const split = {
    ...(typeof prompt === "number" ? { promptUsd: prompt } : {}),
    ...(typeof completions === "number" ? { completionUsd: completions } : {}),
  };
  if (byok && typeof upstreamCost === "number") {
    const totalUsd = cost + upstreamCost;
    return { costUsd: totalUsd, costDetails: { totalUsd, ...split, upstreamUsd: upstreamCost, gatewayUsd: cost } };
  }
  return { costUsd: cost, costDetails: { totalUsd: cost, ...split } };
}

/** The admitted OpenRouter images response reports cost, but its image SDK discards the raw usage. */
export function rawMeasuredOpenRouterCostOf(rawUsage: unknown): MeasuredCost | null {
  const raw = openRouterRawUsageSchema.safeParse(rawUsage);
  if (!raw.success || raw.data.cost === null || raw.data.cost === undefined) {
    return null;
  }
  const details = raw.data.cost_details;
  if (raw.data.is_byok === true && (details?.upstream_inference_cost === null || details?.upstream_inference_cost === undefined)) {
    return null;
  }
  return measuredCostWithDetails({
    cost: raw.data.cost,
    upstreamCost: details?.upstream_inference_cost,
    prompt: details?.upstream_inference_prompt_cost,
    completions: details?.upstream_inference_completions_cost,
    byok: raw.data.is_byok === true,
  });
}

/** Image output has modality-specific prices: configured flat chat rates cannot establish its cost. */
export function generationUsageOf(usage: NestedUsage | undefined, servedModel: string | undefined, measured: MeasuredCost | null): GenerationUsage {
  return {
    ...foldTokenUsage(usage),
    servedModel: servedModel ?? null,
    tokenDetails: null,
    costUsd: measured === null ? null : measured.costUsd,
    costDetails: measured === null ? null : measured.costDetails,
    costProvenance: measured === null ? "unrecorded" : "measured",
  };
}

/** The wire-reported cost off the SDK's provider metadata — OpenRouter's usage accounting today; `null` on every
 *  transport that reports none (the `estimated`/`unrecorded` arms follow). On a BYOK connection OR's `cost` is
 *  the GATEWAY FEE and `costDetails.upstreamInferenceCost` the provider's charge (inference audit A4), so the
 *  spend is their sum and both ride the record; on a passthrough connection `cost` IS the spend (measured equal
 *  to the upstream figure on every probe). The prompt/completions split lives on `usage.raw` only. */
export function measuredCostOf(
  providerMetadata: SharedV4ProviderMetadata | undefined,
  rawUsage: Readonly<Record<string, unknown>> | undefined,
): MeasuredCost | null {
  const usage = providerMetadata?.[OPENROUTER_KEY]?.["usage"];
  if (!isRecord(usage)) {
    return null;
  }
  const cost = reportedUsd.parse(usage["cost"]);
  if (cost === null || cost === undefined) {
    return null;
  }
  const details = usage["costDetails"];
  const raw = openRouterRawUsageSchema.safeParse(rawUsage);
  const upstreamCost =
    reportedUsd.parse(isRecord(details) ? details["upstreamInferenceCost"] : undefined) ??
    (raw.success ? raw.data.cost_details?.upstream_inference_cost : undefined);
  const byok = raw.success && raw.data.is_byok === true;
  if (byok && (upstreamCost === null || upstreamCost === undefined)) {
    return null;
  }
  const prompt = raw.success ? raw.data.cost_details?.upstream_inference_prompt_cost : undefined;
  const completions = raw.success ? raw.data.cost_details?.upstream_inference_completions_cost : undefined;
  return measuredCostWithDetails({
    cost,
    upstreamCost,
    prompt,
    completions,
    byok,
  });
}

// ── the SDK's own warnings (§A3) ───────────────────────────────────────────────────────────────────────

/** How the provider spells a TOOL in an `unsupported` warning's `feature` (`@ai-sdk/anthropic` dist:
 *  `tool ${name}` / `provider-defined tool ${id}`, and `strict` for a tool's strict flag). The feature
 *  string is an open vocabulary, so this is a prefix test with its source named, never a parse. */
const TOOL_FEATURE_PREFIXES = ["tool ", "provider-defined tool ", "strict"] as const;

function isToolFeature(feature: string): boolean {
  return TOOL_FEATURE_PREFIXES.some((prefix) => feature.startsWith(prefix));
}

/** The SDK's feature name → OUR knob vocabulary when the two agree (`temperature`, `topP`, `topK`, `seed`,
 *  `frequencyPenalty`, `presencePenalty` are spelled identically on both sides). A feature with no knob of
 *  ours rides as prose only — the receipt still names it in the message. */
function knobOf(feature: string): AdjustedKnob | undefined {
  return ADJUSTED_KNOBS.find((knob) => knob === feature);
}

function detailSuffix(details: string | undefined): string {
  return details === undefined ? "" : ` (${details})`;
}

/** Map ONE `SharedV4Warning` onto our vocabulary. The SDK's four arms fold onto three codes: `unsupported`
 *  splits by whether the feature is a tool, and `compatibility`/`deprecated`/`other` are all "it ran, but
 *  not as spelled" — the class an operator fixes in OUR configuration. */
function resolvedWarningOf(warning: SharedV4Warning): ResolvedWarning {
  if (warning.type === "unsupported") {
    const knob = knobOf(warning.feature);
    return {
      code: isToolFeature(warning.feature) ? "sdk_unsupported_tool" : "sdk_unsupported_setting",
      ...(knob !== undefined ? { knob } : {}),
      message: `the provider does not support "${warning.feature}" on this model: it was not sent${detailSuffix(warning.details)}`,
    };
  }
  if (warning.type === "compatibility") {
    return { code: "sdk_compatibility", message: `the provider ran "${warning.feature}" in a compatibility mode${detailSuffix(warning.details)}` };
  }
  if (warning.type === "deprecated") {
    return { code: "sdk_compatibility", message: `the provider reports "${warning.setting}" as deprecated: ${warning.message}` };
  }
  return { code: "sdk_compatibility", message: warning.message };
}

/** Every SDK warning the drain collected → our `ResolvedWarning`s. The caller folds these into the turn's
 *  warning array BEFORE the result is built, so they reach the bus events AND the sampling receipt (§B2)
 *  from one place. */
export function sdkWarnings(warnings: readonly SharedV4Warning[]): ResolvedWarning[] {
  return warnings.map(resolvedWarningOf);
}

/** Which warning codes a `provider.sampling` receipt lists under `dropped` — the funnel's own drops PLUS the
 *  SDK's second gate (§B2). One home, both hosted wires. */
export const DROPPED_SAMPLING_CODES: ReadonlySet<ResolvedWarning["code"]> = new Set<ResolvedWarning["code"]>([
  "sampling_knob_dropped",
  "verbosity_dropped",
  "sdk_unsupported_setting",
]);

/** `log.sampling.applied` is a CLAIM about the wire, so it must survive the SDK's own stripping (§B2): a knob
 *  the provider refused after `resolveChat` resolved it is removed here and rides `dropped` instead. Without
 *  this the receipt says "temperature applied" for a model whose provider never sent it. */
export function appliedSampling(sampling: ResolvedSampling, warnings: readonly ResolvedWarning[]): Record<string, unknown> {
  const dropped = new Set<string>();
  for (const warning of warnings) {
    if (warning.code === "sdk_unsupported_setting" && warning.knob !== undefined) {
      dropped.add(warning.knob);
    }
  }
  return Object.fromEntries(Object.entries(sampling).filter(([knob]) => !dropped.has(knob)));
}

export interface ResultContext {
  readonly responseCache?: ResponseCache | undefined;
  readonly model: ModelId;
  readonly providerId: string;
  readonly generation: GenerationCapability;
  readonly maxOutputTokens: number | undefined;
  readonly startedAt: number;
  readonly firstDeltaAt: number | undefined;
  readonly now: number;
  /** The wire-reported cost + breakdown, when the transport read one (OpenRouter's usage accounting). */
  readonly measuredCost: MeasuredCost | null;
  /** The row's shipped pricing — the `estimated` arm when nothing was measured. */
  readonly pricing: EndpointFeatures["pricing"];
  readonly generationId: string | null;
  /** What the wire carried for effort (`ChatResult.appliedEffort`) — read off the built options by the transport. */
  readonly appliedEffort: EffortLevel | null;
  /** The response's rate-limit headers, parsed by the transport (`backends/kit/rate-limit-headers.ts`). */
  readonly rateLimit: RateLimitSnapshot | null;
  readonly warnings: readonly ResolvedWarning[];
  /** Boundary-normalized facts where the SDK loses reportedness (native GenerateContent). */
  readonly tokenUsage?: TokenUsage;
  readonly servedModel?: string | null;
  readonly tokenDetails?: TokenDetails | null;
}

function costOf(
  core: Omit<ChatUsage, "costUsd" | "costDetails" | "costProvenance">,
  ctx: ResultContext,
): Pick<ChatUsage, "costUsd" | "costDetails" | "costProvenance"> {
  if (ctx.measuredCost !== null) {
    return { costUsd: ctx.measuredCost.costUsd, costDetails: ctx.measuredCost.costDetails, costProvenance: "measured" };
  }
  if (ctx.responseCache?.status === "hit") {
    return { costUsd: 0, costDetails: { totalUsd: 0 }, costProvenance: "measured" };
  }
  if (ctx.pricing !== undefined && core.tokensIn !== null && core.tokensOut !== null && core.cacheReadTokens !== null && core.cacheWriteTokens !== null) {
    const uncachedTokens = core.tokensIn - core.cacheReadTokens - core.cacheWriteTokens;
    // Only compatible non-overlapping counters establish this flat-rate estimate. Overlapping provider
    // creation/read counts or an absent applicable rate cannot establish a complete price.
    if (
      uncachedTokens < 0 ||
      (core.cacheReadTokens > 0 && ctx.pricing.cacheReadPerMTok === undefined) ||
      (core.cacheWriteTokens > 0 && ctx.pricing.cacheWritePerMTok === undefined)
    ) {
      return { costUsd: null, costDetails: null, costProvenance: "unrecorded" };
    }
    const promptUsd =
      (uncachedTokens * ctx.pricing.inputPerMTok +
        core.cacheReadTokens * (ctx.pricing.cacheReadPerMTok ?? 0) +
        core.cacheWriteTokens * (ctx.pricing.cacheWritePerMTok ?? 0)) /
      TOKENS_PER_MTOK;
    const completionUsd = (core.tokensOut / TOKENS_PER_MTOK) * ctx.pricing.outputPerMTok;
    return {
      costUsd: promptUsd + completionUsd,
      costDetails: { totalUsd: promptUsd + completionUsd, promptUsd, completionUsd, pricing: ctx.pricing },
      costProvenance: "estimated",
    };
  }
  return { costUsd: null, costDetails: null, costProvenance: "unrecorded" };
}

function warningEvents(warnings: readonly ResolvedWarning[], at: number): ChatEvent[] {
  return warnings.map((warning) => ({ kind: "warning", at, ...warning }));
}

export function toChatResult(drain: StreamDrain, ctx: ResultContext): ChatResult {
  const core = {
    ...foldNestedUsage(drain.usage, {
      model: ctx.model,
      contextWindow: ctx.generation.context.window,
      maxOutputTokens: ctx.maxOutputTokens ?? ctx.generation.output.maxTokens.max,
    }),
    ...ctx.tokenUsage,
    servedModel: ctx.servedModel ?? drain.servedModel ?? null,
    tokenDetails: ctx.tokenDetails ?? null,
  };
  const raw = drain.finish.raw ?? drain.finish.unified;
  const toolCalls = drain.toolCalls.length > 0 ? drain.toolCalls : undefined;
  // The vendor's bag under OUR registry id, narrowed to the closed sidecar arm (`backends/kit/provider-metadata`).
  // Keyed on `ctx.providerId` ALONE — the old `?? providerMetadata["openrouter"]` fallback filed OpenRouter's bag
  // under whatever id the connection actually carried, which is the one thing a per-provider record may not do.
  // `measuredCostOf` keeps its own unconditional read of that key: a COST is the same number whoever routed it.
  const providerMetadata = variantProviderMetadataOf(ctx.providerId, drain.providerMetadata?.[ctx.providerId]);
  return {
    reply: drain.reply,
    ...(drain.textSignatures.length === 0 ? {} : { textSignatures: drain.textSignatures }),
    ...(toolCalls !== undefined ? { toolCalls } : {}),
    reasoning: drain.reasoning,
    ...(drain.reasoningParts.length > 0 ? { reasoningParts: drain.reasoningParts } : {}),
    // A REAL redacted block, never the old `no text but some reasoning tokens` heuristic: that shape is also
    // an adaptive model answering with its display off (MEASURED 2026-09-19 — direct opus-5, adaptive, no
    // `display`: 0 reasoning chars, 20 reasoning tokens, a signature present and nothing redacted).
    reasoningRedacted: drain.reasoningParts.some((part) => part.meta?.anthropic?.redactedData !== undefined),
    stopReason: raw,
    terminalReason: null,
    // Surfaced calls ARE the finish signal on every wire (a tool-calling turn may terminate `stop`).
    finishReason: toolCalls !== undefined ? "tool" : normalizeFinishReason(drain.finish.unified),
    ttftMs: ctx.firstDeltaAt !== undefined ? ctx.firstDeltaAt - ctx.startedAt : null,
    durationApiMs: ctx.now - ctx.startedAt,
    apiErrorStatus: null,
    numTurns: 1,
    generationId: ctx.generationId,
    appliedEffort: ctx.appliedEffort,
    usage: { ...core, ...costOf(core, ctx), ...(ctx.responseCache === undefined ? {} : { responseCache: ctx.responseCache }) },
    ...(providerMetadata !== undefined ? { providerMetadata } : {}),
    ...(drain.images.length > 0 ? { images: drain.images } : {}),
    events: warningEvents(ctx.warnings, ctx.now),
    rateLimit: ctx.rateLimit,
  };
}
