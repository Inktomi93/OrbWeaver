// agent-sdk `provider.*` event lines over the shared `providerLogger` sink. Doctrine: logs are METADATA only —
// never prompt/RP/system-prompt content. Bound ONCE per backend (`createAgentSdkLog`) — no global logger.

import type { ChatId } from "@orb/kit/ids";
import type { ContextUsage } from "../../contract/chat.ts";
import type { ProviderError } from "../../contract/errors.ts";
import type { DynamicContextChannel } from "../../contract/resolve.ts";
import type { InferenceLog } from "../../deps.ts";
import type { ProviderCapabilityLog, ProviderLogger, ProviderTurnUsage } from "../kit/provider-log.ts";
import { providerLogger } from "../kit/provider-log.ts";
import type { SeededSessionDecision } from "./session/index.ts";

const WIRE = "agent-sdk";

/** One-line-per-turn anchor (`provider.turn`, info) — success or failure. */
interface ProviderTurnLog {
  readonly turnId?: string;
  readonly chatId?: ChatId;
  readonly sessionId?: string;
  readonly apiKeySource?: string;
  readonly requestedModel: string;
  readonly servedModel?: string;
  readonly disposition?: SeededSessionDecision["disposition"];
  readonly terminalReason?: string | null;
  /** How many MODEL CALLS the agentic loop made for this ONE turn — the DENOMINATOR for `usage.tokensOut`. */
  readonly numTurns?: number;
  readonly durationMs?: number;
  readonly ttftMs?: number | null;
  readonly ok: boolean;
  readonly usage?: ProviderTurnUsage;
  readonly contextUsage?: ContextUsage;
}

interface ProviderMcpServerHealth {
  readonly name: string;
  readonly status: string;
  readonly error?: string | undefined;
}

export interface AgentSdkLog {
  readonly base: ProviderLogger;
  readonly turn: (entry: ProviderTurnLog) => void;
  readonly session: (entry: { readonly chatId: ChatId; readonly sessionId: string | null; readonly disposition: SeededSessionDecision["disposition"] }) => void;
  readonly error: (err: ProviderError, extra?: { readonly stderrTail?: string }) => void;
  readonly rateLimit: (banRisk: boolean, fields: Record<string, unknown>) => void;
  readonly retry: (fields: Record<string, unknown>) => void;
  readonly drift: (entry: { readonly requested: string; readonly billed: readonly string[] }) => void;
  readonly refusal: (entry: { readonly category: string | null; readonly retried: boolean }) => void;
  readonly leak: (entry: { readonly model: string; readonly toolNames: readonly string[] }) => void;
  readonly terminalTools: (entry: {
    readonly turnId: string;
    readonly mounted: boolean;
    readonly toolNames: readonly string[];
    readonly unliftable?: { readonly tool: string; readonly construct: string; readonly path: string };
  }) => void;
  readonly compaction: (fields: Record<string, unknown>) => void;
  readonly dialog: (entry: { readonly source: "elicitation" | "user-dialog"; readonly kind: string }) => void;
  readonly summarize: (entry: { readonly items: number; readonly ok: number; readonly fail: number; readonly durationMs: number }) => void;
  readonly capability: (entry: ProviderCapabilityLog) => void;
  readonly channel: (entry: {
    readonly turnId: string;
    readonly channel: DynamicContextChannel;
    readonly midConvCapable: boolean;
    readonly demoted: boolean;
  }) => void;
  readonly mcp: (entry: { readonly unhealthy: boolean; readonly servers: readonly ProviderMcpServerHealth[] }) => void;
  readonly info: (fields: Record<string, unknown>, message: string) => void;
  readonly warn: (fields: Record<string, unknown>, message: string) => void;
  readonly debug: (fields: Record<string, unknown>, message: string) => void;
}

export function createAgentSdkLog(log: InferenceLog, providerId: string): AgentSdkLog {
  const base = providerLogger(log, WIRE, providerId);
  return {
    base,
    turn: (entry) => base.emit("info", "provider.turn", { ...entry }),
    session: (entry) => base.emit("debug", "provider.session", { ...entry }),
    error: (err, extra) =>
      base.emit("error", "provider.error", { ...err.toLog(), ...(extra?.stderrTail !== undefined ? { stderrTail: extra.stderrTail } : {}) }),
    rateLimit: (banRisk, fields) => base.emit(banRisk ? "warn" : "debug", "provider.rate_limit", fields),
    retry: (fields) => base.emit("warn", "provider.retry", fields),
    drift: (entry) => base.emit("warn", "provider.drift", { ...entry }),
    refusal: (entry) => base.emit("warn", "provider.refusal", { ...entry }),
    leak: (entry) => base.emit("error", "provider.leak", { ...entry }),
    terminalTools: (entry) => base.emit(entry.mounted ? "debug" : "warn", "provider.terminal_tools", { ...entry }),
    compaction: (fields) => base.emit("warn", "provider.compaction", fields),
    dialog: (entry) => base.emit("warn", "provider.dialog", { ...entry }),
    summarize: (entry) => base.emit("info", "provider.summarize", { ...entry }),
    capability: (entry) => base.capability(entry),
    channel: (entry) => base.emit("debug", "provider.channel", { ...entry }),
    mcp: (entry) => base.emit(entry.unhealthy ? "warn" : "debug", "provider.mcp", { ...entry }),
    info: (fields, message) => log.info({ wire: WIRE, providerId, ...fields }, message),
    warn: (fields, message) => log.warn({ wire: WIRE, providerId, ...fields }, message),
    debug: (fields, message) => log.debug({ wire: WIRE, providerId, ...fields }, message),
  };
}
