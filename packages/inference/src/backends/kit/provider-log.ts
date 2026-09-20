// The shared `provider.*` structured-log sink. Every call emits ONE line tagged `provider: true` plus a
// per-call wire/provider + event string, so the whole provider trail is greppable. Logs are metadata only —
// never prompt/RP/system-prompt content. A FACTORY over the injected `InferenceLog` (no `getLog()` global:
// the package never imports the server's logger).

import type { InferenceLog } from "../../deps.ts";

export const PROVIDER_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type ProviderLogLevel = (typeof PROVIDER_LOG_LEVELS)[number];

/** Per-turn usage sub-object on a `provider.turn` line. All optional so a turn that never reached a result
 *  frame still logs a coherent line. */
export interface ProviderTurnUsage {
  readonly tokensIn?: number;
  readonly tokensOut?: number;
  readonly reasoningTokens?: number | null;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly costUsd?: number;
}

/** The cache-rot signal: a collapsed hitRatio with a spiked cacheWriteTokens is the re-bill, in one grep. */
export interface ProviderCacheLog {
  readonly turnId: string;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly breakpointsPlaced: number;
  readonly breakpointOffsets: readonly number[];
  readonly hitRatio: number;
  readonly minCacheTokens: number;
}

export interface ProviderSamplingDrop {
  readonly knob: string;
  readonly reason: string;
}

/** Which sampling knobs survived the funnel: requested vs applied vs dropped-with-reason. */
export interface ProviderSamplingLog {
  readonly turnId: string;
  readonly requested: Record<string, unknown>;
  readonly applied: Record<string, unknown>;
  readonly dropped: readonly ProviderSamplingDrop[];
}

export interface ProviderCapabilityDrop {
  readonly code: string;
  readonly message: string;
}

/** The (model × wire-shape) cell the funnel resolved, plus every dropped/ignored knob. Report-only. */
export interface ProviderCapabilityLog {
  readonly turnId: string;
  readonly api: string | null;
  readonly providerId: string;
  readonly requestedModel: string;
  readonly servedModel?: string;
  readonly turns: Record<string, unknown>;
  readonly droppedWarnings: readonly ProviderCapabilityDrop[];
}

/** The per-ITEM batch turn for the `summarize` + `structured` tasks, TAGGED BY task (owner ruling
 *  2026-07-27) so a diagnosis of an rpg extraction never greps "summarize". Metadata only. */
export interface ProviderSummarizeItemLog {
  readonly task: "summarize" | "structured";
  readonly model: string;
  readonly index: number;
  readonly durationMs: number;
  readonly ok: boolean;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly finishReason: string | null;
  readonly hasResponseFormat: boolean;
  /** Present only on a failed item — the classified error kind (never the message/body). */
  readonly errorKind?: string;
}

export interface ProviderLogger {
  readonly emit: (level: ProviderLogLevel, event: string, fields?: Readonly<Record<string, unknown>>) => void;
  readonly cache: (entry: ProviderCacheLog) => void;
  readonly sampling: (entry: ProviderSamplingLog) => void;
  readonly capability: (entry: ProviderCapabilityLog) => void;
  readonly summarizeItem: (entry: ProviderSummarizeItemLog) => void;
}

/** Bind the sink to one wire/provider pair — every line the backend emits carries both. */
export function providerLogger(log: InferenceLog, wire: string, providerId: string): ProviderLogger {
  const emit: ProviderLogger["emit"] = (level, event, fields = {}) => {
    log[level]({ provider: true, wire, providerId, event, ...fields }, event);
  };
  return {
    emit,
    cache: (entry) => emit("info", "provider.cache", { ...entry }),
    sampling: (entry) =>
      emit("debug", "provider.sampling", { turnId: entry.turnId, requested: entry.requested, applied: entry.applied, dropped: [...entry.dropped] }),
    capability: (entry) =>
      emit("debug", "provider.capability", {
        turnId: entry.turnId,
        api: entry.api,
        providerId: entry.providerId,
        requestedModel: entry.requestedModel,
        ...(entry.servedModel !== undefined ? { servedModel: entry.servedModel } : {}),
        turns: entry.turns,
        droppedWarnings: [...entry.droppedWarnings],
      }),
    summarizeItem: (entry) =>
      // The event name carries the task so a grep filters cleanly: `provider.summarize-item` vs `provider.structured-item`.
      emit(entry.ok ? "info" : "warn", `provider.${entry.task}-item`, {
        task: entry.task,
        model: entry.model,
        index: entry.index,
        durationMs: entry.durationMs,
        ok: entry.ok,
        tokensIn: entry.tokensIn,
        tokensOut: entry.tokensOut,
        finishReason: entry.finishReason,
        hasResponseFormat: entry.hasResponseFormat,
        ...(entry.errorKind !== undefined ? { errorKind: entry.errorKind } : {}),
      }),
  };
}
