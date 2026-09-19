// The stateful chat backend: the Max sub (mode-1) + the OpenRouter-Anthropic skin (mode-2) + agent mode.
// The local vLLM agent path (mode-3) was RETIRED 2026-07-27 (owner ruling): local vLLM chat runs on the
// chat-completions surface only. Sealed: the SDK is its private dep, never leaks upward.

import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import type { AgentSdkModel } from "@orb/contracts/connection";
import type { VerifyAuthResult } from "@orb/contracts/providers";
import type { ZodRawShape } from "zod";
import type {
  AgentToolServer,
  AgentTurnRequest,
  ChatRequest,
  ChatResult,
  FetchAgentSdkModelsRequest,
  ProviderBackend,
  StructuredRequest,
  SummarizeRequest,
  SummarizeResult,
  VerifyAuthRequest,
} from "../../contract/index.ts";
import { ProviderError } from "../../contract/index.ts";
import { passthroughImageNormalizer } from "../kit/index.ts";
import { runAgentTurn } from "./agent-runner.ts";
import { fetchAgentSdkModels } from "./catalog.ts";
import { ensureFreshHostSubToken } from "./host-token.ts";
import { runChatTurn } from "./runner.ts";
import { SessionCache } from "./session/index.ts";
import { summarize } from "./summarize.ts";
import type { AgentSdkDeps } from "./types.ts";
import { verifyAuth } from "./verify-auth.ts";

export { fetchAgentSdkModels } from "./catalog.ts";
export {
  buildClaudeAnthEnv,
  buildClaudeOpenRouterEnv,
  buildClaudeSdkEnv,
  RESERVED_CLAUDE_ENV_KEYS,
} from "./env.ts";
export {
  ensureFreshHostSubToken,
  type HostTokenDeps,
  refreshHostSubTokenIfMode1,
} from "./host-token.ts";
export {
  logProviderCompaction,
  logProviderDialog,
  logProviderDrift,
  logProviderError,
  logProviderLeak,
  logProviderMcp,
  logProviderRateLimit,
  logProviderRefusal,
  logProviderRetry,
  logProviderSession,
  logProviderSummarize,
  logProviderTurn,
  type ProviderMcpServerHealth,
  type ProviderTurnLog,
  type ProviderTurnUsage,
} from "./log.ts";
export { sanitizeAnthropicOutputSchema } from "./output-schema.ts";
// The two BOUNDS are exported for the same reason `IDLE_TIMEOUT_MS` is: their tests trip them through the
// injected timer seam and assert the bound that was armed, which a re-spelled literal could not state.
export { CONTEXT_USAGE_PROBE_TIMEOUT_MS, consumeTurnStream, mergeMountedOptions } from "./runner.ts";
export type { SessionEntryWriter } from "./session/index.ts";
export { SUMMARIZE_ITEM_TIMEOUT_MS } from "./summarize.ts";
export { isTerminalToolCall, terminalToolOptions, toTerminalCall } from "./terminal-tools.ts";
export { disciplineOptions, dynamicContextOptions, firewallBase, TERMINAL_MCP_NAMESPACE } from "./translate.ts";
export { assertInitFrameShape, classifyTerminalReason } from "./verify.ts";

const DEFAULT_TOOL_SERVER_NAME = "orbweaver";

export interface AgentSdkBackendDeps {
  readonly now: () => number;
  readonly query?: AgentSdkDeps["query"];
  readonly sessionStore?: AgentSdkDeps["sessionStore"];
  /** D8 `session_entries` write-path injection (issue #71) — see `AgentSdkDeps.sessionWriter`. */
  readonly sessionWriter?: AgentSdkDeps["sessionWriter"];
  /** The shared outbound-image normalize seam (MA-10 summarize vision); absent ⇒ the label-only passthrough. */
  readonly normalizeImageBytes?: AgentSdkDeps["normalizeImageBytes"];
  /** Tests inject a hermetic no-op so discovery/turn tests never hit the live OAuth endpoint. */
  readonly refreshHostSubToken?: AgentSdkDeps["refreshHostSubToken"];
  /** TASK-24 wire-capture sink — compose injects it only when capture is enabled; absent ⇒ no capture. */
  readonly captureWire?: AgentSdkDeps["captureWire"];
  /** Live getter for the summarize worker count (Q6); compose wires it off the effective config. */
  readonly summarizeConcurrency?: AgentSdkDeps["summarizeConcurrency"];
  /** The bounded-probe/watchdog timer seam — see `AgentSdkDeps.scheduleTimeout`. Absent ⇒ the real timer
   *  below; a test passes a hand-driven one instead of replacing the global clock. */
  readonly scheduleTimeout?: AgentSdkDeps["scheduleTimeout"];
}

/** The real timer, and the default for the seam above — the ONE ambient `setTimeout` this backend owns.
 *  `unref` so an armed bound never holds the process open (what both former inline timers did). */
const realScheduleTimeout: AgentSdkDeps["scheduleTimeout"] = (fn, ms) => {
  const handle = setTimeout(fn, ms);
  handle.unref();
  return (): void => {
    clearTimeout(handle);
  };
};

export function createAgentSdkBackend(deps: AgentSdkBackendDeps): ProviderBackend {
  const sessions = new SessionCache(deps.sessionStore, deps.sessionWriter);
  const resolved: AgentSdkDeps = {
    now: deps.now,
    query: deps.query ?? query,
    sessionStore: sessions.store,
    ...(deps.sessionWriter !== undefined ? { sessionWriter: deps.sessionWriter } : {}),
    normalizeImageBytes: deps.normalizeImageBytes ?? passthroughImageNormalizer,
    refreshHostSubToken: deps.refreshHostSubToken ?? ((): Promise<boolean> => ensureFreshHostSubToken({ now: deps.now })),
    scheduleTimeout: deps.scheduleTimeout ?? realScheduleTimeout,
    ...(deps.captureWire !== undefined ? { captureWire: deps.captureWire } : {}),
    ...(deps.summarizeConcurrency !== undefined ? { summarizeConcurrency: deps.summarizeConcurrency } : {}),
  };
  return {
    key: "agent-sdk",
    runChatTurn: (req: ChatRequest): Promise<ChatResult> => {
      if (req.api !== "agent-sdk") {
        return Promise.reject(
          new ProviderError({
            kind: "invalid",
            retryable: false,
            message: `agent-sdk backend received a non-agent-sdk request (api="${req.api}")`,
          }),
        );
      }
      return runChatTurn(req, resolved, sessions);
    },
    runAgentTurn: (req: AgentTurnRequest): Promise<ChatResult> => runAgentTurn(req, resolved),
    // The Max sub as a selectable summarizer (mode-1 only; a non-sub credential fails closed pointing at the
    // hosted OpenRouter path). PROSE summarization — the schema path is the `structured` method below.
    summarize: (req: SummarizeRequest): Promise<SummarizeResult> => summarize(req, resolved),
    // The `structured` role for the sub — the SAME impl, given a schema (byte-parity with the vLLM/OR twins:
    // compact JSON output). agent-sdk stays OUT of the structured ROLE at the dispatcher (its structured
    // channel for a real turn is the chat outputFormat path); this method exists so the sub's schema-output
    // capability is reachable + pinned (mirrors `summarize` existing though the firewall excludes the sub).
    structured: (req: StructuredRequest): Promise<SummarizeResult> => summarize(req, resolved),
    // The host-Claude auth verify (connection.testClaudeAuth) — a tiny turn through the SAME firewall a
    // real turn uses; no session resume (a health probe never touches the prompt-cache lineage).
    verifyAuth: (req: VerifyAuthRequest): Promise<VerifyAuthResult> => verifyAuth(req, resolved),
    // The `supportedModels()` discovery (connection.refreshAgentSdkCatalog) — a held-open streaming query
    // through the SAME mode-1 firewall; a control-channel call, not a billed turn (see catalog.ts).
    fetchModels: (_req: FetchAgentSdkModelsRequest): Promise<AgentSdkModel[]> => fetchAgentSdkModels(resolved),
  };
}

// ── The SDK-free tool-server seam (agent mode) ─────────────────────────────────────────────────────────
// A domain (buddy, tool-using characters) builds its in-process tool server through THIS factory without
// importing the SDK: it passes zod input schemas (a shared dep) + handlers, and gets back an opaque
// `AgentToolServer` to hand to `runAgentTurn`. The SDK MCP plumbing stays sealed in this family.

/** A tool's result — a thin, SDK-free shape mapped to the MCP `CallToolResult` at the boundary. */
export interface AgentToolResult {
  readonly content: ReadonlyArray<{ readonly type: "text"; readonly text: string }>;
  readonly isError?: boolean;
}

/** One tool definition a domain supplies. `inputSchema` is a zod raw shape (a record of field schemas);
 *  the SDK validates args against it before `handler` runs, so `args` is already shape-checked. */
export interface AgentToolSpec {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ZodRawShape;
  readonly handler: (args: Record<string, unknown>) => Promise<AgentToolResult>;
}

/**
 * Build an opaque {@link AgentToolServer} from domain-supplied tool specs — the seam that lets a domain
 * obtain a tool server WITHOUT importing the SDK. The result is handed to `runAgentTurn`'s `mcpServer`.
 */
export function createAgentToolServer(opts: { readonly name?: string; readonly version?: string; readonly tools: readonly AgentToolSpec[] }): AgentToolServer {
  const sdkTools = opts.tools.map((spec) =>
    tool(spec.name, spec.description, spec.inputSchema, async (args: Record<string, unknown>) => {
      const result = await spec.handler(args);
      return {
        content: result.content.map((c) => ({ type: "text" as const, text: c.text })),
        ...(result.isError !== undefined ? { isError: result.isError } : {}),
      };
    }),
  );
  return createSdkMcpServer({
    name: opts.name ?? DEFAULT_TOOL_SERVER_NAME,
    ...(opts.version !== undefined ? { version: opts.version } : {}),
    tools: sdkTools,
  });
}
