// infra/providers/backends/agent-sdk/types — the agent-sdk backend's PRIVATE, backend-internal seams.
// The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) is THIS backend's private dependency (D8):
// SDK types are imported + narrowed inside this family and never leak upward — the providers contract
// speaks only the SDK-free `ChatRequest`/`AgentTurnRequest`/`ChatResult`/`ChatEvent` vocab, and
// `AgentToolServer` is opaque `unknown` at the contract, narrowed to its real SDK type at the boundary.
//
// Only `interface` shapes live here (the `no-inline-types` type-home gate forbids exported `type`
// aliases / zod outside a `contract/`; object seams are interfaces, and the SDK function/union types are
// imported directly by each consumer rather than re-aliased here). Nothing in this file reads
// `process.env`, the clock, or the filesystem — those are env.ts (the firewall) and the injected
// `now`/`query`/`sessionStore` deps below.

import type { query, SessionStore } from "@anthropic-ai/claude-agent-sdk";
import type { ChatDeltaEvent, ChatEvent, ContextUsage } from "../../contract";
import type { SeededSessionDecision } from "./session";

/** The subset of SDK `Options` the firewall base (`disciplineOptions`) pins. Typed so a stray field
 *  can't silently widen the leak surface; spread into the full `query` options at the call site. */
// NOTE: the collection VALUE types are mutable (`string[]`, not `readonly string[]`) because they spread
// into the SDK `Options`, whose array fields are mutable — a `readonly` element type is not assignable.
// The `readonly` field modifiers keep the object itself immutable.
export interface DisciplineOptions {
  /** Removes the host runtime's "cowork" bundle (DesignSync/Monitor/PushNotification/RemoteTrigger) that
   *  `tools:[]` does NOT — see translate.ts. */
  readonly disallowedTools: string[];
  /** `[]` disables ALL built-in tools (Bash/Read/Edit/…). */
  readonly tools: string[];
  /** No MCP servers on the roleplay path (the agent runner overrides this with the caller's one). */
  readonly mcpServers: Record<string, never>;
  /** Empties `mcp_servers` regardless of any config-dir leftovers. */
  readonly strictMcpConfig: true;
  /** `[]` disables user/project/local settings (plugins/hooks that smuggle tokens into every request). */
  readonly settingSources: never[];
  /** THE per-spawn env — the credential firewall output (env.ts). */
  readonly env: Record<string, string | undefined>;
}

/**
 * The deps the agent-sdk family closes over, wired once by `createAgentSdkBackend`. Everything that is
 * non-deterministic or environment-bound is injected so the runners are unit-testable (testing.md):
 *   • `now`  — the epoch-ms clock for event timestamps + durations (no ambient `Date.now()` in the
 *              reducer); defaulted to the real clock in the factory.
 *   • `query`— the SDK entry; defaulted to the real `query`, swapped for a synthetic stream in tests.
 *   • `sessionStore` — the SDK SessionStore the backend mirrors resume frames to. Defaulted to the
 *              in-memory store (correct within-process resume — the Max-sub prompt-cache survival). A
 *              DURABLE store (cross-restart resume) is wired at the composition root; see session/store.ts.
 */
export interface AgentSdkDeps {
  readonly now: () => number;
  readonly query: typeof query;
  readonly sessionStore: SessionStore;
}

/**
 * The `consumeTurnStream` parameter shape — the mutable accumulator's read-only inputs. `model` is a
 * plain `string` (the SDK echoes arbitrary `provider/model` ids on the OR-skin path, not only curated
 * branded ids). The configured caps thread through so the result records what we POLICY-ENFORCED, not
 * just what the model could do.
 */
export interface TurnStreamContext {
  readonly model: string;
  readonly resumed: boolean;
  /** Which branch the resume decision took (from `SessionCache.ensureSeededSession`, or `resumed`/`fresh`
   *  for the seedless bare-resume path) — logged on the `provider.turn` / `provider.session` line. */
  readonly disposition?: SeededSessionDecision["disposition"] | undefined;
  /** Injected epoch-ms clock (determinism). */
  readonly now: () => number;
  /** Tagged on each emitted `ChatDeltaEvent` so concurrent chats are filterable. */
  readonly chatId?: string | undefined;
  readonly onEvent?: ((event: ChatEvent) => void) | undefined;
  readonly onDelta?: ((event: ChatDeltaEvent) => void) | undefined;
  /** Observation hook fired with the SDK's `session_id` the first time it is seen — the seam the per-chat
   *  resume cache records under, keeping `ChatResult` itself session-free (the session is backend-internal). */
  readonly onSessionId?: ((sessionId: string) => void) | undefined;
  /** The configured output cap (CLAUDE_CODE_MAX_OUTPUT_TOKENS) — persisted as provenance over the
   *  model's reported max; `null` when the preset omits it. */
  readonly configuredMaxOutputTokens?: number | null | undefined;
  /** The configured soft context cap (CLAUDE_CODE_MAX_CONTEXT_TOKENS) — same provenance rationale. */
  readonly configuredMaxContextTokens?: number | null | undefined;
  /** Best-effort "how full is the context window" probe, run by the reducer AFTER the stream drains but
   *  while the live SDK `Query` is still open (only `runChatTurn` can supply it — a hand-built stream has
   *  no control channel). Its own failure/timeout is swallowed (resolves `undefined`); the reducer never
   *  awaits it unbounded (the runner bounds it). ABSENT ⇒ no probe (agent-mode / tests / stateless). */
  readonly probeContextUsage?: (() => Promise<ContextUsage | undefined>) | undefined;
  /** The bounded CLI-stderr tail for this turn — read ONLY on a spawn-death error (kind server/unknown) to
   *  attach `stderrTail` to the `provider.error` line; never read on success. Undefined in tests that drive
   *  the reducer directly (no live spawn → no stderr). */
  readonly stderrTail?: (() => string) | undefined;
}
