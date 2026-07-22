// agent-sdk backend-private seams (D8): SDK types are narrowed here and never leak upward — the
// providers contract stays SDK-free.

import type { query, SessionStore } from "@anthropic-ai/claude-agent-sdk";
import type { ChatDeltaEvent, ChatEvent, ContextUsage } from "../../contract";
import type { NormalizeImageBytes } from "../kit";
import type { SeededSessionDecision } from "./session";

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
}

/** `consumeTurnStream` parameter shape. */
export interface TurnStreamContext {
  readonly turnId?: string | undefined;
  readonly model: string;
  readonly resumed: boolean;
  readonly disposition?: SeededSessionDecision["disposition"] | undefined;
  readonly now: () => number;
  readonly chatId?: string | undefined;
  readonly onEvent?: ((event: ChatEvent) => void) | undefined;
  readonly onDelta?: ((event: ChatDeltaEvent) => void) | undefined;
  readonly onSessionId?: ((sessionId: string) => void) | undefined;
  readonly configuredMaxOutputTokens?: number | null | undefined;
  readonly configuredMaxContextTokens?: number | null | undefined;
  /** Best-effort context-window probe run after the stream drains but while the SDK `Query` is still
   *  open; failure/timeout swallowed. */
  readonly probeContextUsage?: (() => Promise<ContextUsage | undefined>) | undefined;
  /** Bounded CLI-stderr tail, read only on a spawn-death error. */
  readonly stderrTail?: (() => string) | undefined;
}
