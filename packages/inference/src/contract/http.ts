import type { WireSchemaMode } from "@orb/contracts/inference";
import type { AddSpanEvent, ConnectionTransport, ProviderErrorKind, ProviderScrubSet, ScheduleTimeout } from "#contract";

/** A caller signal flattened onto a signal we own — hand `signal` to the provider call, `dispose()` on
 *  settle so a long-lived caller signal doesn't accumulate listeners across calls. */
export interface FlattenedAbort {
  /** OUR signal. Fires when the external one does; its `reason` is always a plain `AbortError`. */
  readonly signal: AbortSignal;
  /** Detach from the external signal (idempotent, safe after abort). */
  readonly dispose: () => void;
}

/** A classified failure — the typed kind + whether a retry could plausibly succeed. */
export interface ErrorClassification {
  readonly kind: ProviderErrorKind;
  readonly retryable: boolean;
}

/** Structured diagnostic peeled off an HTTP-error chain — safe to put on a log record (sanitized). */
export interface HttpErrorDiagnostic {
  /** Raw upstream response body, sanitized + length-capped. Absent when the chain carries no `body`. */
  readonly body?: string;
  /** Summary of the immediate `.cause` (typically the SDK's zod parse failure), sanitized. */
  readonly cause?: string;
}

/** What a structured call's failure says about its schema, for {@link withSchemaRejection}. */
export interface SchemaRejectionContext {
  readonly log: ProviderLogger;
  readonly model: string;
  readonly mode: WireSchemaMode;
  readonly secrets: ProviderScrubSet;
}

export interface FetchJsonArgs {
  readonly fetch: typeof fetch;
  readonly url: string;
  readonly method?: "GET" | "POST" | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly body?: unknown;
  readonly signal?: AbortSignal | undefined;
  /** The literals to scrub from any error text (the bearer, secret-valued headers, key-in-body values). */
  readonly secrets: ProviderScrubSet;
  /** Names the call in error messages (`openrouter credits`, `endpoint models`). */
  readonly label: string;
}

export interface FetchJsonResult {
  readonly status: number;
  readonly headers: Headers;
  readonly json: unknown;
}

/** The composed idle-abort handle a runner threads through its stream loop. */
export interface IdleAbort {
  /** The composed signal — fires on either the caller's cancel or an idle stall. Pass to `fetch`. */
  readonly signal: AbortSignal;
  /** Call on each received chunk/delta to restart the idle window. */
  readonly reset: () => void;
  /** Call once the turn settles to clear the timer (no dangling timer on a settled turn). */
  readonly dispose: () => void;
}

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

export interface ProviderLogger {
  readonly emit: (level: ProviderLogLevel, event: string, fields?: Readonly<Record<string, unknown>>) => void;
  readonly cache: (entry: ProviderCacheLog) => void;
  readonly sampling: (entry: ProviderSamplingLog) => void;
  readonly capability: (entry: ProviderCapabilityLog) => void;
  readonly summarizeItem: (entry: ProviderSummarizeItemLog) => void;
}

// RNG midpoint (random() in [0,1) → jitter in [0.8, 1.2))

/** Tuning + injected seams for the retry policy. */
export interface RetryOptions {
  readonly scheduleTimeout: ScheduleTimeout;
  /** Total tries including the first. */
  readonly maxAttempts?: number;
  /** First backoff sleep (ms). */
  readonly baseMs?: number;
  /** Cap on any single backoff sleep (ms). */
  readonly maxMs?: number;
  /** Caller-cancel that interrupts the backoff sleep (so Stop during a rate-limit wait is prompt). */
  readonly signal?: AbortSignal;
  /** Injected jitter RNG in `[0, 1)` — deterministic in tests. */
  readonly random: () => number;
  /** The request span's event sink (`provider.retry` / `provider.retry.abandoned`); absent ⇒ no-op. */
  readonly addSpanEvent?: AddSpanEvent;
  /** Injected clock (epoch-ms) for the `resetsAt`-proximity shortcut. Omit to skip it (pure backoff). */
  readonly now?: () => number;
}

/** The credential-bearing half of a resolved connection the scrub reads — the shape `Resolved` carries and
 *  the "Test endpoint" inspector holds before a row is even saved. */
export interface ScrubSource {
  readonly credential: { readonly secret: string | null };
  readonly transport: ConnectionTransport | null;
}

/** One turn's cache placement, as the two hosted wires already count it for their own receipts. */
export interface TurnCacheSpan {
  readonly breakpointsPlaced: number;
  readonly readTokens: number | null;
  readonly writeTokens: number | null;
}

export interface ProviderCapabilityDrop {
  readonly code: string;
  readonly message: string;
}

/** The cache-rot signal: a collapsed hitRatio with a spiked cacheWriteTokens is the re-bill, in one grep. */
export interface ProviderCacheLog {
  readonly turnId: string;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
  readonly breakpointsPlaced: number;
  readonly breakpointOffsets: readonly number[];
  readonly hitRatio: number | null;
  readonly minCacheTokens: number;
}

/** Which sampling knobs survived the funnel: requested vs applied vs dropped-with-reason. */
export interface ProviderSamplingLog {
  readonly turnId: string;
  readonly requested: Record<string, unknown>;
  readonly applied: Record<string, unknown>;
  readonly dropped: readonly ProviderSamplingDrop[];
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

export type ProviderLogLevel = (typeof PROVIDER_LOG_LEVELS)[number];

export interface ProviderSamplingDrop {
  readonly knob: string;
  readonly reason: string;
}

export const PROVIDER_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
