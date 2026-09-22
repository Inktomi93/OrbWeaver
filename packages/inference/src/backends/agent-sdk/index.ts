// The `agent-sdk` wire's sealed backend (§8.4): the subscription's bundled Claude runtime, per user, token
// arm only. Serves chat / agent / summarize / structured + `verifyAuth` + the daemon catalog (`listModels`).
// The SDK is this backend's PRIVATE dep — it never leaks upward (D8). Registration of the wire is "the bundled
// `claude` executable resolves" (`deps.env.claudeExecutable`), decided by the registry, not here.

import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import type { AgentSdkModel } from "@orb/contracts/inference";
import type { VerifyAuthResult } from "@orb/contracts/providers";
import type { ZodRawShape } from "zod";
import type { AgentToolServer, AgentTurnRequest } from "../../contract/agent.ts";
import type { ProviderBackend } from "../../contract/backend.ts";
import type { ChatRequest, ChatResult } from "../../contract/chat.ts";
import type { ListModelsRequest, ListModelsResult, VerifyAuthRequest } from "../../contract/diagnostics.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { Resolved } from "../../contract/resolved.ts";
import type { StructuredRequest, SummarizeRequest } from "../../contract/roles.ts";
import type { SpawnIdentity } from "../../contract/runtime.ts";
import type { InferenceDeps } from "../../deps.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import { createImageNormalizer, passthroughImageNormalizer } from "../kit/image-normalize.ts";
import { runAgentTurn } from "./agent-runner.ts";
import { fetchAgentSdkModels, verifyAuth } from "./catalog.ts";
import type { ClaudeRuntimeOverrides } from "./env.ts";
import { buildClaudeSdkEnv } from "./env.ts";
import { createAgentSdkLog } from "./log.ts";
import { runChatTurn } from "./runner.ts";
import { SessionCache } from "./session/index.ts";
import { summarize } from "./summarize.ts";
import type { AgentSdkDeps } from "./types.ts";

export type { SessionEntryWriter } from "./session/index.ts";

const DEFAULT_TOOL_SERVER_NAME = "orbweaver";
const CLAUDE_TOOL = "claude";

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
  /** The bounded-probe/watchdog timer seam; absent ⇒ the real unref'd `setTimeout`. */
  readonly scheduleTimeout?: AgentSdkDeps["scheduleTimeout"];
}

const realScheduleTimeout: AgentSdkDeps["scheduleTimeout"] = (fn, ms) => {
  const handle = setTimeout(fn, ms);
  handle.unref();
  return (): void => {
    clearTimeout(handle);
  };
};

function isQuery(value: unknown): value is typeof query {
  return typeof value === "function";
}

function isSessionStore(value: unknown): value is AgentSdkDeps["sessionStore"] {
  return value !== null && typeof value === "object" && "append" in value && "load" in value;
}

/** A daemon catalog row → the shared catalog entry shape (the pane lists aliases; nothing else is known). */
function catalogEntryOf(row: { readonly alias: string; readonly displayName: string }): ListModelsResult["models"][number] {
  return {
    id: row.alias,
    name: row.displayName,
    contextLength: null,
    promptPrice: null,
    completionPrice: null,
    cacheReadPrice: null,
    cacheWritePrice: null,
    inputModalities: [],
    outputModalities: [],
    supportedParameters: [],
    maxCompletionTokens: null,
    reasoning: null,
  };
}

export interface AgentSdkBackend {
  readonly backend: ProviderBackend;
  /** The daemon catalog under a USER's token — the resolver's `warmAgentSdk` arm (no host credential exists to
   *  run it under, so the scheduled workload dropped this lane; the result is process-wide because the model
   *  list is not per-user). */
  readonly catalog: (identity: SpawnIdentity) => Promise<AgentSdkModel[]>;
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
  const resolved: AgentSdkDeps = {
    now: deps.now,
    log: deps.log,
    query: isQuery(deps.agentSdk.query) ? deps.agentSdk.query : query,
    sessionStore: sessions.store,
    ...(deps.agentSdk.sessionWriter !== undefined ? { sessionWriter: deps.agentSdk.sessionWriter } : {}),
    normalizeImageBytes,
    scheduleTimeout: deps.scheduleTimeout ?? realScheduleTimeout,
    summarizeConcurrency: deps.agentSdk.summarizeConcurrency,
    ...(deps.captureWire !== undefined ? { captureWire: deps.captureWire } : {}),
    debug: deps.debug ?? false,
    childEnv,
  };
  const logFor = (connection: Resolved): ReturnType<typeof createAgentSdkLog> => createAgentSdkLog(deps.log, connection.providerId);
  const catalogLog = createAgentSdkLog(deps.log, "claude-sub");
  const backend: ProviderBackend = {
    wire: "agent-sdk",
    runChatTurn: (req: ChatRequest): Promise<ChatResult> => {
      if (req.api !== "agent-sdk") {
        return Promise.reject(
          new ProviderError({ kind: "invalid", retryable: false, message: `agent-sdk backend received a non-agent-sdk request (api="${req.api}")` }),
        );
      }
      return runChatTurn(req, resolved, sessions, logFor(req.connection));
    },
    runAgentTurn: (req: AgentTurnRequest): Promise<ChatResult> => runAgentTurn(req, resolved, logFor(req.connection)),
    summarize: (req: SummarizeRequest) => summarize(req, resolved, logFor(req.connection)),
    structured: (req: StructuredRequest) => summarize(req, resolved, logFor(req.connection)),
    verifyAuth: (req: VerifyAuthRequest): Promise<VerifyAuthResult> => verifyAuth(req, resolved, logFor(req.connection)),
    listModels: async (req: ListModelsRequest): Promise<ListModelsResult> => {
      const models = await fetchAgentSdkModels(req.connection, resolved, logFor(req.connection));
      return { listed: models.length > 0, models: models.map(catalogEntryOf) };
    },
  };
  return { backend, catalog: (identity) => fetchAgentSdkModels(identity, resolved, catalogLog) };
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
