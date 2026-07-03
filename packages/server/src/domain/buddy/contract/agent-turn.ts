// domain/buddy/contract/agent-turn — THE FIREWALL HOME + the injected agent-turn seam
// (participants-agents-identity.md §8.6 "the firewall inversion"). This is the seam
// chat (P5, D38) reuses: buddy builds BEFORE chat precisely so the agent-mode injection pattern is
// proven here first.
//
// THE FIREWALL (structural, compile-time): {@link BuddyAgentRequest} carries NO `chatId`. The buddy
// writes its OWN `buddy_turns` transcript, NEVER chat `messages` — passing chat context into a buddy
// turn is a TYPE ERROR because there is no slot for it (until §8.6 makes buddy a participant, which
// INVERTS this). The asymmetry that adds `mcpServers` for agent mode lives in the sealed
// `infra/providers` runner; buddy never re-implements it.
//
// SDK-DECOUPLED: buddy may not import `infra/providers` (`domain-no-cross-feature`), so the in-process
// MCP tool-server handle is the buddy-local opaque {@link BuddyToolServer} (mirrors the infra
// `AgentToolServer = unknown` seam). The entry composition root adapts a {@link BuddyAgentRequest} →
// the sealed `AgentTurnRequest` and a {@link BuddyToolSpec}[] → the sealed `createAgentToolServer`,
// keeping buddy free of every SDK + provider import.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import type { ZodRawShape } from "zod";

/** Opaque in-process tool-server handle. Buddy treats it as opaque (it never narrows it); the sealed
 *  agent-sdk backend narrows it at the boundary. Built by {@link BuildToolServerOp}, consumed by
 *  {@link AgentTurnOp}. Mirrors `infra/providers`' `AgentToolServer = unknown`. */
export type BuddyToolServer = unknown;

/** One tool's result — the SDK-free content shape the entry adapter maps onto the MCP `CallToolResult`. */
export interface BuddyToolResult {
  readonly content: ReadonlyArray<{ readonly type: "text"; readonly text: string }>;
  readonly isError?: boolean | undefined;
}

/** One tool the buddy exposes. `inputSchema` is a zod raw shape (a record of field schemas); the sealed
 *  runner validates args against it before `handler` runs. Buddy-local (mirrors the infra `AgentToolSpec`)
 *  so the domain never imports the SDK or the providers contract. */
export interface BuddyToolSpec {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ZodRawShape;
  readonly handler: (args: Record<string, unknown>) => Promise<BuddyToolResult>;
}

/**
 * The buddy's agent-turn request — THE FIREWALL. NO `chatId` (see file header): the buddy writes
 * `buddy_turns`, never chat `messages`. `credential`/`model` come from the resolved agent connection
 * (the owner gate already enforced inside credential resolution, D17). `maxContextTokens` is DERIVED
 * from the connection capability descriptor (`ModelCapability.context.window`), not a buddy
 * literal — the local-engine non-fail-fast-500-on-overflow discipline (the vLLM window discipline).
 */
export interface BuddyAgentRequest {
  readonly credential: ResolvedCredential;
  readonly model: ModelId;
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly toolServer: BuddyToolServer;
  /** Agent-loop ceiling (tool call → result → …); the sealed runner defaults it when unset. */
  readonly maxTurns?: number | undefined;
  /** Output-token ceiling; the sealed runner defaults it when unset. */
  readonly maxOutputTokens?: number | undefined;
  /** Soft cap on the total runtime working set; derived from the capability window. */
  readonly maxContextTokens?: number | undefined;
  readonly signal?: AbortSignal | undefined;
}

/** The buddy's egocentric projection of a turn result — buddy may not import the infra `ChatResult`,
 *  and only needs the reply text (its assistant `buddy_turn`). The entry adapter maps `ChatResult` →
 *  `{ text }`. */
export interface BuddyAgentResult {
  readonly text: string;
}

/** The injected agent-mode turn (the ONE sealed `infra/providers` runner; wired at `entry/`). This is
 *  the agent-turn seam exposed for chat (D38). */
export type AgentTurnOp = (req: BuddyAgentRequest) => Promise<BuddyAgentResult>;

/** The injected tool-server factory (the sealed agent-sdk `createAgentToolServer`; wired at `entry/`). */
export type BuildToolServerOp = (tools: readonly BuddyToolSpec[]) => BuddyToolServer;
