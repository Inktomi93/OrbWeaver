// infra/providers/backends/kit/provider-log — THE shared `provider.*` structured-log sink (hoisted from
// `backends/agent-sdk/log.ts`, part 05 §2). A thin tagged-`getLog()` core mirroring
// `foundation/observability/memory-log` (the `memory: true` shape) and `securityEvent` (`security: true`):
// every call emits ONE pino line tagged `provider: true` + a per-call `backend` + an `event` string, so the
// whole provider trail is greppable as `provider:true`, filterable per-backend, and per-event via `event`.
// The pino ring + `/api/_debug/logs` pick these up for free (the ringStream feeds them).
//
// `backend` is now a per-CALL argument (was an agent-sdk-local constant) so the openrouter + anth-direct
// backends emit the SAME taxonomy with their own tag — the second-backend hoist the agent-sdk log header
// always anticipated. This module is infra-pure (imports only `#foundation/observability` DOWN); it holds
// NO backend-specific event wrappers — those stay in each backend's own `log.ts`, calling this core.
//
// DOCTRINE (Tier-2-Foundation esoteric #12): logs are METADATA — ids, counts, classifications, model
// names, timings. NEVER prompt / RP / system-prompt content on a `provider.*` line; every field is metadata.

import type { ChatApi } from "@orb/contracts/connection";
import type { CredentialSource } from "@orb/contracts/credentials";
import { getLog } from "#foundation/observability";

/** The pino levels a `provider.*` event can ride — the axis declared once as a tuple (Spine §7.5), the type
 *  derived. `getLog()` returns a child bound to the request scope (requestId/userId) when inside one, else
 *  the base logger — so these lines correlate to their request. */
export const PROVIDER_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
type ProviderLogLevel = (typeof PROVIDER_LOG_LEVELS)[number];

/**
 * The taxonomy core: emit ONE tagged pino line. `event` is BOTH the greppable tag field and the log message
 * (the memory-log / securityEvent shape). `backend` tags which backend fired it. Never throws — an
 * observability call must not break the turn that fired it (pino itself does not throw on the happy path;
 * this stays a pure fire-and-forget).
 */
export function providerLog(
  backend: string,
  level: ProviderLogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  getLog()[level]({ provider: true, backend, event, ...fields }, event);
}

/** The per-turn usage sub-object on a `provider.turn` line — token/cost economics + the cold-start canary.
 *  All optional so a turn that never reached a result frame (an early throw) still logs a coherent line.
 *  Shared across every backend that emits `provider.turn` (agent-sdk, openrouter, anth-direct). */
export interface ProviderTurnUsage {
  readonly tokensIn?: number;
  readonly tokensOut?: number;
  readonly reasoningTokens?: number | null;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly costUsd?: number;
  readonly warmSpareClaimed?: boolean | null;
}

/** The `provider.cache` receipt fields (part 05 §3a) — THE cache-rot signal. A collapsed `hitRatio` with a
 *  spiked `cacheWriteTokens` IS the ~12.7k-token re-bill, visible in one grep. Metadata only. Shared so the
 *  openrouter + anth-direct runners emit the identical shape from their own wire dialects. */
export interface ProviderCacheLog {
  /** the per-turn correlation id (part 05 §4) — isolates this turn's cache→channel→sampling→capability
   *  chain within a busy request; ADDITIVE to the existing `requestId` correlation. Read off the same
   *  `ResolvedChatKnobs` every provider.* emit site already has. */
  readonly turnId: string;
  /** tokens served from cache this turn. */
  readonly cacheReadTokens: number;
  /** tokens billed to WRITE the cache this turn. */
  readonly cacheWriteTokens: number;
  /** the kit placer's returned breakpoint count — 3 (system + the R1 pair) when healthy. */
  readonly breakpointsPlaced: number;
  /** the placer's returned offsets-from-end (the PAIR positions) — for drift diagnosis. */
  readonly breakpointOffsets: readonly number[];
  /** `cacheReadTokens / (cacheReadTokens + cacheWriteTokens)`, 0 when both 0 — the rot canary. */
  readonly hitRatio: number;
  /** the resolved per-model `turns.cacheMinTokens` that gated placement. */
  readonly minCacheTokens: number;
}

/** Emit the per-turn `provider.cache` receipt (`info` — visible by default). One DECOUPLED emitter: it reads
 *  RESOLVED facts (usage counts + the placer's returned offsets + the resolved floor) and writes them — NO
 *  model-id / wire branch at the emit site (part 05 §1 decoupling rule). `hitRatio` is derived here so every
 *  backend reports the identical canary. */
export function logProviderCache(backend: string, entry: ProviderCacheLog): void {
  providerLog(backend, "info", "provider.cache", { ...entry });
}

/** One knob the funnel dropped: the wire name + the descriptor-range reason (a `sampling_knob_dropped`
 *  message, or the wire-specific verbosity drop). Metadata only. */
export interface ProviderSamplingDrop {
  readonly knob: string;
  readonly reason: string;
}

/** The `provider.sampling` fields (part 05 §3d) — which sampling knobs survived the funnel: what the user
 *  REQUESTED, what was APPLIED to the wire (the `ResolvedSampling` fields + verbosity), and what was DROPPED
 *  with the reason. Makes a silently-dropped knob GREPPABLE (`provider:true event:provider.sampling`), not
 *  invisible. Values are user-authored generation settings (not secrets / RP content) — allowed (part 05 §5).
 *  Shared so the OR chat-completions + responses runners emit the identical shape. */
export interface ProviderSamplingLog {
  /** the per-turn correlation id (part 05 §4) — same purpose as {@link ProviderCacheLog.turnId}. */
  readonly turnId: string;
  /** the sampling knobs the user set going in (raw `UserIntent` values, pre-gate). */
  readonly requested: Record<string, unknown>;
  /** the knobs that reached the wire (the funnel's `ResolvedSampling` + a resolved verbosity). */
  readonly applied: Record<string, unknown>;
  /** the funnel's dropped-knob set with the descriptor-range reason. */
  readonly dropped: readonly ProviderSamplingDrop[];
}

/** Emit the per-turn `provider.sampling` receipt (`debug` — opt-in by dropping `logLevel` to `debug`). One
 *  DECOUPLED emitter (part 05 §1): the caller reads the RESOLVED facts (requested intent × applied
 *  `ResolvedSampling` × the funnel's dropped warnings) — no model-id / wire branch here. On a post-Opus-4.6
 *  `anthropic-direct` model this is where an all-dropped `{}` resolution shows as "every knob dropped,
 *  model-deprecated" (part 03 §3) — no 400, reason on record. */
export function logProviderSampling(backend: string, entry: ProviderSamplingLog): void {
  providerLog(backend, "debug", "provider.sampling", {
    turnId: entry.turnId,
    requested: entry.requested,
    applied: entry.applied,
    dropped: [...entry.dropped],
  });
}

/** One funnel-dropped warning, folded onto `provider.capability` (part 05 §3c): the machine-dispatchable
 *  `code` (`WarningCode`) + the human `message` — the SAME `ResolvedWarning[]` already surfaced as
 *  `ChatEvent`s, now ALSO on a log line so a drop is greppable after the fact. */
export interface ProviderCapabilityDrop {
  readonly code: string;
  readonly message: string;
}

/** The `provider.capability` resolution line (part 05 §3c) — the `(model × wire-shape)` cell the funnel
 *  resolved, plus every dropped/ignored knob. NO `wireShape` string is materialized here (that stays
 *  resolver-internal, domain-only — the anti-ST bar): `api` + `credentialSource` are REPORT-ONLY fields
 *  that are together information-equivalent to `deriveWireShape(api, source)` (a pure fn of the two,
 *  domain-side), the SAME vocab `provider.turn` already reports (part 05 §3e) — reporting the inputs is
 *  not re-deriving or branching on them. `turns` is the resolved capability cell. Metadata only — model
 *  ids/flags/warning codes, never prompt content. */
export interface ProviderCapabilityLog {
  /** the per-turn correlation id (part 05 §4) — same purpose as {@link ProviderCacheLog.turnId}. */
  readonly turnId: string;
  /** the protocol axis (`agent-sdk` / `chat-completions` / `responses` / `anthropic-messages`) — REPORT-
   *  ONLY, read off the request the runner already holds; never branched on at the emit site. */
  readonly api: ChatApi;
  /** the provider-source axis (the sub-vs-key canary) — REPORT-ONLY, same vocab `provider.turn` already
   *  carries as `credentialSource` (part 05 §3e). */
  readonly credentialSource: CredentialSource;
  /** the model id the caller requested. */
  readonly requestedModel: string;
  /** the model id actually served, when it differs from `requestedModel` (a fallback/alias resolution). */
  readonly servedModel?: string;
  /** the resolved `(model × wire-shape)` turns cell — the capability flags that gated this turn. */
  readonly turns: Record<string, unknown>;
  /** every funnel drop for this turn (`sampling_knob_dropped`, `effort_dropped`, `display_dropped`,
   *  `adaptive_budget_dropped`, `verbosity_dropped`, `dynamic_context_demoted`). */
  readonly droppedWarnings: readonly ProviderCapabilityDrop[];
}

/** Emit the per-turn `provider.capability` resolution line (`debug` — opt-in). One DECOUPLED emitter
 *  (part 05 §1): every field is a RESOLVED/REPORTED fact the caller already has (`api`/`credentialSource`
 *  off the request, the resolved turns cell, the funnel's warnings) — no model-id / wire branch here. */
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
