// domain/buddy/contract/agent-turn — the injected agent-turn seam. BuddyAgentRequest carries NO chatId:
// the buddy writes its own buddy_turns transcript, never chat messages. Buddy stays SDK/provider-free;
// the entry composition root adapts these types to the sealed infra/providers runner.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import type { ZodRawShape } from "zod";

/** Opaque in-process tool-server handle; only the sealed agent-sdk backend narrows it. */
export type BuddyToolServer = unknown;

/** One tool's result — the SDK-free content shape the entry adapter maps onto the MCP CallToolResult. */
export interface BuddyToolResult {
  readonly content: ReadonlyArray<{ readonly type: "text"; readonly text: string }>;
  readonly isError?: boolean | undefined;
}

/** One tool the buddy exposes; inputSchema validated by the sealed runner before handler runs. */
export interface BuddyToolSpec {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ZodRawShape;
  readonly handler: (args: Record<string, unknown>) => Promise<BuddyToolResult>;
}

/** The buddy's agent-turn request; NO chatId (see file header). */
export interface BuddyAgentRequest {
  readonly credential: ResolvedCredential;
  readonly model: ModelId;
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly toolServer: BuddyToolServer;
  readonly maxTurns?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly maxContextTokens?: number | undefined;
  readonly signal?: AbortSignal | undefined;
}

/** The buddy's egocentric projection of a turn result — just the reply text. */
export interface BuddyAgentResult {
  readonly text: string;
}

/** The injected agent-mode turn (the sealed infra/providers runner; wired at entry/). */
export type AgentTurnOp = (req: BuddyAgentRequest) => Promise<BuddyAgentResult>;

/** The injected tool-server factory (the sealed agent-sdk createAgentToolServer; wired at entry/). */
export type BuildToolServerOp = (tools: readonly BuddyToolSpec[]) => BuddyToolServer;
