// Agent mode (tools + a multi-turn loop). Sibling to the roleplay `runChatTurn`: same firewall base + stream
// reducer, but adds the caller's in-process MCP server and lifts maxTurns for a tool loop — the roleplay
// turn's mcpServers:{} + maxTurns:1 is the asymmetry that IS the firewall. Tools execute under the chat HOST
// principal (D152), which is why the discipline (sandbox + the `canUseTool` ceiling) is MANDATORY here.

import type {
  ElicitationRequest,
  ElicitationResult,
  McpSdkServerConfigWithInstance,
  McpServerConfig,
  McpServerStatus,
  Options,
  Query,
  UserDialogRequest,
  UserDialogResult,
} from "@anthropic-ai/claude-agent-sdk";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "@orb/contracts/preset";
import type { AgentMcpServerSpec, AgentTurnRequest } from "../../contract/agent.ts";
import type { AgentMcpServerHealth, ChatResult } from "../../contract/chat.ts";
import { ProviderError } from "../../contract/errors.ts";
import type { AgentSdkLog } from "./log.ts";
import { toSdkOutputFormat } from "./output-schema.ts";
import { consumeTurnStream, linkAbort } from "./runner.ts";
import { disciplineOptions, MCP_NAMESPACE, observabilityOptions, TERMINAL_MCP_NAMESPACE } from "./translate.ts";
import type { AgentSdkDeps } from "./types.ts";

const DEFAULT_AGENT_MAX_TURNS = 8;
const SDK_TITLE_AGENT = "orbweaver-agent";
const MCP_STATUS_PROBE_TIMEOUT_MS = 2000;
const UNHEALTHY_MCP_STATUSES: ReadonlySet<string> = new Set(["failed", "needs-auth", "pending", "disabled"]);
/** The HOST-OWNED MCP namespaces an external server may never claim (#1405). */
const RESERVED_MCP_NAMESPACES: ReadonlySet<string> = new Set([MCP_NAMESPACE, TERMINAL_MCP_NAMESPACE]);

function toSdkExternalServer(spec: AgentMcpServerSpec): McpServerConfig {
  switch (spec.transport) {
    case "stdio":
      return {
        type: "stdio",
        command: spec.command,
        ...(spec.args !== undefined ? { args: [...spec.args] } : {}),
        ...(spec.env !== undefined ? { env: { ...spec.env } } : {}),
      };
    case "sse":
      return { type: "sse", url: spec.url, ...(spec.headers !== undefined ? { headers: { ...spec.headers } } : {}) };
    case "http":
      return { type: "http", url: spec.url, ...(spec.headers !== undefined ? { headers: { ...spec.headers } } : {}) };
  }
}

/** Map the caller's external server specs. TYPED REFUSAL on a reserved namespace; `Object.fromEntries` so a
 *  caller-supplied `__proto__` key is an own property, never the prototype (#1612). */
function toSdkExternalServers(specs: Readonly<Record<string, AgentMcpServerSpec>> | undefined, model: string): Record<string, McpServerConfig> {
  if (specs === undefined) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(specs).map(([name, spec]): readonly [string, McpServerConfig] => {
      if (RESERVED_MCP_NAMESPACES.has(name)) {
        throw new ProviderError({
          kind: "invalid",
          retryable: false,
          message: `agent-sdk: external MCP server name "${name}" is a reserved host namespace and may not be registered.`,
          model,
        });
      }
      return [name, toSdkExternalServer(spec)];
    }),
  );
}

function toServerHealth(status: McpServerStatus): AgentMcpServerHealth {
  return { name: status.name, status: status.status, ...(status.error !== undefined ? { error: status.error } : {}) };
}

async function probeMcpHealth(query: Query, deps: AgentSdkDeps, log: AgentSdkLog): Promise<readonly AgentMcpServerHealth[] | undefined> {
  if (typeof query.mcpServerStatus !== "function") {
    return;
  }
  let cancel: (() => void) | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    cancel = deps.scheduleTimeout(() => resolve(undefined), MCP_STATUS_PROBE_TIMEOUT_MS);
  });
  let statuses: readonly McpServerStatus[] | undefined;
  try {
    statuses = await Promise.race([query.mcpServerStatus(), timeout]);
  } catch {
    // diagnostic miss, not a turn failure
  } finally {
    cancel?.();
  }
  if (statuses === undefined) {
    return;
  }
  const servers = statuses.map(toServerHealth);
  log.mcp({ unhealthy: servers.some((s) => UNHEALTHY_MCP_STATUSES.has(s.status)), servers });
  return servers;
}

export async function runAgentTurn(req: AgentTurnRequest, deps: AgentSdkDeps, log: AgentSdkLog): Promise<ChatResult> {
  const { connection } = req;
  const structured = connection.capability.kind === "generation" && connection.capability.generation.output.structured === true;
  if (req.responseFormat !== undefined && !structured) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: "agent-sdk: responseFormat requested but the model does not support structured output (capability output.structured).",
      model: connection.model,
    });
  }
  const overrides = {
    maxOutputTokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    ...(req.maxContextTokens !== undefined ? { maxContextTokens: req.maxContextTokens } : {}),
  };
  const abortController = linkAbort(req.signal);
  // THE TRUSTED MOUNT IS WRITTEN LAST — the order is the second belt behind the reserved-name refusal (#1405).
  const mcpServers: Record<string, McpServerConfig> = {
    ...toSdkExternalServers(req.externalMcpServers, connection.model),
    [MCP_NAMESPACE]: req.mcpServer as McpSdkServerConfigWithInstance,
  };
  const taskBudget: Pick<Options, "taskBudget"> = req.taskBudget !== undefined ? { taskBudget: { total: req.taskBudget } } : {};
  const outputFormat: Pick<Options, "outputFormat"> =
    req.responseFormat !== undefined ? { outputFormat: toSdkOutputFormat(req.responseFormat, connection.model) } : {};
  const stream = deps.query({
    prompt: req.prompt,
    options: {
      ...disciplineOptions(deps.childEnv(connection, overrides)),
      ...observabilityOptions(deps.debug, log),
      mcpServers,
      allowedTools: [`mcp__${MCP_NAMESPACE}__*`],
      maxTurns: req.responseFormat !== undefined ? Math.max(req.maxTurns ?? DEFAULT_AGENT_MAX_TURNS, 2) : (req.maxTurns ?? DEFAULT_AGENT_MAX_TURNS),
      model: connection.model,
      systemPrompt: req.systemPrompt,
      title: SDK_TITLE_AGENT,
      onElicitation: (request: ElicitationRequest): Promise<ElicitationResult> => {
        log.dialog({ source: "elicitation", kind: request.mode ?? "form" });
        return Promise.resolve({ action: "decline" });
      },
      onUserDialog: (request: UserDialogRequest): Promise<UserDialogResult> => {
        log.dialog({ source: "user-dialog", kind: request.dialogKind });
        return Promise.resolve({ behavior: "cancelled" });
      },
      ...taskBudget,
      ...outputFormat,
      ...(req.signal !== undefined ? { abortController } : {}),
    },
  });
  // The agent task spells no effort/thinking knob — the runtime's own default ran, which is unrecorded (null).
  const result = await consumeTurnStream(
    stream,
    { model: connection.model, providerId: connection.providerId, resumed: false, now: deps.now, appliedEffort: null },
    log,
  );
  const mcpServerHealth = await probeMcpHealth(stream, deps, log);
  return mcpServerHealth !== undefined ? { ...result, mcpServerHealth } : result;
}
