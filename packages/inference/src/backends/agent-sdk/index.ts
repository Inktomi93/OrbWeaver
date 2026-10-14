// The `agent-sdk` wire's sealed backend (§8.4): the subscription's bundled Claude runtime, per user, token
// arm only. Serves chat / agent / summarize / structured + `verifyAuth` + the daemon catalog (`listModels`).
// The SDK is this backend's PRIVATE dep — it never leaks upward (D8). Registration of the wire is "the bundled
// `claude` executable resolves" (`deps.env.claudeExecutable`), decided by the registry, not here.

import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import type { AgentSdkModel, ModelCatalogEntry, ModelListing } from "@orb/contracts/inference";
import type { VerifyAuthResult } from "@orb/contracts/providers";
import type {
  AgentToolServer,
  AgentTurnRequest,
  ChatRequest,
  ChatResult,
  ListModelsRequest,
  ProviderBackend,
  Resolved,
  SpawnIdentity,
  StructuredRequest,
  SummarizeRequest,
  VerifyAuthRequest,
} from "#contract";
import { ProviderError } from "#contract";
import { runSideGen } from "#roles";
import type { AgentSdkBackend, AgentSdkBackendDeps, AgentSdkDeps, AgentToolSpec, ClaudeRuntimeOverrides } from "../../contract/agent-sdk-backend.ts";
import type { NormalizeImageBytes } from "../../contract/wire.ts";
import { resolvedScrubSet } from "../http/sanitize.ts";
import { createImageNormalizer, passthroughImageNormalizer } from "../wire/image-normalize.ts";
import { bareCatalogEntry, failedListing, listingOf } from "../wire/model-listing.ts";
import { runAgentTurn } from "./agent-runner.ts";
import { fetchAgentSdkModels, verifyAuth } from "./catalog.ts";
import { buildClaudeSdkEnv } from "./env.ts";
import { createAgentSdkExecution } from "./execution.ts";
import { createAgentSdkLog } from "./log.ts";
import { runChatTurn } from "./runner.ts";
import { SessionCache } from "./session/index.ts";

export type { SessionEntryWriter } from "./session/index.ts";

const DEFAULT_TOOL_SERVER_NAME = "orbweaver";
const CLAUDE_TOOL = "claude";

const realScheduleTimeout: AgentSdkDeps["scheduleTimeout"] = (fn, ms) => {
  const handle = setTimeout(fn, ms);
  handle.unref();
  return (): void => {
    clearTimeout(handle);
  };
};

function isSessionStore(value: unknown): value is AgentSdkDeps["sessionStore"] {
  return value !== null && typeof value === "object" && "append" in value && "load" in value;
}

/** A daemon catalog row as a catalog entry: the pane lists aliases, and nothing else about them is known. */
export function agentSdkCatalogEntry(row: AgentSdkModel): ModelCatalogEntry {
  return bareCatalogEntry({ id: row.alias, name: row.displayName });
}

export function createAgentSdkBackend(deps: AgentSdkBackendDeps): AgentSdkBackend {
  const sessions = new SessionCache(deps.log, isSessionStore(deps.agentSdk.sessionStore) ? deps.agentSdk.sessionStore : undefined, deps.agentSdk.sessionWriter);
  const normalizeImageBytes: NormalizeImageBytes = deps.imageToPng !== undefined ? createImageNormalizer(deps.imageToPng) : passthroughImageNormalizer;
  const childEnv = (connection: SpawnIdentity, overrides?: ClaudeRuntimeOverrides): Record<string, string | undefined> =>
    buildClaudeSdkEnv({
      hostEnv: deps.env.hostEnvAllowlist(),
      token: connection.credential.secret ?? "",
      configDir: deps.userRuntimeDir(connection.ownerId, CLAUDE_TOOL),
      ...(overrides !== undefined ? { overrides } : {}),
    });
  const executeQuery = deps.agentSdk.query ?? query;
  const execution = createAgentSdkExecution({
    query: executeQuery,
    log: deps.log,
    ...(deps.agentSdk.spawnClaudeCodeProcess === undefined ? {} : { spawn: deps.agentSdk.spawnClaudeCodeProcess }),
    ...(deps.agentSdk.native === undefined ? {} : { native: deps.agentSdk.native }),
  });
  const resolved: AgentSdkDeps = {
    now: deps.now,
    log: deps.log,
    execution,
    sessionStore: sessions.store,
    ...(deps.agentSdk.sessionWriter !== undefined ? { sessionWriter: deps.agentSdk.sessionWriter } : {}),
    normalizeImageBytes,
    scheduleTimeout: deps.scheduleTimeout ?? deps.agentSdk.scheduleTimeout ?? realScheduleTimeout,
    ...(deps.scheduleIdleTimeout === undefined ? {} : { scheduleIdleTimeout: deps.scheduleIdleTimeout }),
    ...(deps.captureWire !== undefined ? { captureWire: deps.captureWire } : {}),
    debug: deps.debug ?? false,
    childEnv,
  };
  const logFor = (connection: Pick<Resolved, "providerId">): ReturnType<typeof createAgentSdkLog> => createAgentSdkLog(deps.log, connection.providerId);
  const catalogLog = createAgentSdkLog(deps.log, "claude-sub");
  const chatTurn = (req: ChatRequest): Promise<ChatResult> => {
    if (req.api !== "agent-sdk") {
      return Promise.reject(
        new ProviderError({ kind: "invalid", retryable: false, message: `agent-sdk backend received a non-agent-sdk request (api="${req.api}")` }),
      );
    }
    return runChatTurn(req, resolved, sessions, logFor(req.connection));
  };
  const sideGen = (req: SummarizeRequest | StructuredRequest): ReturnType<typeof runSideGen> => {
    const concurrency = req.connection.features.concurrency?.summarize ?? 1;
    return runSideGen(req, { runChatTurn: chatTurn, concurrency, normalize: normalizeImageBytes, log: deps.log, now: deps.now });
  };
  const backend: ProviderBackend = {
    wire: "agent-sdk",
    runChatTurn: chatTurn,
    runAgentTurn: (req: AgentTurnRequest): Promise<ChatResult> => runAgentTurn(req, resolved, logFor(req.connection)),
    summarize: sideGen,
    structured: sideGen,
    verifyAuth: (req: VerifyAuthRequest): Promise<VerifyAuthResult> => verifyAuth(req, resolved, logFor(req.connection)),
    listModels: async (req: ListModelsRequest): Promise<ModelListing> => {
      try {
        const models = await fetchAgentSdkModels(req.connection, resolved, logFor(req.connection));
        return listingOf(models.map(agentSdkCatalogEntry));
        // @orb-waive caught-failure-ownership(err): optional model discovery owns refusal as `listed:false` with the scrubbed reason; generation remains usable with an explicit model. Precedent: the gate mustPass fixture packages/server/src/domain/probe/failed-status.ts proves the same explicit failure result. Ends if callers require a successful catalog.
      } catch (err) {
        return failedListing(err, resolvedScrubSet({ credential: req.connection.credential, transport: null }));
      }
    },
  };
  return { backend, catalog: (identity) => fetchAgentSdkModels(identity, resolved, catalogLog), cancel: execution.cancel, settle: execution.settle };
}

// ── The SDK-free tool-server seam (agent mode) ─────────────────────────────────────────────────────────

/** Build an opaque {@link AgentToolServer} from domain-supplied tool specs WITHOUT the domain importing the SDK. */
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
  return createSdkMcpServer({ name: opts.name ?? DEFAULT_TOOL_SERVER_NAME, ...(opts.version !== undefined ? { version: opts.version } : {}), tools: sdkTools });
}

export type { AgentSdkBackend, AgentSdkBackendDeps, AgentToolResult, AgentToolSpec } from "../../contract/agent-sdk-backend.ts";
