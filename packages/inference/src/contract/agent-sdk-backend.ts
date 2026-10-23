import type { SessionKey, SessionStore, SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk";
import type { AgentSdkModel } from "@orb/contracts/inference";
import type { EffortLevel } from "@orb/contracts/preset";
import type { ChatId, ModelId } from "@orb/kit/ids";
import type { ZodRawShape } from "zod";
import type {
  AgentSdkExecution,
  AgentSdkLifetime,
  AgentSdkSessionId,
  AgentSdkSessionTotals,
  AgentSeedTurn,
  ChatDeltaEvent,
  ChatEvent,
  ChatResult,
  ContextUsage,
  ProviderBackend,
  ProviderError,
  ProviderScrubSet,
  ScheduleTimeout,
  SessionEntryWriter,
  SpawnIdentity,
  WireCaptureSink,
} from "#contract";
import type { AgentSdkQueryLease } from "#src/contract/agent-sdk-execution.ts";
import type { ProviderCapabilityLog, ProviderLogger, ProviderTurnUsage } from "./http.ts";
import type { InferenceDeps, InferenceLog } from "./runtime.ts";
import type { PlannedResponseFormat } from "./structured.ts";
import type { NormalizeImageBytes } from "./wire.ts";

/** Per-turn knobs written into the subprocess env. Boolean fields opt OUT with `=== false`, distinguishing
 *  "unset" from "explicitly off". Knob names verified against the bundled claude runtime binary. */
export interface ClaudeRuntimeOverrides {
  maxOutputTokens?: number | undefined;
  /** Soft cap on the runtime working set; the runtime transparently compacts/truncates to fit. */
  maxContextTokens?: number | undefined;
  /** Default OFF; set `false` to engage (then the typed thinking/effort SDK Options drive depth). */
  disableThinking?: boolean | undefined;
  disableAutoCompact?: boolean | undefined;
  /** When auto-compaction fires, as a percent of the window (0-100). Only meaningful in mode "auto". */
  autoCompactPct?: number | undefined;
  /** Power-user escape hatch for CLAUDE RUNTIME KNOBS only — allowlisted, then RESERVED stripped. */
  userEnv?: Record<string, string | null> | undefined;
}

export interface ClaudeSdkEnvArgs {
  /** The child-env allowlist source (`deps.env.hostEnvAllowlist()`), narrowed here to the supported keys. */
  readonly hostEnv: Readonly<Record<string, string>>;
  /** The user's pasted `claude setup-token` — the connection's resolved secret. */
  readonly token: string;
  /** `<USER_RUNTIME_DIR>/<ownerId>/claude` — the runtime's writable state, per user. */
  readonly configDir: string;
  readonly overrides?: ClaudeRuntimeOverrides | undefined;
}

export interface AgentSdkBackendDeps {
  readonly now: () => number;
  readonly log: InferenceDeps["log"];
  readonly env: InferenceDeps["env"];
  readonly userRuntimeDir: InferenceDeps["userRuntimeDir"];
  readonly agentSdk: InferenceDeps["agentSdk"];
  readonly captureWire?: InferenceDeps["captureWire"];
  readonly imageToPng?: InferenceDeps["imageToPng"];
  /** Opt-in subprocess stderr at debug level. */
  readonly debug?: boolean | undefined;
  /** The bounded-probe/watchdog timer seam; the root passes its unref'd scheduler. */
  readonly scheduleTimeout: AgentSdkDeps["scheduleTimeout"];
  readonly scheduleIdleTimeout: AgentSdkDeps["scheduleIdleTimeout"];
}

export interface AgentSdkBackend extends AgentSdkLifetime {
  readonly backend: ProviderBackend;
  /** The daemon catalog under a USER's token — the resolver's `warmAgentSdk` arm (no host credential exists to
   *  run it under, so the scheduled workload dropped this lane; the result is process-wide because the model
   *  list is not per-user). */
  readonly catalog: (identity: SpawnIdentity) => Promise<AgentSdkModel[]>;
}

// ── The SDK-free tool-server seam (agent mode) ─────────────────────────────────────────────────────────

/** A tool's result — a thin, SDK-free shape mapped to the MCP `CallToolResult` at the boundary. */
export interface AgentToolResult {
  readonly content: ReadonlyArray<{ readonly type: "text"; readonly text: string }>;
  readonly isError?: boolean;
}

export interface AgentToolSpec {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ZodRawShape;
  readonly handler: (args: Record<string, unknown>) => Promise<AgentToolResult>;
}

export interface AgentSdkLog {
  readonly base: ProviderLogger;
  readonly turn: (entry: ProviderTurnLog) => void;
  readonly session: (entry: {
    readonly chatId: ChatId;
    readonly sessionId: AgentSdkSessionId | null;
    readonly disposition: SeededSessionDecision["disposition"];
  }) => void;
  readonly error: (err: ProviderError, extra?: { readonly stderrTail?: string; readonly label?: string }) => void;
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
  readonly capability: (entry: ProviderCapabilityLog) => void;
  readonly mcp: (entry: { readonly unhealthy: boolean; readonly servers: readonly ProviderMcpServerHealth[] }) => void;
  readonly info: (fields: Record<string, unknown>, message: string) => void;
  readonly warn: (fields: Record<string, unknown>, message: string) => void;
  readonly debug: (fields: Record<string, unknown>, message: string) => void;
}

/** Subset of SDK `Options` the firewall base (`disciplineOptions`) pins; spread into `query` options. */
export interface DisciplineOptions {
  /** Removes the host "cowork" bundle that `tools:[]` alone doesn't — see translate.ts. */
  readonly disallowedTools: string[];
  readonly tools: string[];
  readonly mcpServers: Record<string, never>;
  readonly strictMcpConfig: true;
  readonly settingSources: never[];
  readonly env: Record<string, string | undefined>;
}

/** Deps the agent-sdk family closes over (`createAgentSdkBackend`); injected for hermetic tests. */
/** What a spawn needs from the connection: WHOSE runtime dir and WHICH token — the catalog warm runs before a
 *  full `Resolved` exists, so this is the narrow shape both it and a turn hand in. */
export interface AgentSdkDeps {
  readonly now: () => number;
  readonly log: InferenceLog;
  readonly execution: AgentSdkExecution;
  readonly sessionStore: SessionStore;
  readonly sessionWriter?: SessionEntryWriter | undefined;
  /** The shared outbound-image seam (MA-10): a summarize item's images ride the SDK streaming-input prompt. */
  readonly normalizeImageBytes: NormalizeImageBytes;
  /** The TIMER seam every bound in this backend arms through — injected so a test trips a bound by hand. */
  readonly scheduleTimeout: ScheduleTimeout;
  readonly scheduleIdleTimeout: ScheduleTimeout;
  readonly captureWire?: WireCaptureSink | undefined;
  /** Opt-in subprocess stderr at debug level. */
  readonly debug: boolean;
  /** The per-connection spawn env: the connection's token + the funder's runtime dir + the host baseline. */
  readonly childEnv: (connection: SpawnIdentity, overrides?: ClaudeRuntimeOverrides) => Record<string, string | undefined>;
}

/** `consumeTurnStream` parameter shape. */
export interface TurnStreamContext {
  readonly settleExecution?: AgentSdkQueryLease[typeof Symbol.asyncDispose];
  readonly signal?: AbortSignal;
  readonly onObservedResult?: ((result: ChatResult) => Promise<void>) | undefined;
  readonly turnId?: string | undefined;
  readonly model: ModelId;
  readonly providerId: string;
  readonly resumed: boolean;
  /** The spend totals the resumed transcript saved, which this turn's result carries forward; null when a saved
   *  entry was unreadable, which leaves the turn's cost unrecorded. */
  readonly savedTotals: AgentSdkSessionTotals | null;
  readonly disposition?: SeededSessionDecision["disposition"] | undefined;
  readonly now: () => number;
  readonly chatId?: ChatId | undefined;
  readonly onEvent?: ((event: ChatEvent) => void) | undefined;
  readonly onDelta?: ((event: ChatDeltaEvent) => void) | undefined;
  readonly onSessionId?: ((sessionId: AgentSdkSessionId) => void) | undefined;
  readonly configuredMaxOutputTokens?: number | null | undefined;
  readonly configuredMaxContextTokens?: number | null | undefined;
  readonly probeContextUsage?: (() => Promise<ContextUsage | undefined>) | undefined;
  readonly stderrTail?: (() => string) | undefined;
  readonly safeErrorMessage?: AgentSdkQueryLease["safeErrorMessage"];
  /** The planned payload when the request carried a `responseFormat` (`outputFormat: json_schema` mounted). */
  readonly structured?: PlannedResponseFormat | undefined;
  /** True when the request's TERMINAL tools actually MOUNTED (D112 R1). */
  readonly captureTerminalTools?: boolean | undefined;
  /** What the spawned runtime was told for effort (`ChatResult.appliedEffort`): `none` when thinking was disabled,
   *  the SDK effort word when one was set, `null` when neither (the runtime's own default — unrecorded). */
  readonly appliedEffort: EffortLevel | null;
  /** Every credential literal this spawn ran under. A failure's runtime text is scrubbed against it before it
   *  becomes a `ProviderError` message, which `invalid` shows to the user. */
  readonly secrets: ProviderScrubSet;
}

/** The contract's seed turn plus the assistant model this frame should claim — EXTENDED, never re-spelled, so
 *  the two cannot drift into different content vocabularies. */
export interface SeedTurn extends AgentSeedTurn {
  readonly model?: string | null;
}

/**
 * Orb-internal store extension: atomically REPLACE a session's frames (the SDK {@link SessionStore} is
 * append-only). Replacing in place keeps the sessionId and its prompt-cache lineage — an in-place replace
 * re-bills only the changed suffix, where minting a new id re-writes the whole conversation's cache.
 */
export interface ReplaceableSessionStore extends SessionStore {
  readonly replace: (key: SessionKey, entries: SessionStoreEntry[]) => Promise<void>;
}

/**
 * `ensureSeededSession` outcome: the session to resume (`null` = SDK-fresh) + which branch decided it.
 *   • `resumed`   — the recorded session's stored transcript still matched the seed.
 *   • `forked`    — a branch divergence (swipe/edit sharing a prefix); recorded lineage stays intact,
 *                   the branch seeds under its own deterministic lineage.
 *   • `reseeded`  — a non-branch divergence (window-slide) on a replace-capable store → in-place replace.
 *   • `seeded`    — cold cache → a fresh deterministic seed-derived session was appended.
 *   • `readopted` — a previously-seeded deterministic session for this exact state was re-adopted.
 *   • `rewound`   — that session had already run a turn on this seed (a regenerate), so it was cut back
 *                   to the seed in place before resuming.
 *   • `fresh`     — no cache hit usable (salt ceiling / replace-incapable divergence) → SDK-fresh.
 *   • `cleared`   — an empty seed dropped the mapping.
 */
export type SeededSessionDecision =
  | { readonly sessionId: AgentSdkSessionId; readonly disposition: "resumed" | "forked" | "reseeded" | "seeded" | "readopted" | "rewound" }
  | { readonly sessionId: null; readonly disposition: "fresh" | "cleared" };

/** One-line-per-turn anchor (`provider.turn`, info) — success or failure. */
export interface ProviderTurnLog {
  readonly turnId?: string;
  readonly chatId?: ChatId;
  readonly sessionId?: AgentSdkSessionId;
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

export interface ProviderMcpServerHealth {
  readonly name: string;
  readonly status: string;
  readonly error?: string | undefined;
}
