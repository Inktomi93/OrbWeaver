// The shared provider.* structured-log sink. Every call emits ONE pino line tagged provider:true plus a
// per-call backend + event string, so the whole provider trail is greppable/filterable. Logs are metadata
// only — never prompt/RP/system-prompt content on a provider.* line.

import type { ChatApi } from "@orb/contracts/connection";
import type { CredentialSource } from "@orb/contracts/credentials";
import { getLog } from "#foundation/observability";

export const PROVIDER_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
type ProviderLogLevel = (typeof PROVIDER_LOG_LEVELS)[number];

export function providerLog(
  backend: string,
  level: ProviderLogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  getLog()[level]({ provider: true, backend, event, ...fields }, event);
}

/** Per-turn usage sub-object on a provider.turn line. All optional so a turn that never reached a result frame still logs a coherent line. */
export interface ProviderTurnUsage {
  readonly tokensIn?: number;
  readonly tokensOut?: number;
  readonly reasoningTokens?: number | null;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly costUsd?: number;
  readonly warmSpareClaimed?: boolean | null;
}

// The cache-rot signal: a collapsed hitRatio with a spiked cacheWriteTokens is the re-bill, visible in one grep.
export interface ProviderCacheLog {
  readonly turnId: string;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly breakpointsPlaced: number;
  readonly breakpointOffsets: readonly number[];
  readonly hitRatio: number;
  readonly minCacheTokens: number;
}

export function logProviderCache(backend: string, entry: ProviderCacheLog): void {
  providerLog(backend, "info", "provider.cache", { ...entry });
}

export interface ProviderSamplingDrop {
  readonly knob: string;
  readonly reason: string;
}

// Which sampling knobs survived the funnel: requested vs applied vs dropped-with-reason.
export interface ProviderSamplingLog {
  readonly turnId: string;
  readonly requested: Record<string, unknown>;
  readonly applied: Record<string, unknown>;
  readonly dropped: readonly ProviderSamplingDrop[];
}

export function logProviderSampling(backend: string, entry: ProviderSamplingLog): void {
  providerLog(backend, "debug", "provider.sampling", {
    turnId: entry.turnId,
    requested: entry.requested,
    applied: entry.applied,
    dropped: [...entry.dropped],
  });
}

export interface ProviderCapabilityDrop {
  readonly code: string;
  readonly message: string;
}

// The (model x wire-shape) cell the funnel resolved, plus every dropped/ignored knob. api/credentialSource
// are report-only — never re-derived or branched on at the emit site.
export interface ProviderCapabilityLog {
  readonly turnId: string;
  readonly api: ChatApi;
  readonly credentialSource: CredentialSource;
  readonly requestedModel: string;
  readonly servedModel?: string;
  readonly turns: Record<string, unknown>;
  readonly droppedWarnings: readonly ProviderCapabilityDrop[];
}

export function logProviderCapability(backend: string, entry: ProviderCapabilityLog): void {
  providerLog(backend, "debug", "provider.capability", {
    turnId: entry.turnId,
    api: entry.api,
    credentialSource: entry.credentialSource,
    requestedModel: entry.requestedModel,
    ...(entry.servedModel !== undefined ? { servedModel: entry.servedModel } : {}),
    turns: entry.turns,
    droppedWarnings: [...entry.droppedWarnings],
  });
}
