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

/** Opaque handle to an in-process agent tool server. The core treats it as opaque; the agent-sdk
 *  backend narrows it to `McpSdkServerConfigWithInstance`. */
export type AgentToolServer = unknown;

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
  /** Owner-consent for a `max-pro-sub`-funded agent turn (D17 belt; default OFF upstream). */
  readonly ownerConsented?: boolean | undefined;
  /** Agent-loop ceiling (tool call → result → …). The backend defaults it (~8) when unset. */
  readonly maxTurns?: number | undefined;
  /** Output-token ceiling. The backend defaults it (~4096) when unset (agent turns are short). */
  readonly maxOutputTokens?: number | undefined;
  /** Soft cap on the total runtime working set in tokens; the backend keeps it below a local window. */
  readonly maxContextTokens?: number | undefined;
  readonly signal?: AbortSignal | undefined;
}
