// The drained V4 stream → the ONE `ChatResult` record every wire speaks (§8.4-7): the normalized usage core
// (`foldNestedUsage`), the finish-reason fold through the shared `FINISH_REASON_MAP`, the cost with its
// PROVENANCE (`measured` when the wire reported a figure, `estimated` from the row's pricing × tokens,
// `unrecorded` otherwise — §5.3c), and the wire-opaque metadata keyed by provider id.

import type { SharedV4ProviderMetadata } from "@ai-sdk/provider";
import type { ChatUsage, EndpointFeatures, GenerationCapability } from "@orb/contracts/inference";
import { foldNestedUsage } from "@orb/contracts/inference";
import type { ModelId } from "@orb/kit/ids";
import type { ChatResult } from "../../contract/chat.ts";
import { normalizeFinishReason } from "../../contract/chat.ts";
import type { ChatEvent } from "../../contract/events.ts";
import type { ResolvedWarning } from "../../contract/resolve.ts";
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
    reasoningRedacted: drain.reasoning.length === 0 && (core.reasoningTokens ?? 0) > 0,
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
