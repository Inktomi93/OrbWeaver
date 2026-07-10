// infra/providers/backends/agent-sdk/log — THE `provider.*` structured-log taxonomy for the agent-sdk
// backend. A thin tagged-`getLog()` sink mirroring `foundation/observability/memory-log` (the
// `memory: true` shape) and `securityEvent` (`security: true`): every call emits ONE pino line tagged
// `provider: true` + `backend: "agent-sdk"` + an `event` string, so the whole backend trail is greppable
// as `provider:true`, filterable per-backend, and per-event via `event`. The pino ring + `/api/_debug/logs`
// pick these up for free (the ringStream feeds them).
//
// The `backend` constant is carried on every line so the shape GENERALIZES to other backends later (an
// openrouter/vllm sink would emit the same taxonomy with its own `backend`) WITHOUT building that
// generalization now — this file is agent-sdk-family-local until a second backend needs it.
//
// DOCTRINE (Tier-2-Foundation esoteric #12): logs are METADATA — ids, counts, classifications, model
// names, timings, CLI runtime diagnostics. NEVER prompt / RP / system-prompt content on a log line. Every
// field below is metadata; the one string that carries subprocess output (`stderrTail`) is CLI runtime
// diagnostics (spawn/auth failures), bounded + truncated at the call site, never model-generated text.

import { getLog } from "#foundation/observability";
import type { ContextUsage, ProviderError } from "../../contract";
import type { SeededSessionDecision } from "./session";

/** This backend's tag on every taxonomy line (see the header — the seam that lets the shape generalize). */
const BACKEND = "agent-sdk";

/** The pino levels a `provider.*` event can ride — the axis declared once as a tuple (Spine §7.5),
 *  the type derived. `getLog()` returns a child bound to the request scope (requestId/userId) when
 *  inside one, else the base logger — so these lines correlate to their request. */
export const PROVIDER_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
type ProviderLogLevel = (typeof PROVIDER_LOG_LEVELS)[number];

/**
 * The taxonomy core: emit ONE tagged pino line. `event` is BOTH the greppable tag field and the log
 * message (the memory-log / securityEvent shape). Never throws — an observability call must not break the
 * turn that fired it (pino itself does not throw on the happy path; this stays a pure fire-and-forget).
 */
function providerLog(
  level: ProviderLogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  getLog()[level]({ provider: true, backend: BACKEND, event, ...fields }, event);
}

/** The per-turn usage sub-object on a `provider.turn` line — token/cost economics + the cold-start canary.
 *  All optional so a turn that never reached a result frame (an early throw) still logs a coherent line. */
export interface ProviderTurnUsage {
  readonly tokensIn?: number;
  readonly tokensOut?: number;
  readonly reasoningTokens?: number | null;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly costUsd?: number;
  readonly warmSpareClaimed?: boolean | null;
}

/** The one-line-per-turn anchor (`provider.turn`, info) — success OR failure. Carries the turn's identity
 *  (chat/session/model), the resume disposition, the terminal classification, timings, and the usage
 *  economics. This is the debug anchor an operator greps first. `undefined` fields are dropped by pino. */
export interface ProviderTurnLog {
  readonly chatId?: string;
  readonly sessionId?: string;
  /** The init frame's `apiKeySource` (oauth/user/… — the sub-vs-key canary). */
  readonly apiKeySource?: string;
  /** The model the request asked for. */
  readonly requestedModel: string;
  /** The model the init/result frame reported serving (drift shows as requested ≠ served). */
  readonly servedModel?: string;
  readonly disposition?: SeededSessionDecision["disposition"];
  readonly terminalReason?: string | null;
  readonly durationMs?: number;
  readonly ttftMs?: number | null;
  readonly ok: boolean;
  readonly usage?: ProviderTurnUsage;
  /** The post-turn context-window fill (agent-sdk `getContextUsage()`), when the best-effort probe
   *  returned. Absent otherwise (probe failure/timeout / no control channel). */
  readonly contextUsage?: ContextUsage;
}

/** ONE line per completed turn (success or failure) — the debug anchor. */
export function logProviderTurn(entry: ProviderTurnLog): void {
  providerLog("info", "provider.turn", { ...entry });
}

/** The session-decision line (`provider.session`, debug) — emitted only when the decision was NOT a plain
 *  resume (cold-seed / reseed-in-place / re-adopt / fresh-fallback), so the hot path stays quiet. */
export function logProviderSession(entry: {
  readonly chatId: string;
  readonly sessionId: string | null;
  readonly disposition: SeededSessionDecision["disposition"];
}): void {
  providerLog("debug", "provider.session", { ...entry });
}

/** A classified `ProviderError` (`provider.error`, error) via its full provenance (`toLog()`). On a
 *  spawn/CLI death (kind server/unknown) the runner attaches a bounded `stderrTail` (CLI diagnostics). */
export function logProviderError(
  err: ProviderError,
  extra?: { readonly stderrTail?: string },
): void {
  providerLog("error", "provider.error", {
    ...err.toLog(),
    ...(extra?.stderrTail !== undefined ? { stderrTail: extra.stderrTail } : {}),
  });
}

/** A rate-limit snapshot (`provider.rate_limit`) — warn when overage is in play or the window is exhausted
 *  (the ban-risk canary), debug when healthy. Carries the snapshot fields (all metadata). */
export function logProviderRateLimit(banRisk: boolean, fields: Record<string, unknown>): void {
  providerLog(banRisk ? "warn" : "debug", "provider.rate_limit", fields);
}

/** An api-retry (`provider.retry`, warn) — the runtime backed off + retried; carries the attempt fields +
 *  the classified kind so a retry storm is greppable by classification. */
export function logProviderRetry(fields: Record<string, unknown>): void {
  providerLog("warn", "provider.retry", fields);
}

/** Model drift (`provider.drift`, warn) — the served/billed model differs from the requested one (overage
 *  / rate-limit fallback). Emitted from the result-frame billed-model check. */
export function logProviderDrift(entry: {
  readonly requested: string;
  readonly billed: readonly string[];
}): void {
  providerLog("warn", "provider.drift", { ...entry });
}

/** A safety-classifier refusal (`provider.refusal`, warn) — the category + whether a fallback retried.
 *  NEVER the refusal banner text (RP-adjacent content stays off logs). */
export function logProviderRefusal(entry: {
  readonly category: string | null;
  readonly retried: boolean;
}): void {
  providerLog("warn", "provider.refusal", { ...entry });
}

/** A firewall breach (`provider.leak`, error) — a tool leaked past the locked tool-less config. Only the
 *  tool NAMES ride the line (never the tool_input, which could carry content). */
export function logProviderLeak(entry: {
  readonly model: string;
  readonly toolNames: readonly string[];
}): void {
  providerLog("error", "provider.leak", { ...entry });
}

/** A compaction outcome (`provider.compaction`, warn) — emitted when the runtime's context compaction
 *  FAILED (the healthy compact-boundary stays on the existing info line). */
export function logProviderCompaction(fields: Record<string, unknown>): void {
  providerLog("warn", "provider.compaction", fields);
}

/** An interactive-dialog fail-close (`provider.dialog`, warn) — the SDK asked the host to answer an MCP
 *  elicitation or a `request_user_dialog`, and the non-interactive agent turn DECLINED it deterministically
 *  (there is no human on this turn). `kind` is the elicitation mode / dialogKind — a METADATA classifier
 *  ONLY; the dialog `message`/`payload` (which can carry model- or tool-derived content) NEVER rides the
 *  line. Warn because a fired dialog means a tool wanted input the turn structurally cannot provide — an
 *  ops signal worth seeing. `source` distinguishes the two SDK channels (elicitation vs user-dialog). */
export function logProviderDialog(entry: {
  readonly source: "elicitation" | "user-dialog";
  readonly kind: string;
}): void {
  providerLog("warn", "provider.dialog", { ...entry });
}

/** A summarize-batch outcome (`provider.summarize`, info) — ONE line per batch. METADATA only: the input
 *  count, the ok/fail split, and the wall duration. NEVER the prompt/summary text (RP-adjacent content stays
 *  off logs). `fail > 0` means the batch rejected on an item failure (whole-batch semantics). */
export function logProviderSummarize(entry: {
  readonly items: number;
  readonly ok: number;
  readonly fail: number;
  readonly durationMs: number;
}): void {
  providerLog("info", "provider.summarize", { ...entry });
}

/** An MCP-server health snapshot (`provider.mcp`) — warn when a configured server is NOT healthy
 *  (`failed`/`needs-auth`/`disabled`/`pending`: the agent turn may be running with its tools silently
 *  absent), debug when every server is `connected`. Carries server NAME + status + the (bounded) error
 *  string the SDK surfaces on a failed server (CLI runtime diagnostics, never model/tool content). */
export interface ProviderMcpServerHealth {
  readonly name: string;
  readonly status: string;
  readonly error?: string | undefined;
}
export function logProviderMcp(entry: {
  readonly unhealthy: boolean;
  readonly servers: readonly ProviderMcpServerHealth[];
}): void {
  providerLog(entry.unhealthy ? "warn" : "debug", "provider.mcp", { ...entry });
}
