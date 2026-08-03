// agent-sdk backend-private seams (D8): SDK types are narrowed here and never leak upward — the
// providers contract stays SDK-free.

import type { query, SessionStore } from "@anthropic-ai/claude-agent-sdk";
import type { ChatId } from "@orb/kit/ids";
import type { ChatDeltaEvent, ChatEvent, ContextUsage, WireCaptureSink } from "../../contract/index.ts";
import type { NormalizeImageBytes } from "../kit/index.ts";
import type { SeededSessionDecision } from "./session/index.ts";

/** Subset of SDK `Options` the firewall base (`disciplineOptions`) pins; spread into `query` options. */
export interface DisciplineOptions {
  /** Removes the host "cowork" bundle that `tools:[]` alone doesn't — see translate.ts. */
  readonly disallowedTools: string[];
  readonly tools: string[];
  readonly mcpServers: Record<string, never>;
  readonly strictMcpConfig: true;
  readonly settingSources: never[];
  readonly env: Record<string, string | undefined>;
}

/** Deps the agent-sdk family closes over (`createAgentSdkBackend`); injected for hermetic tests. */
export interface AgentSdkDeps {
  readonly now: () => number;
  readonly query: typeof query;
  readonly sessionStore: SessionStore;
  /** The shared outbound-image seam (MA-10): a summarize item's images ride the SDK streaming-input prompt as
   *  Anthropic content blocks. Bytes normalize (GIF → first-frame PNG) before base64; absent-injection ⇒ the
   *  label-only passthrough (no decode). */
  readonly normalizeImageBytes: NormalizeImageBytes;
  /** Pre-spawn mode-1 (Max sub) OAuth refresh so the ephemeral-dir symlink resolves fresh (host-token.ts).
   *  Best-effort — resolves `false`, never throws. */
  readonly refreshHostSubToken: () => Promise<boolean>;
  /** Live getter for the max in-flight summarize workers (Q6 — agentSdkConcurrency.summarize, env floor 4 ⊕
   *  AppSettings override). Read per BATCH so an admin retune applies without a restart. Omitted ⇒ the floor. */
  readonly summarizeConcurrency?: (() => number) | undefined;
  /** TASK-24 wire-capture sink — records the SDK QUERY INPUT (prompt + systemPrompt + resolved options)
   *  right before the SDK subprocess assembles + sends the Anthropic /v1/messages body itself (which is not
   *  observable here — see runner.ts). Absent ⇒ no capture (zero cost, the compose default). */
  readonly captureWire?: WireCaptureSink | undefined;
}

/** `consumeTurnStream` parameter shape. */
export interface TurnStreamContext {
  readonly turnId?: string | undefined;
  readonly model: string;
  readonly resumed: boolean;
  readonly disposition?: SeededSessionDecision["disposition"] | undefined;
  readonly now: () => number;
  readonly chatId?: ChatId | undefined;
  readonly onEvent?: ((event: ChatEvent) => void) | undefined;
  readonly onDelta?: ((event: ChatDeltaEvent) => void) | undefined;
  // @foreign-id-ok(sessionId): the Claude Agent SDK's OWN chat-session id (its `session_id` wire field) — a NAME COLLISION with our BFF `SessionId = TypeIdOf<"session">`, a different wire's id that merely shares the spelling. Ends if this position ever carries one of our session rows, or if the field is renamed `sdkSessionId` (which would dissolve this marker).
  readonly onSessionId?: ((sessionId: string) => void) | undefined;
  readonly configuredMaxOutputTokens?: number | null | undefined;
  readonly configuredMaxContextTokens?: number | null | undefined;
  /** Best-effort context-window probe run after the stream drains but while the SDK `Query` is still
   *  open; failure/timeout swallowed. */
  readonly probeContextUsage?: (() => Promise<ContextUsage | undefined>) | undefined;
  /** Bounded CLI-stderr tail, read only on a spawn-death error. */
  readonly stderrTail?: (() => string) | undefined;
  /** True when the request carried a `responseFormat` (`outputFormat: json_schema` mounted): the reducer
   *  then surfaces the success frame's `structured_output` as the reply (compact JSON — the vLLM
   *  guided-decoding convention, so a consumer can't tell the backends apart). */
  readonly expectStructured?: boolean | undefined;
  /** True when the request's TERMINAL tools actually MOUNTED (D112 R1): the reducer then collects their
   *  co-emitted `tool_use` blocks off the assistant frame and reports them on `ChatResult.toolCalls`. False /
   *  absent leaves `toolCalls` ABSENT — the honest "this wire carried no terminal channel", which is what
   *  makes the fold's `null`-vs-`[]` distinction total. */
  readonly captureTerminalTools?: boolean | undefined;
}
