// biome-ignore-all lint/performance/noBarrelFile: the agent-sdk FAMILY barrel — the sealed seam `entry/`
// uses to obtain the backend factory + the SDK-free tool-server factory, and the surface the family's
// tests import (deep imports into `backends/agent-sdk/<file>` are RED for everyone else by the
// `providers-public-surface-only` cruiser rule). Load-bearing for the encapsulation invariant.

// The stateful chat backend: the Max sub (mode-1) + the OpenRouter-Anthropic skin (mode-2) + the local
// vLLM agent path (mode-3) + agent mode. Sealed: the SDK is its private dep, never leaks upward.

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
  SummarizeRequest,
  SummarizeResult,
  VerifyAuthRequest,
} from "../../contract";
import { ProviderError } from "../../contract";
import { runAgentTurn } from "./agent-runner";
import { fetchAgentSdkModels } from "./catalog";
import { ensureFreshHostSubToken } from "./host-token";
import { runChatTurn } from "./runner";
import { SessionCache } from "./session";
import { summarize } from "./summarize";
import type { AgentSdkDeps } from "./types";
import { verifyAuth } from "./verify-auth";

export { fetchAgentSdkModels } from "./catalog";
export {
  buildClaudeOpenRouterEnv,
  buildClaudeSdkEnv,
  buildClaudeVllmEnv,
  RESERVED_CLAUDE_ENV_KEYS,
} from "./env";
export {
  ensureFreshHostSubToken,
  type HostTokenDeps,
  refreshHostSubTokenIfMode1,
} from "./host-token";
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
} from "./log";
export { consumeTurnStream } from "./runner";
export { disciplineOptions, dynamicContextOptions, firewallBase } from "./translate";
export { assertInitFrameShape, classifyTerminalReason } from "./verify";

const DEFAULT_TOOL_SERVER_NAME = "orbweaver";

export interface AgentSdkBackendDeps {
  readonly now: () => number;
  readonly query?: AgentSdkDeps["query"];
  readonly sessionStore?: AgentSdkDeps["sessionStore"];
  /** Tests inject a hermetic no-op so discovery/turn tests never hit the live OAuth endpoint. */
  readonly refreshHostSubToken?: AgentSdkDeps["refreshHostSubToken"];
}

export function createAgentSdkBackend(deps: AgentSdkBackendDeps): ProviderBackend {
  const sessions = new SessionCache(deps.sessionStore);
  const resolved: AgentSdkDeps = {
    now: deps.now,
    query: deps.query ?? query,
    sessionStore: sessions.store,
    refreshHostSubToken:
      deps.refreshHostSubToken ??
      ((): Promise<boolean> => ensureFreshHostSubToken({ now: deps.now })),
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
    // hosted OpenRouter path). Schema-validated output on sub quota — byte-parity with the vLLM/OR twins.
    summarize: (req: SummarizeRequest): Promise<SummarizeResult> => summarize(req, resolved),
    // The host-Claude auth verify (connection.testClaudeAuth) — a tiny turn through the SAME firewall a
    // real turn uses; no session resume (a health probe never touches the prompt-cache lineage).
    verifyAuth: (req: VerifyAuthRequest): Promise<VerifyAuthResult> => verifyAuth(req, resolved),
    // The `supportedModels()` discovery (connection.refreshAgentSdkCatalog) — a held-open streaming query
    // through the SAME mode-1 firewall; a control-channel call, not a billed turn (see catalog.ts).
    fetchModels: (_req: FetchAgentSdkModelsRequest): Promise<AgentSdkModel[]> =>
      fetchAgentSdkModels(resolved),
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
export function createAgentToolServer(opts: {
  readonly name?: string;
  readonly version?: string;
  readonly tools: readonly AgentToolSpec[];
}): AgentToolServer {
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
