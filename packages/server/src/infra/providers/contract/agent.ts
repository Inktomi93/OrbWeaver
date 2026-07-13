// The agent role's infra-internal request. Agent mode = a chat turn plus tools + a multi-turn loop
// (opt-in, agent-sdk-only today). Rides the same firewall base as the chat role and returns a ChatResult.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import type { OrSkinTierModels, ResponseFormat } from "./chat";

// The core treats it as opaque; the agent-sdk backend narrows it to McpSdkServerConfigWithInstance.
export type AgentToolServer = unknown;

// A buddy turn is non-interactive — there is no human to answer, so every dialog kind fails closed.
export const AGENT_DIALOG_KINDS = ["elicitation", "refusal_fallback_prompt"] as const;
export type AgentDialogKind = (typeof AGENT_DIALOG_KINDS)[number];

/** SDK-free external MCP server spec the caller may attach to an agent turn (mapped to Options.mcpServers
 *  at the boundary). SECURITY: egress/subprocess capability — the caller owns authorization and the
 *  egress-firewall interplay; this contract only names the concern and enforces none of it. */
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

// AgentMcpServerHealth (the result-side health projection) is homed in chat.ts beside ContextUsage to keep the contract files acyclic.

export interface AgentTurnRequest {
  readonly credential: ResolvedCredential;
  readonly model: ModelId;
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly mcpServer: AgentToolServer;
  readonly externalMcpServers?: Readonly<Record<string, AgentMcpServerSpec>> | undefined;
  /** ABSENT means a normal prose turn. Only schema maps to the SDK; name/strict/description are the
   *  caller's own validator metadata. */
  readonly responseFormat?: ResponseFormat | undefined;
  /** When responseFormat is set, the backend fails closed unless this is true. Ignored when responseFormat is absent. */
  readonly supportsStructuredOutput?: boolean | undefined;
  readonly taskBudget?: number | undefined;
  readonly ownerConsented?: boolean | undefined;
  /** Required only when the resolved source is openrouter — the firewall throws on a mode-2 turn that omits it. */
  readonly orSkinTierModels?: OrSkinTierModels | undefined;
  readonly maxTurns?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly maxContextTokens?: number | undefined;
  readonly signal?: AbortSignal | undefined;
}
