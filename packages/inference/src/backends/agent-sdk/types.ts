// agent-sdk backend-private seams (D8): SDK types are narrowed here and never leak upward — the package's
// contract stays SDK-free.

import type { query, SessionStore } from "@anthropic-ai/claude-agent-sdk";
import type { EffortLevel } from "@orb/contracts/preset";
import type { ChatId, ModelId } from "@orb/kit/ids";
import type { AgentSdkSessionTotals, SessionEntryWriter } from "../../contract/agent.ts";
import type { WireCaptureSink } from "../../contract/backend.ts";
import type { ContextUsage } from "../../contract/chat.ts";
import type { ProviderScrubSet } from "../../contract/errors.ts";
import type { ChatDeltaEvent, ChatEvent } from "../../contract/events.ts";
import type { AgentSdkSessionId } from "../../contract/identity.ts";
import type { SpawnIdentity } from "../../contract/runtime.ts";
import type { InferenceLog } from "../../deps.ts";
import type { NormalizeImageBytes } from "../kit/image-normalize.ts";
import type { ClaudeRuntimeOverrides } from "./env.ts";
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
/** What a spawn needs from the connection: WHOSE runtime dir and WHICH token — the catalog warm runs before a
 *  full `Resolved` exists, so this is the narrow shape both it and a turn hand in. */
export interface AgentSdkDeps {
  readonly now: () => number;
  readonly log: InferenceLog;
  readonly query: typeof query;
  readonly sessionStore: SessionStore;
  readonly sessionWriter?: SessionEntryWriter | undefined;
  /** The shared outbound-image seam (MA-10): a summarize item's images ride the SDK streaming-input prompt. */
  readonly normalizeImageBytes: NormalizeImageBytes;
  /** The TIMER seam every bound in this backend arms through — injected so a test trips a bound by hand. */
  readonly scheduleTimeout: (fn: () => void, ms: number) => () => void;
  /** Live getter for the max in-flight summarize workers — read per BATCH so an admin retune applies. */
  readonly summarizeConcurrency: () => number;
  readonly captureWire?: WireCaptureSink | undefined;
  /** Opt-in subprocess stderr at debug level. */
  readonly debug: boolean;
  /** The per-connection spawn env: the connection's token + the funder's runtime dir + the host baseline. */
  readonly childEnv: (connection: SpawnIdentity, overrides?: ClaudeRuntimeOverrides) => Record<string, string | undefined>;
}

/** `consumeTurnStream` parameter shape. */
export interface TurnStreamContext {
  readonly turnId?: string | undefined;
  readonly model: ModelId;
  readonly providerId: string;
  readonly resumed: boolean;
  /** The spend totals the resumed transcript saved, which this turn's result carries forward; null when a saved
   *  entry was unreadable, which leaves the turn's cost unrecorded. */
  readonly savedTotals: AgentSdkSessionTotals | null;
  readonly disposition?: SeededSessionDecision["disposition"] | undefined;
  readonly now: () => number;
  readonly chatId?: ChatId | undefined;
  readonly onEvent?: ((event: ChatEvent) => void) | undefined;
  readonly onDelta?: ((event: ChatDeltaEvent) => void) | undefined;
  readonly onSessionId?: ((sessionId: AgentSdkSessionId) => void) | undefined;
  readonly configuredMaxOutputTokens?: number | null | undefined;
  readonly configuredMaxContextTokens?: number | null | undefined;
  readonly probeContextUsage?: (() => Promise<ContextUsage | undefined>) | undefined;
  readonly stderrTail?: (() => string) | undefined;
  /** True when the request carried a `responseFormat` (`outputFormat: json_schema` mounted). */
  readonly expectStructured?: boolean | undefined;
  /** True when the request's TERMINAL tools actually MOUNTED (D112 R1). */
  readonly captureTerminalTools?: boolean | undefined;
  /** What the spawned runtime was told for effort (`ChatResult.appliedEffort`): `none` when thinking was disabled,
   *  the SDK effort word when one was set, `null` when neither (the runtime's own default — unrecorded). */
  readonly appliedEffort: EffortLevel | null;
  /** Every credential literal this spawn ran under. A failure's runtime text is scrubbed against it before it
   *  becomes a `ProviderError` message, which `invalid` shows to the user. */
  readonly secrets: ProviderScrubSet;
}
