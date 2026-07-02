// biome-ignore-all lint/performance/noBarrelFile: the agent-sdk FAMILY barrel — the sealed seam `entry/`
// uses to obtain the backend factory + the SDK-free tool-server factory, and the surface the family's
// tests import (deep imports into `backends/agent-sdk/<file>` are RED for everyone else by the
// `providers-public-surface-only` cruiser rule). Load-bearing for the encapsulation invariant.
//
// infra/providers/backends/agent-sdk — THE STATEFUL CHAT BACKEND: the Max sub (mode-1) + the
// OpenRouter-Anthropic skin (mode-2) + the local vLLM agent path (mode-3) + agent mode. Sealed: no other
// backend imports it; the SDK (`@anthropic-ai/claude-agent-sdk`) is its PRIVATE dep and never leaks
// upward (the contract is SDK-free; `AgentToolServer` is opaque `unknown`, narrowed inside this family).

import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import type { VerifyAuthResult } from "@orb/contracts/providers";
import type { ZodRawShape } from "zod";
import type {
  AgentToolServer,
  AgentTurnRequest,
  ChatRequest,
  ChatResult,
  ProviderBackend,
  VerifyAuthRequest,
} from "../../contract";
import { ProviderError } from "../../contract";
import { runAgentTurn } from "./agent-runner";
import { runChatTurn } from "./runner";
import { SessionCache } from "./session";
import type { AgentSdkDeps } from "./types";
import { verifyAuth } from "./verify-auth";

// ── Family-internal surface (entry wiring + the family's OWN tests). NOT a domain-reachable surface —
//    `providers-public-surface-only` keeps domains on the providers root barrel; this family barrel is
//    reachable only by `entry/` + the agent-sdk tests (whose import resolution can only hit an index.ts). ──
export {
  buildClaudeOpenRouterEnv,
  buildClaudeSdkEnv,
  buildClaudeVllmEnv,
  RESERVED_CLAUDE_ENV_KEYS,
} from "./env";
export { consumeTurnStream } from "./runner";
export { disciplineOptions } from "./translate";
export { assertInitFrameShape } from "./verify";

/** Default MCP namespace for a tool server built via {@link createAgentToolServer}. */
const DEFAULT_TOOL_SERVER_NAME = "orbweaver";

/**
 * The deps `entry/` injects to build the backend. `now` is REQUIRED — the composition root owns the clock
 * (the `no-raw-clock` determinism seam; this barrel can't fabricate one). `query` + `sessionStore` default
 * to the real SDK entry and an in-memory resume cache; the root overrides `sessionStore` with a durable
 * one when cross-restart resume is wanted (see session/store.ts).
 */
export interface AgentSdkBackendDeps {
  readonly now: () => number;
  readonly query?: AgentSdkDeps["query"];
  readonly sessionStore?: AgentSdkDeps["sessionStore"];
}

/**
 * Build the sealed agent-sdk {@link ProviderBackend}. `runChatTurn` narrows the incoming {@link
 * ChatRequest} to its `api:"agent-sdk"` arm (the role dispatcher guarantees it; a mismatch fail-closes
 * with a typed error). The per-chat {@link SessionCache} is owned by this instance — the canon-derived
 * resume cache that keeps the Max-sub prompt cache alive across turns.
 */
export function createAgentSdkBackend(deps: AgentSdkBackendDeps): ProviderBackend {
  const sessions = new SessionCache(deps.sessionStore);
  const resolved: AgentSdkDeps = {
    now: deps.now,
    query: deps.query ?? query,
    sessionStore: sessions.store,
  };
  return {
    key: "agent-sdk",
    runChatTurn: (req: ChatRequest): Promise<ChatResult> => {
      if (req.api !== "agent-sdk") {
        // A rejected promise (not a sync throw) — the contract method must always be awaitable.
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
    // The host-Claude auth verify (connection.testClaudeAuth) — a tiny turn through the SAME firewall a
    // real turn uses; no session resume (a health probe never touches the prompt-cache lineage).
    verifyAuth: (req: VerifyAuthRequest): Promise<VerifyAuthResult> => verifyAuth(req, resolved),
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
