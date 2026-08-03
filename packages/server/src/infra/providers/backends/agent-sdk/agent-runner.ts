// Agent mode (tools + a multi-turn loop). Sibling to the roleplay runChatTurn: same firewall base +
// stream reducer, but adds the caller's in-process MCP server and lifts maxTurns for a tool loop — the
// roleplay turn's mcpServers:{} + maxTurns:1 is the asymmetry that IS the firewall.

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
import type { AgentMcpServerHealth, AgentMcpServerSpec, AgentTurnRequest, ChatResult } from "../../contract/index.ts";
import { ProviderError } from "../../contract/index.ts";
import { refreshHostSubTokenIfMode1 } from "./host-token.ts";
import { logProviderDialog, logProviderMcp } from "./log.ts";
import { toSdkOutputFormat } from "./output-schema.ts";
import { consumeTurnStream } from "./runner.ts";
import { disciplineOptions, MCP_NAMESPACE, observabilityOptions } from "./translate.ts";
import type { AgentSdkDeps } from "./types.ts";

const DEFAULT_AGENT_MAX_TURNS = 8;
// Aligned to the preset contract's DEFAULT_MAX_OUTPUT_TOKENS (2048) — the exact pattern the vllm chat
// surface uses one backend over — so the whole codebase has one default output-token floor. Dormant path
// (the only agent-turn consumer, buddy, is purged), so this is zero live behavior change today; the value
// exists for the rebuilt caller that will feed a preset's maxOutputTokens.
const SDK_TITLE_AGENT = "orbweaver-agent";
const MCP_STATUS_PROBE_TIMEOUT_MS = 2000;
const UNHEALTHY_MCP_STATUSES: ReadonlySet<string> = new Set(["failed", "needs-auth", "pending", "disabled"]);

// No human on this turn — decline every MCP elicitation deterministically.
function declineElicitation(request: ElicitationRequest): Promise<ElicitationResult> {
  logProviderDialog({ source: "elicitation", kind: request.mode ?? "form" });
  return Promise.resolve({ action: "decline" });
}

function cancelUserDialog(request: UserDialogRequest): Promise<UserDialogResult> {
  logProviderDialog({ source: "user-dialog", kind: request.dialogKind });
  return Promise.resolve({ behavior: "cancelled" });
}

// Attaching an external server is egress/subprocess capability the CALLER authorizes; this boundary maps the shape and enforces no policy.
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
      return {
        type: "sse",
        url: spec.url,
        ...(spec.headers !== undefined ? { headers: { ...spec.headers } } : {}),
      };
    case "http":
      return {
        type: "http",
        url: spec.url,
        ...(spec.headers !== undefined ? { headers: { ...spec.headers } } : {}),
      };
  }
}

function toSdkExternalServers(specs: Readonly<Record<string, AgentMcpServerSpec>> | undefined): Record<string, McpServerConfig> {
  const out: Record<string, McpServerConfig> = {};
  if (specs === undefined) {
    return out;
  }
  for (const [name, spec] of Object.entries(specs)) {
    out[name] = toSdkExternalServer(spec);
  }
  return out;
}

function toServerHealth(status: McpServerStatus): AgentMcpServerHealth {
  return {
    name: status.name,
    status: status.status,
    ...(status.error !== undefined ? { error: status.error } : {}),
  };
}

async function probeMcpHealth(query: Query): Promise<readonly AgentMcpServerHealth[] | undefined> {
  if (typeof query.mcpServerStatus !== "function") {
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), MCP_STATUS_PROBE_TIMEOUT_MS);
    timer.unref();
  });
  let statuses: readonly McpServerStatus[] | undefined;
  try {
    statuses = await Promise.race([query.mcpServerStatus(), timeout]);
  } catch {
    // diagnostic miss, not a turn failure
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
  if (statuses === undefined) {
    return;
  }
  const servers = statuses.map(toServerHealth);
  const unhealthy = servers.some((s) => UNHEALTHY_MCP_STATUSES.has(s.status));
  logProviderMcp({ unhealthy, servers });
  return servers;
}

// maxContextTokens (when set) caps the TOTAL working set so the SDK compacts below the engine window —
// load-bearing on vLLM, where a /v1/messages overflow is a retryable 500 the runner's fail-fast can't catch.
export async function runAgentTurn(req: AgentTurnRequest, deps: AgentSdkDeps): Promise<ChatResult> {
  // Fail closed on structured output the model can't honor — never a silent prose turn the caller mis-parses.
  if (req.responseFormat !== undefined && req.supportsStructuredOutput !== true) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: "agent-sdk: responseFormat requested but the model does not support structured output (capability output.structured).",
      model: req.model,
    });
  }
  await refreshHostSubTokenIfMode1(req.credential, deps.refreshHostSubToken);
  const overrides = {
    maxOutputTokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    ...(req.maxContextTokens !== undefined ? { maxContextTokens: req.maxContextTokens } : {}),
  };
  const abortController = new AbortController();
  if (req.signal !== undefined) {
    if (req.signal.aborted) {
      abortController.abort();
    } else {
      req.signal.addEventListener("abort", () => abortController.abort(), { once: true });
    }
  }
  const mcpServers: Record<string, McpServerConfig> = {
    [MCP_NAMESPACE]: req.mcpServer as McpSdkServerConfigWithInstance,
    ...toSdkExternalServers(req.externalMcpServers),
  };
  const taskBudget: Pick<Options, "taskBudget"> = req.taskBudget !== undefined ? { taskBudget: { total: req.taskBudget } } : {};
  const outputFormat: Pick<Options, "outputFormat"> =
    req.responseFormat !== undefined ? { outputFormat: toSdkOutputFormat(req.responseFormat, req.model) } : {};
  const stream = deps.query({
    prompt: req.prompt,
    options: {
      ...disciplineOptions(req.credential, req.orSkinTierModels, overrides),
      ...observabilityOptions(),
      mcpServers,
      allowedTools: [`mcp__${MCP_NAMESPACE}__*`],
      // Structured turns get a floor of 2: the runtime's own schema-validation retry consumes a turn.
      maxTurns: req.responseFormat !== undefined ? Math.max(req.maxTurns ?? DEFAULT_AGENT_MAX_TURNS, 2) : (req.maxTurns ?? DEFAULT_AGENT_MAX_TURNS),
      model: req.model,
      systemPrompt: req.systemPrompt,
      title: SDK_TITLE_AGENT,
      onElicitation: declineElicitation,
      onUserDialog: cancelUserDialog,
      ...taskBudget,
      ...outputFormat,
      ...(req.signal !== undefined ? { abortController } : {}),
    },
  });
  const result = await consumeTurnStream(stream, {
    model: req.model,
    resumed: false,
    now: deps.now,
  });
  const mcpServerHealth = await probeMcpHealth(stream as Query);
  return mcpServerHealth !== undefined ? { ...result, mcpServerHealth } : result;
}
