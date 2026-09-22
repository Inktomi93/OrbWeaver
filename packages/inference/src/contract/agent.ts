// The agent task's request. Agent mode = a chat turn plus tools + a multi-turn loop, served by the
// `agent-sdk` wire only (by construction of `WIRE_DEFS`); it rides the `chat` binding (F4) and returns a
// `ChatResult`. The DISCIPLINE (sandbox + a `canUseTool` ceiling derived from the principal's own capability
// factor, D60/Spine §4) is MANDATORY on this path because tools execute under the chat HOST principal (D152).

import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { ChatId, UserConnectionId } from "@orb/kit/ids";
import type { AgentSdkSessionId } from "./identity.ts";
import type { Resolved } from "./resolved.ts";

export interface SessionEntryWriter {
  readonly insert: (entry: {
    readonly chatId: ChatId;
    readonly connectionId: UserConnectionId;
    readonly sdkSessionId: AgentSdkSessionId;
    readonly seededThroughSeq: number;
    readonly canonHash: string;
  }) => Promise<void>;
  readonly update: (entry: {
    readonly connectionId: UserConnectionId;
    readonly sdkSessionId: AgentSdkSessionId;
    readonly seededThroughSeq: number;
    readonly canonHash: string;
  }) => Promise<void>;
}

/** The core treats it as opaque; the agent-sdk backend narrows it to its MCP server-config-with-instance. */
export type AgentToolServer = unknown;

/** SDK-free external MCP server spec the caller may attach. SECURITY: egress/subprocess capability — the
 *  caller owns authorization; this contract only names the concern. */
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

export interface AgentTurnRequest {
  readonly connection: Resolved<"agent">;
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly mcpServer: AgentToolServer;
  readonly externalMcpServers?: Readonly<Record<string, AgentMcpServerSpec>> | undefined;
  /** ABSENT means a normal prose turn. Only `schema` maps to the SDK. */
  readonly responseFormat?: ResponseFormat | undefined;
  readonly taskBudget?: number | undefined;
  readonly maxTurns?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly maxContextTokens?: number | undefined;
  readonly signal?: AbortSignal | undefined;
}
