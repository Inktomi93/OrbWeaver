// infra/providers/backends/agent-sdk/agent-runner — AGENT MODE (tools + a multi-turn loop). Sibling to
// the roleplay `runChatTurn`: the SAME firewall base (`disciplineOptions`) + the SAME stream→result
// reducer (`consumeTurnStream`); it only ADDS the caller's in-process MCP server, auto-approves that
// server's tools, and lifts `maxTurns` so the model can run a tool loop. The roleplay turn keeps
// `mcpServers:{}` + `maxTurns:1`; THAT asymmetry is the firewall — agent mode opts INTO tools explicitly.
//
// FAIL-CLOSED INTERACTIVITY: a buddy agent turn is NON-INTERACTIVE — there is no human to answer an MCP
// elicitation or a `request_user_dialog`. We register deterministic DECLINE handlers (`onElicitation` →
// `{action:'decline'}`, `onUserDialog` → `{behavior:'cancelled'}`) and emit a `provider.dialog` warn line
// when one fires (kind ONLY — never the dialog message/payload, which can carry content). The SDK already
// fail-closes on ABSENCE (an unhandled elicitation is auto-declined; a user-dialog is never even emitted
// without `supportedDialogKinds`, which we never declare) — so the handlers add OBSERVABILITY (the log
// signal) + belt-and-suspenders determinism, not a fix for a hang. `onUserDialog` is effectively inert in
// this config (no declared kinds ⇒ no dialog emitted); it is wired anyway so a future config change can't
// silently reintroduce a blocking dialog.
//
// STRUCTURED OUTPUT: `req.responseFormat` (SDK-free) maps to the SDK `outputFormat` (a `json_schema`
// constraint) for tool-less `maxTurns:1` workloads that need a typed result. It FAILS CLOSED with a typed
// `invalid` ProviderError when requested on a model the caller marks unsupported — never a silent prose
// turn the caller mis-parses. The SDK runs its own bounded schema retries; a persistent miss surfaces as
// the already-classified `structured_output_retry_exhausted` terminal reason.
//
// SDK-DECOUPLED: `req.mcpServer` is the opaque {@link AgentToolServer} (`unknown` at the contract). It is
// narrowed to the SDK's `McpSdkServerConfigWithInstance` ONLY here, at the boundary (D8). Domains obtain
// one via `createAgentToolServer` (the family barrel) without importing the SDK. `req.externalMcpServers`
// (SDK-free {@link AgentMcpServerSpec}) is mapped to the SDK `McpServerConfig` shape here too — see
// `toSdkExternalServers` for the egress/authz ownership note.

import type {
  ElicitationRequest,
  ElicitationResult,
  McpSdkServerConfigWithInstance,
  McpServerConfig,
  McpServerStatus,
  Options,
  OutputFormat,
  Query,
  UserDialogRequest,
  UserDialogResult,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentMcpServerHealth,
  AgentMcpServerSpec,
  AgentTurnRequest,
  ChatResult,
  ResponseFormat,
} from "../../contract";
import { ProviderError } from "../../contract";
import { refreshHostSubTokenIfMode1 } from "./host-token";
import { logProviderDialog, logProviderMcp } from "./log";
import { consumeTurnStream } from "./runner";
import { disciplineOptions, observabilityOptions } from "./translate";
import type { AgentSdkDeps } from "./types";

/** The MCP namespace the agent server registers under; tool ids are `mcp__<ns>__<tool>`. */
const MCP_NAMESPACE = "orbweaver";
/** Defaults for an agent turn (short, bounded) when the request omits them. */
const DEFAULT_AGENT_MAX_TURNS = 8;
const DEFAULT_AGENT_MAX_OUTPUT_TOKENS = 4096;
/** The `options.title` for an agent turn — a STATIC metadata label in the SDK's transcript store. Agent
 *  turns are stateless (no chatId to derive from) so it is a fixed namespace, never the user's content:
 *  RP-content doctrine keeps user text out of runtime metadata (the SDK persists the title to its JSONL). */
const SDK_TITLE_AGENT = "orbweaver-agent";
/** The MCP-health probe budget (ms). A slow/hung `mcpServerStatus()` must NEVER stall the turn — past this
 *  the probe resolves `undefined` and `mcpServerHealth` is simply absent (mirrors the context-usage probe). */
const MCP_STATUS_PROBE_TIMEOUT_MS = 2000;
/** The SDK MCP statuses that are NOT healthy — a turn running with one of these has (or may have) its tools
 *  silently absent, so `provider.mcp` warns. `connected` is the only healthy state. */
const UNHEALTHY_MCP_STATUSES: ReadonlySet<string> = new Set([
  "failed",
  "needs-auth",
  "pending",
  "disabled",
]);

/** Decline every MCP elicitation deterministically (no human on this turn) + emit the `provider.dialog`
 *  signal. `request.mode` (`form`/`url`) is the only classifier logged — never `request.message`/schema
 *  (tool/server-derived content stays off logs). Returns the ElicitResult decline the SDK sends upstream. */
function declineElicitation(request: ElicitationRequest): Promise<ElicitationResult> {
  logProviderDialog({ source: "elicitation", kind: request.mode ?? "form" });
  return Promise.resolve({ action: "decline" });
}

/** Cancel every `request_user_dialog` deterministically + emit the signal. `request.dialogKind` is a bare
 *  classifier string (open union per the d.ts); never `request.payload` (dialog-specific, possibly content).
 *  `{behavior:'cancelled'}` makes the CLI apply the dialog's default (for `refusal_fallback_prompt`, the
 *  classic refusal error). Inert in the current config (no `supportedDialogKinds` ⇒ no dialog emitted). */
function cancelUserDialog(request: UserDialogRequest): Promise<UserDialogResult> {
  logProviderDialog({ source: "user-dialog", kind: request.dialogKind });
  return Promise.resolve({ behavior: "cancelled" });
}

/** Map ONE SDK-free {@link AgentMcpServerSpec} → the SDK `McpServerConfig`. Faithful per-transport mapping
 *  of the three unambiguous d.ts variants (stdio/sse/http). SECURITY: see the {@link AgentMcpServerSpec}
 *  contract doc — attaching an external server is egress/subprocess capability the CALLER authorizes; this
 *  boundary maps the shape and enforces NO policy. Undefined optionals are dropped so the SDK sees a clean
 *  config. */
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

/** Map the caller's SDK-free external-server record → the SDK `mcpServers` record (empty ⇒ no external
 *  servers, so the in-process tool server is the only entry). */
function toSdkExternalServers(
  specs: Readonly<Record<string, AgentMcpServerSpec>> | undefined,
): Record<string, McpServerConfig> {
  const out: Record<string, McpServerConfig> = {};
  if (specs === undefined) {
    return out;
  }
  for (const [name, spec] of Object.entries(specs)) {
    out[name] = toSdkExternalServer(spec);
  }
  return out;
}

/** Map the SDK-free {@link ResponseFormat} → the SDK `outputFormat` (a `json_schema` output constraint).
 *  ONLY `schema` crosses — the agent-sdk `outputFormat` carries `{type, schema}` and nothing else; the
 *  `name`/`strict`/`description` on `ResponseFormat` are the caller's own OpenAI-path validator metadata
 *  (no SDK slot), so they are intentionally dropped here. */
function toSdkOutputFormat(rf: ResponseFormat): OutputFormat {
  return { type: "json_schema", schema: rf.schema };
}

/** Project one SDK `McpServerStatus` → the SDK-free {@link AgentMcpServerHealth} (name + status + the
 *  optional failed-server error; the SDK's richer serverInfo/tools/config are UI/SDK detail, not surfaced). */
function toServerHealth(status: McpServerStatus): AgentMcpServerHealth {
  return {
    name: status.name,
    status: status.status,
    ...(status.error !== undefined ? { error: status.error } : {}),
  };
}

/** Best-effort MCP-health probe against the LIVE {@link Query} handle (still open right after the stream
 *  drains). BOUNDED ({@link MCP_STATUS_PROBE_TIMEOUT_MS}) and TOTALLY non-fatal: a throw, rejection, or
 *  hang all resolve `undefined` (⇒ `mcpServerHealth` absent) — a diagnostic probe must never fail or delay
 *  the turn. A hand-built test stream is not a real `Query` (no `mcpServerStatus`), so method presence is
 *  guarded. On return, emits `provider.mcp` (warn when any server is unhealthy, debug when all connected).
 */
async function probeMcpHealth(query: Query): Promise<readonly AgentMcpServerHealth[] | undefined> {
  if (typeof query.mcpServerStatus !== "function") {
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), MCP_STATUS_PROBE_TIMEOUT_MS);
    timer.unref?.();
  });
  let statuses: readonly McpServerStatus[] | undefined;
  try {
    statuses = await Promise.race([query.mcpServerStatus(), timeout]);
  } catch {
    // A rejected control call is a diagnostic miss, never a turn failure — leave `statuses` absent.
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

/**
 * Run ONE agent-with-tools turn. `maxContextTokens` (when set) caps the TOTAL working set so the SDK
 * compacts/truncates the growing tool loop BELOW the engine window — load-bearing on vLLM, where a
 * `/v1/messages` overflow is a retryable 500 the runner's fail-fast can't catch, so this cap is what
 * prevents the overflow. The caller sets it under the vLLM window on that path; the Claude backends
 * (huge windows + working SDK compaction) leave it unset. Agent turns are stateless (no resume) — a tool
 * loop is self-contained.
 */
export async function runAgentTurn(req: AgentTurnRequest, deps: AgentSdkDeps): Promise<ChatResult> {
  // FAIL CLOSED on structured output the model can't honor: a schema-constrained turn on a model without
  // the `output.structured` capability would silently return prose the caller then mis-parses. The caller
  // (connection domain) threads the capability gate; infra holds no capability catalog (mirrors the
  // orSkinTierModels derivation). Non-retryable `invalid` — a different model is required, not a retry.
  if (req.responseFormat !== undefined && req.supportsStructuredOutput !== true) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message:
        "agent-sdk: responseFormat requested but the model does not support structured output (capability output.structured).",
      model: req.model,
    });
  }
  // mode-1 (Max sub) ONLY: proactively refresh an expired host OAuth token before the spawn (the same
  // ephemeral-symlink refresh-persistence hole runChatTurn guards against). Best-effort + never throws.
  await refreshHostSubTokenIfMode1(req.credential, deps.refreshHostSubToken);
  const overrides = {
    maxOutputTokens: req.maxOutputTokens ?? DEFAULT_AGENT_MAX_OUTPUT_TOKENS,
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
  // The caller's in-process tool server is ALWAYS present; external servers (egress/authz owned by the
  // caller — see the contract) are merged in ALONGSIDE it under their own names.
  const mcpServers: Record<string, McpServerConfig> = {
    [MCP_NAMESPACE]: req.mcpServer as McpSdkServerConfigWithInstance,
    ...toSdkExternalServers(req.externalMcpServers),
  };
  // The taskBudget seam (agent-sdk `taskBudget.total`, beta): present only when the caller sets it.
  const taskBudget: Pick<Options, "taskBudget"> =
    req.taskBudget !== undefined ? { taskBudget: { total: req.taskBudget } } : {};
  // Structured output (already gated above): map the response format to the SDK `outputFormat` when set.
  const outputFormat: Pick<Options, "outputFormat"> =
    req.responseFormat !== undefined ? { outputFormat: toSdkOutputFormat(req.responseFormat) } : {};
  const stream = deps.query({
    prompt: req.prompt,
    options: {
      // Start from the roleplay firewall base (tools:[] — no built-in Bash/Read/Edit; cowork denied;
      // strict MCP; credential-scoped env), then ADD the agent surface.
      ...disciplineOptions(req.credential, req.orSkinTierModels, overrides),
      ...observabilityOptions(),
      // The two fields the roleplay turn NEVER sets — this is the wall:
      mcpServers,
      allowedTools: [`mcp__${MCP_NAMESPACE}__*`],
      // Structured turns get a floor of 2: the runtime's own schema-validation retry CONSUMES a turn
      // (probed live 2026-07-10 — sonnet-5 × nested schema dies `error_max_turns(1)` at maxTurns:1,
      // completes at 2). The floor preserves the caller's "one completion" semantic — the extra turn
      // is internal retry room, tool budget/caps still bound spend.
      maxTurns:
        req.responseFormat !== undefined
          ? Math.max(req.maxTurns ?? DEFAULT_AGENT_MAX_TURNS, 2)
          : (req.maxTurns ?? DEFAULT_AGENT_MAX_TURNS),
      model: req.model,
      systemPrompt: req.systemPrompt,
      title: SDK_TITLE_AGENT,
      // Non-interactive fail-close: decline elicitations, cancel user-dialogs, and emit provider.dialog.
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
  // Best-effort MCP-health probe on the still-open Query (emits provider.mcp); absent on a hand-built
  // test stream / on a hung control call. Rides `ChatResult.mcpServerHealth` when it returns.
  const mcpServerHealth = await probeMcpHealth(stream as Query);
  return mcpServerHealth !== undefined ? { ...result, mcpServerHealth } : result;
}
