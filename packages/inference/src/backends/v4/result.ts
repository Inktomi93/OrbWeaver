// The drained V4 stream → the ONE `ChatResult` record every wire speaks (§8.4-7): the normalized usage core
// (`foldNestedUsage`), the finish-reason fold through the shared `FINISH_REASON_MAP`, the cost with its
// PROVENANCE (`measured` when the wire reported a figure, `estimated` from the row's pricing × tokens,
// `unrecorded` otherwise — §5.3c), and the wire-opaque metadata keyed by provider id.

import type { SharedV4ProviderMetadata, SharedV4Warning } from "@ai-sdk/provider";
import type { AdjustedKnob } from "@orb/contracts/chat";
import { ADJUSTED_KNOBS } from "@orb/contracts/chat";
import type { ChatUsage, EndpointFeatures, GenerationCapability } from "@orb/contracts/inference";
import { foldNestedUsage } from "@orb/contracts/inference";
import type { ModelId } from "@orb/kit/ids";
import type { ChatResult } from "../../contract/chat.ts";
import { normalizeFinishReason } from "../../contract/chat.ts";
import type { ChatEvent } from "../../contract/events.ts";
import type { ResolvedSampling, ResolvedWarning } from "../../contract/resolve.ts";
import type { StreamDrain } from "./stream.ts";

const TOKENS_PER_MTOK = 1_000_000;
const OPENROUTER_KEY = "openrouter";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The wire-reported cost off the SDK's provider metadata — OpenRouter's usage accounting today; `null` on
 *  every transport that reports none (the `estimated`/`unrecorded` arms follow). */
export function measuredCostOf(providerMetadata: SharedV4ProviderMetadata | undefined): number | null {
  const usage = providerMetadata?.[OPENROUTER_KEY]?.["usage"];
  const cost = isRecord(usage) ? usage["cost"] : undefined;
  return typeof cost === "number" ? cost : null;
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
  readonly model: ModelId;
  readonly providerId: string;
  readonly generation: GenerationCapability;
  readonly maxOutputTokens: number | undefined;
  readonly startedAt: number;
  readonly firstDeltaAt: number | undefined;
  readonly now: number;
  /** The wire-reported cost in USD, when the transport read one (OpenRouter's usage accounting). */
  readonly measuredCostUsd: number | null;
  /** The row's shipped pricing — the `estimated` arm when nothing was measured. */
  readonly pricing: EndpointFeatures["pricing"];
  readonly generationId: string | null;
  readonly warnings: readonly ResolvedWarning[];
}

function costOf(
  core: Omit<ChatUsage, "costUsd" | "costDetails" | "costProvenance">,
  ctx: ResultContext,
): Pick<ChatUsage, "costUsd" | "costDetails" | "costProvenance"> {
  if (ctx.measuredCostUsd !== null) {
    return { costUsd: ctx.measuredCostUsd, costDetails: null, costProvenance: "measured" };
  }
  if (ctx.pricing !== undefined && core.tokensIn !== null && core.tokensOut !== null) {
    const promptUsd = (core.tokensIn / TOKENS_PER_MTOK) * ctx.pricing.inputPerMTok;
    const completionUsd = (core.tokensOut / TOKENS_PER_MTOK) * ctx.pricing.outputPerMTok;
    return { costUsd: promptUsd + completionUsd, costDetails: { totalUsd: promptUsd + completionUsd, promptUsd, completionUsd }, costProvenance: "estimated" };
  }
  return { costUsd: null, costDetails: null, costProvenance: "unrecorded" };
}

function warningEvents(warnings: readonly ResolvedWarning[], at: number): ChatEvent[] {
  return warnings.map((warning) => ({ kind: "warning", at, ...warning }));
}

export function toChatResult(drain: StreamDrain, ctx: ResultContext): ChatResult {
  const core = foldNestedUsage(drain.usage, {
    model: ctx.model,
    contextWindow: ctx.generation.context.window,
    maxOutputTokens: ctx.maxOutputTokens ?? ctx.generation.output.maxTokens.max,
  });
  const raw = drain.finish.raw ?? drain.finish.unified;
  const toolCalls = drain.toolCalls.length > 0 ? drain.toolCalls : undefined;
  const metadata = drain.providerMetadata?.[ctx.providerId] ?? drain.providerMetadata?.["openrouter"];
  return {
    reply: drain.reply,
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
    finishReason: toolCalls !== undefined ? "tool" : normalizeFinishReason(raw),
    ttftMs: ctx.firstDeltaAt !== undefined ? ctx.firstDeltaAt - ctx.startedAt : null,
    durationApiMs: ctx.now - ctx.startedAt,
    apiErrorStatus: null,
    numTurns: 1,
    generationId: ctx.generationId,
    usage: { ...core, ...costOf(core, ctx) },
    ...(metadata !== undefined ? { providerMetadata: { [ctx.providerId]: metadata } } : {}),
    ...(drain.images.length > 0 ? { images: drain.images } : {}),
    events: warningEvents(ctx.warnings, ctx.now),
    rateLimit: null,
  };
}
