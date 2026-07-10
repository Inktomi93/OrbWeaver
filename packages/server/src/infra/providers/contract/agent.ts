// infra/providers/contract/agent — the `agent` role's infra-internal request. Agent mode = a chat turn
// PLUS tools + a multi-turn loop (opt-in; agent-sdk-only today). It rides the SAME firewall base as the
// chat role and returns a {@link ChatResult}. Consumed by `buddy` (W3) and future tool-using characters
// through the providers barrel.
//
// SDK-DECOUPLED: the in-process MCP tool server is genuinely agent-sdk-shaped
// (`McpSdkServerConfigWithInstance`), but the core stays SDK-free (D8 — the SDK is the agent-sdk
// backend's private dep). So `mcpServer` is typed as the opaque {@link AgentToolServer} seam: the
// caller supplies it; the agent-sdk backend narrows it to its SDK type at the boundary. How a domain
// obtains an `AgentToolServer` without importing the SDK is the agent-sdk backend's exposed factory
// (a barrel seam) — out of scope for the core.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import type { OrSkinTierModels, ResponseFormat } from "./chat";

/** Opaque handle to an in-process agent tool server. The core treats it as opaque; the agent-sdk
 *  backend narrows it to `McpSdkServerConfigWithInstance`. */
export type AgentToolServer = unknown;

/** The dialog kinds this backend can be asked to render mid-turn — an SDK-FREE projection of the agent-sdk
 *  `request_user_dialog` `dialog_kind` axis + the MCP-elicitation channel. Declared as ONE tuple (Spine
 *  §5.5) so the fail-closed handler and the `provider.dialog` log line share a single axis: adding a member
 *  is a `tsc`-checked change in one place, not a scattered string. `elicitation` is the MCP-server
 *  input-request channel (`onElicitation`); `refusal_fallback_prompt` is today's only concrete SDK
 *  `dialogKind`. A buddy turn is NON-INTERACTIVE — there is no human to answer, so every kind fails closed
 *  (elicitation declined / dialog cancelled). The union is the CLASSIFIER for the log line's `kind`, NOT an
 *  opt-in: the backend never declares `supportedDialogKinds`, so the SDK emits no user-dialog at all
 *  (absence = fail-closed, d.ts `supportedDialogKinds`); this vocab exists to classify one if the config
 *  ever changes and to type the elicitation path, which CAN fire from an attached MCP server. */
export const AGENT_DIALOG_KINDS = ["elicitation", "refusal_fallback_prompt"] as const;
export type AgentDialogKind = (typeof AGENT_DIALOG_KINDS)[number];

/** An SDK-FREE external MCP server spec the caller may attach to an agent turn (mapped to the agent-sdk
 *  `Options.mcpServers` at the boundary). Three transports, faithfully mirroring the d.ts variants:
 *  `stdio` (spawn a local subprocess), `sse`, and `http` (reach a remote endpoint). The in-process tool
 *  server ({@link AgentToolServer}) is a SEPARATE, always-present channel; this field is ADDITIVE and
 *  ABSENT by default (today's turn is in-process-only — the firewall base still holds).
 *
 *  SECURITY — EGRESS + SUBPROCESS territory, caller-owned: attaching one of these opens a real capability.
 *  `stdio` spawns a process with a caller-supplied command/args/env; `sse`/`http` make outbound requests to
 *  a caller-supplied URL with caller-supplied headers (credential material). The CALLER owns authorization
 *  (is THIS principal allowed to attach THIS server?) AND the egress-firewall interplay (the SSRF/egress
 *  allowlist that governs where the box may connect) — this contract NAMES that concern and enforces NONE
 *  of it: the field is a faithful shape seam, not a policy boundary. A reworked buddy that populates this
 *  MUST resolve authorization + egress policy before it reaches the backend. */
export interface AgentMcpStdioServer {
  readonly transport: "stdio";
  readonly command: string;
  readonly args?: readonly string[] | undefined;
  readonly env?: Readonly<Record<string, string>> | undefined;
}
export interface AgentMcpSseServer {
  readonly transport: "sse";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>> | undefined;
}
export interface AgentMcpHttpServer {
  readonly transport: "http";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>> | undefined;
}
export type AgentMcpServerSpec = AgentMcpStdioServer | AgentMcpSseServer | AgentMcpHttpServer;

// NOTE: the AGENT-TURN RESULT health projection (`AgentMcpServerHealth`) is homed in `chat.ts` beside
// `ContextUsage` — both are agent-sdk-only optional projections that ride the shared `ChatResult`. Homing
// it there (not here) keeps the contract files acyclic: `agent.ts` → `chat.ts` is the only edge (the
// `no-circular` cruiser rule forbids the back-import a result type in `agent.ts` would need).

/** Input to the generic agent-with-tools turn (`runAgentTurn`). A single agent turn: a prompt + an
 *  in-process MCP tool server, run through the agent-sdk loop (multi-turn tool calls allowed). The
 *  CALLER builds the tool server (the domain owns the tool handlers); the backend owns the SDK
 *  mechanics + the firewall. */
export interface AgentTurnRequest {
  /** Resolved per the caller's identity. `max-pro-sub` (owner box) + `vllm` (local loopback) +
   *  `openrouter` (the skin) are the agent-sdk-eligible sources; the firewall rejects custom_openai. */
  readonly credential: ResolvedCredential;
  readonly model: ModelId;
  readonly systemPrompt: string;
  readonly prompt: string;
  /** In-process tool server the model's tools surface from (opaque to the core; see file header). */
  readonly mcpServer: AgentToolServer;
  /** Optional EXTERNAL MCP servers to attach ALONGSIDE the in-process tool server (mapped to the SDK's
   *  `Options.mcpServers` at the boundary). ABSENT by default — today's turn is in-process-only. SECURITY:
   *  egress/subprocess capability; the CALLER owns authorization + the egress-firewall interplay (see the
   *  {@link AgentMcpServerSpec} doc). Keyed by server name (`mcp__<name>__<tool>` id namespace). */
  readonly externalMcpServers?: Readonly<Record<string, AgentMcpServerSpec>> | undefined;
  /** Structured-output request (D48): constrain the turn's FINAL output to a JSON schema (mapped to the
   *  agent-sdk `outputFormat: {type:'json_schema', schema}`). Used by tool-less `maxTurns:1` workloads that
   *  need a typed result, not prose. The SDK runs its OWN bounded retries; a persistent schema miss lands as
   *  the `structured_output_retry_exhausted` terminal reason (already classified in verify.ts). ABSENT ⇒ a
   *  normal prose turn. Only `schema` maps to the SDK; `name`/`strict`/`description` are the caller's own
   *  validator metadata (the OpenAI-path fields the agent-sdk `outputFormat` does not carry). */
  readonly responseFormat?: ResponseFormat | undefined;
  /** The `ModelCapability.output.structured` gate, DERIVED by the caller (connection domain) and threaded
   *  down — mirrors {@link orSkinTierModels} (infra holds no capability catalog). REQUIRED semantics: when
   *  {@link responseFormat} is set, the backend FAILS CLOSED with a typed `invalid` ProviderError unless
   *  this is `true` — a model that cannot honor a schema must never silently return prose the caller then
   *  mis-parses. Ignored when `responseFormat` is absent. */
  readonly supportsStructuredOutput?: boolean | undefined;
  /** API-side task budget in TOKENS (agent-sdk `taskBudget.total`, `task-budgets-2026-03-13` beta): the
   *  model is told its remaining budget so it paces tool use and wraps up before the limit. OPTIONAL — the
   *  common turn omits it and runs to `maxTurns`/`maxOutputTokens`. The consumer knob lands with the buddy
   *  rework; this is the reachable born-compliant seam (a public `AgentTurnRequest` field → SDK options). */
  readonly taskBudget?: number | undefined;
  /** Owner-consent for a `max-pro-sub`-funded agent turn (D17 belt; default OFF upstream). */
  readonly ownerConsented?: boolean | undefined;
  /** The OR-skin tier→slug map for a mode-2 (openrouter) agent turn — DERIVED by the connection domain
   *  (`deriveOrSkinTierModels`), threaded down so the firewall holds no hardcoded model strings. OPTIONAL:
   *  the common agent turn is the owner's mode-1 sub / mode-3 loopback (no OR map applies); it is REQUIRED
   *  only when the resolved source is `openrouter` (the firewall throws on a mode-2 turn that omits it). */
  readonly orSkinTierModels?: OrSkinTierModels | undefined;
  /** Agent-loop ceiling (tool call → result → …). The backend defaults it (~8) when unset. */
  readonly maxTurns?: number | undefined;
  /** Output-token ceiling. The backend defaults it (~4096) when unset (agent turns are short). */
  readonly maxOutputTokens?: number | undefined;
  /** Soft cap on the total runtime working set in tokens; the backend keeps it below a local window. */
  readonly maxContextTokens?: number | undefined;
  readonly signal?: AbortSignal | undefined;
}
