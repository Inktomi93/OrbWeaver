// agent-sdk `provider.*` event wrappers over the shared kit sink (`providerLog`). Doctrine: logs are
// METADATA only — never prompt/RP/system-prompt content (Tier-2-Foundation esoteric #12).

import type { ChatId } from "@orb/kit/ids";
import type { ProviderCapabilityLog, ProviderTurnUsage } from "@orb/server/infra/providers/backends/kit";
import { logProviderCapability as kitLogProviderCapability, providerLog } from "@orb/server/infra/providers/backends/kit";
import type { ContextUsage, DynamicContextChannel, ProviderError } from "../../contract/index.ts";
import type { SeededSessionDecision } from "./session/index.ts";

export type { ProviderTurnUsage } from "@orb/server/infra/providers/backends/kit";

/** This backend's tag on every taxonomy line, passed to the shared kit sink per-call. */
const BACKEND = "agent-sdk";

/** One-line-per-turn anchor (`provider.turn`, info) — success or failure. */
export interface ProviderTurnLog {
  readonly turnId?: string;
  readonly chatId?: ChatId;
  // @foreign-id-ok(sessionId): the Claude Agent SDK's OWN chat-session id (its `session_id` wire field) — a NAME COLLISION with our BFF `SessionId = TypeIdOf<"session">`, a different wire's id that merely shares the spelling. Ends if this position ever carries one of our session rows, or if the field is renamed `sdkSessionId` (which would dissolve this marker).
  readonly sessionId?: string;
  readonly apiKeySource?: string;
  readonly requestedModel: string;
  /** Model the init/result frame reported serving (drift ⇒ requested ≠ served). */
  readonly servedModel?: string;
  readonly disposition?: SeededSessionDecision["disposition"];
  readonly terminalReason?: string | null;
  /** How many MODEL CALLS the agentic loop made for this ONE turn (the SDK's `num_turns`) — the DENOMINATOR
   *  for `usage.tokensOut`, which is the SUM over those calls (`accumulateUsage`), NOT one completion. A
   *  live `ok:false` line read `tokensOut:8192` against a 2048 per-call cap and was filed as a cost bug on
   *  that arithmetic alone (docs/design/streaming-shape-churn.md §7.5); the count is what makes the line
   *  self-interpreting. Rides on BOTH the success and the failure line. */
  readonly numTurns?: number;
  readonly durationMs?: number;
  readonly ttftMs?: number | null;
  readonly ok: boolean;
  readonly usage?: ProviderTurnUsage;
  readonly contextUsage?: ContextUsage;
}

export function logProviderTurn(entry: ProviderTurnLog): void {
  providerLog(BACKEND, "info", "provider.turn", { ...entry });
}

/** `provider.session` (debug) — only when the decision was NOT a plain resume. */
export function logProviderSession(entry: {
  readonly chatId: ChatId;
  // @foreign-id-ok(sessionId): the Claude Agent SDK's OWN chat-session id (its `session_id` wire field) — a NAME COLLISION with our BFF `SessionId = TypeIdOf<"session">`, a different wire's id that merely shares the spelling. Ends if this position ever carries one of our session rows, or if the field is renamed `sdkSessionId` (which would dissolve this marker).
  readonly sessionId: string | null;
  readonly disposition: SeededSessionDecision["disposition"];
}): void {
  providerLog(BACKEND, "debug", "provider.session", { ...entry });
}

/** `provider.error` via `toLog()`; on spawn/CLI death the runner attaches a bounded `stderrTail`. */
export function logProviderError(err: ProviderError, extra?: { readonly stderrTail?: string }): void {
  providerLog(BACKEND, "error", "provider.error", {
    ...err.toLog(),
    ...(extra?.stderrTail !== undefined ? { stderrTail: extra.stderrTail } : {}),
  });
}

/** `provider.rate_limit` — warn on ban-risk overage/exhaustion, debug when healthy. */
export function logProviderRateLimit(banRisk: boolean, fields: Record<string, unknown>): void {
  providerLog(BACKEND, banRisk ? "warn" : "debug", "provider.rate_limit", fields);
}

export function logProviderRetry(fields: Record<string, unknown>): void {
  providerLog(BACKEND, "warn", "provider.retry", fields);
}

/** `provider.drift` — served/billed model differs from requested (overage/rate-limit fallback). */
export function logProviderDrift(entry: { readonly requested: string; readonly billed: readonly string[] }): void {
  providerLog(BACKEND, "warn", "provider.drift", { ...entry });
}

/** `provider.refusal` — category + retried flag only, never the refusal banner text. */
export function logProviderRefusal(entry: { readonly category: string | null; readonly retried: boolean }): void {
  providerLog(BACKEND, "warn", "provider.refusal", { ...entry });
}

/** `provider.leak` — a tool leaked past the locked tool-less config; only tool NAMES ride the line. */
export function logProviderLeak(entry: { readonly model: string; readonly toolNames: readonly string[] }): void {
  providerLog(BACKEND, "error", "provider.leak", { ...entry });
}

/** `provider.terminal_tools` — the TERMINAL (D112 fold) mount decision for one turn. `mounted:false` is the
 *  loud degrade: a schema outside the liftable subset means NO terminal channel, so the contributor's own
 *  post-commit round runs instead of the fold (never a silent state drop). Tool NAMES only. */
export function logProviderTerminalTools(entry: {
  readonly turnId: string;
  readonly mounted: boolean;
  readonly toolNames: readonly string[];
  readonly unliftable?: { readonly tool: string; readonly construct: string; readonly path: string };
}): void {
  providerLog(BACKEND, entry.mounted ? "debug" : "warn", "provider.terminal_tools", { ...entry });
}

/** `provider.compaction` — emitted only when context compaction FAILED. */
export function logProviderCompaction(fields: Record<string, unknown>): void {
  providerLog(BACKEND, "warn", "provider.compaction", fields);
}

/** `provider.dialog` — the non-interactive turn declined an MCP elicitation/user-dialog; `kind` is a
 *  metadata classifier only, never the dialog message/payload. */
export function logProviderDialog(entry: { readonly source: "elicitation" | "user-dialog"; readonly kind: string }): void {
  providerLog(BACKEND, "warn", "provider.dialog", { ...entry });
}

/** `provider.summarize` — one line per batch, metadata only (never prompt/summary text). */
export function logProviderSummarize(entry: { readonly items: number; readonly ok: number; readonly fail: number; readonly durationMs: number }): void {
  providerLog(BACKEND, "info", "provider.summarize", { ...entry });
}

/** `provider.capability` wrapper over the shared kit emitter. */
export function logProviderCapability(entry: ProviderCapabilityLog): void {
  kitLogProviderCapability(BACKEND, entry);
}

/** `provider.channel` — the volatile-content channel decision (debug); `demoted:true` mirrors the
 *  `dynamic_context_demoted` funnel warning. */
export function logProviderChannel(entry: {
  readonly turnId: string;
  readonly channel: DynamicContextChannel;
  readonly midConvCapable: boolean;
  readonly demoted: boolean;
}): void {
  providerLog(BACKEND, "debug", "provider.channel", { ...entry });
}

/** `provider.mcp` — warn when a configured server isn't healthy, debug otherwise. */
export interface ProviderMcpServerHealth {
  readonly name: string;
  readonly status: string;
  readonly error?: string | undefined;
}
export function logProviderMcp(entry: { readonly unhealthy: boolean; readonly servers: readonly ProviderMcpServerHealth[] }): void {
  providerLog(BACKEND, entry.unhealthy ? "warn" : "debug", "provider.mcp", { ...entry });
}
