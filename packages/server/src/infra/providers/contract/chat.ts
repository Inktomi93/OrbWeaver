// The chat role's infra-internal request + result shapes. The domain builds a ChatRequest once and calls
// the chat role; it never sees sessions, seed frames, env vars, or name-stamping (backend-internal only).
// Discriminator is `api` (the protocol axis), never the sealed `runner`/`family` — those never leak here.

import type { ChatContentPart } from "@orb/contracts/chat";
import type { ModelCapability, OpenRouterProviderRouting } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { CustomParameters, UserIntent } from "@orb/contracts/preset";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { ModelId } from "@orb/kit/ids";
import type { ChatDeltaEvent, ChatEvent, RateLimitSnapshot } from "./events";

// The structured-output request vocabulary lives at its cross-boundary home (D79); re-exported here so the
// infra wire arms + the `#providers` barrel keep importing it from the chat-role contract they already read.
export type { ResponseFormat } from "@orb/contracts/role-clients";

// Deliberately not kit MESSAGE_ROLES: `tool` exists only between the engine request seam and a translator
// (never a persisted slot role). `system` normally rides `systemPrompt`, not history — the ONE exception
// is a capability-kept mid-conversation system injection row (`turns.midConversationSystem`, depth-0 at
// the tail), which each translator delivers over its wire's own system-authority channel: a real
// `system` message on the array-shaped wires; folded into the dynamic-context hook on the agent-sdk arm
// (the compose split extracts it — see `entry/compose/chat.ts`).
export const HISTORY_ROLES = ["user", "assistant", "tool", "system"] as const;
export type HistoryRole = (typeof HISTORY_ROLES)[number];

/** One assembled history turn (OpenAI-spec shape). `name` carries the per-participant label the view-builder stamped. */
export interface ChatHistoryMessage {
  readonly role: HistoryRole;
  readonly content: readonly ChatContentPart[];
  readonly name?: string | undefined;
}

/** One wire-projected tool (registry → `tools[]`). `parameters` is the JSON-Schema projection cached at registration. */
export interface WireTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

/** The caller's tool-choice intent; each translator spells it in its own dialect. */
export type ToolChoice =
  | { readonly mode: "auto" }
  | { readonly mode: "none" }
  | { readonly mode: "required" }
  | { readonly mode: "tool"; readonly name: string };

/** One assembled model-emitted call off the stream. `arguments` is the raw JSON string, parsed exactly once inside execute. */
export interface ToolCallInput {
  // @orb-gate-ignore no-raw-id PROVIDER-emitted opaque handle (OpenAI `call_…`) — provenance-faithful, joins the call to its result on the wire; never an orbweaver brand.
  readonly toolCallId: string;
  readonly name: string;
  readonly arguments: string;
}

/** One rendered transcript turn the agent-sdk backend seeds its session from. Role + final text only — no session vocab. */
export interface AgentSeedTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/** Mode-2 (OR-Anthropic skin) tier → OpenRouter slug map, written into the spawn's ANTHROPIC_DEFAULT_*_MODEL envs. */
export interface OrSkinTierModels {
  readonly opus: string;
  readonly sonnet: string;
  readonly haiku: string;
}

/** How a multi-row prompt tail joins into the one `prompt` string an agent-sdk turn sends. The session↔seed
 *  comparator merges consecutive user rows with this SAME joiner, so a stored session frame still matches next turn's seed. */
export const AGENT_PROMPT_TAIL_JOINER = "\n\n";

/** Fields every chat call carries regardless of which sealed backend runs it. */
interface ChatRequestCommon {
  readonly credential: ResolvedCredential;
  readonly model: ModelId;
  readonly capability: ModelCapability;
  readonly params: UserIntent;
  /** Split system prompt: a stable static prefix + a volatile dynamic tail (cache placement). */
  readonly systemPrompt: { readonly static: string; readonly dynamic: string };
  readonly chatId?: string | undefined;
  /** Owner-consent for a max-pro-sub-funded turn driven by someone other than the owner (default OFF). */
  readonly ownerConsented?: boolean | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly onDelta?: ((event: ChatDeltaEvent) => void) | undefined;
  readonly onEvent?: ((event: ChatEvent) => void) | undefined;
}

/**
 * The discriminated input every sealed chat backend consumes. Discriminator: `api`.
 *   - `agent-sdk` — a single prompt string (history is implicit in the backend's resumed session).
 *   - `chat-completions` / `responses` — an assembled `history` array (OpenAI-spec).
 */
export type ChatRequest = ChatRequestCommon &
  (
    | {
        readonly api: "agent-sdk";
        readonly prompt: string;
        /** Required, never optional: connection always derives it (degrading to the curated shortlist on
         *  a cold catalog), so the firewall holds zero hardcoded model strings. */
        readonly orSkinTierModels: OrSkinTierModels;
        /** Model-visible transcript before this turn, for canon-derived session seeding (resumes the
         *  cached session when it still matches; reseeds on divergence). Absent ⇒ falls back to the bare per-chat resume cache. */
        readonly seed?: readonly AgentSeedTurn[] | undefined;
        /** The in-process MCP tool server (the domain's resolved tool set projected via
         *  `toAgentToolServer`) — the STATEFUL wire's tool channel: the SDK owns the loop and invokes the
         *  wrapped handlers in-process (the ONE executeToolCalls path). Absent ⇒ the tool-less firewall
         *  base (`mcpServers:{}` + `maxTurns:1`) — byte-identical to pre-tools. The cowork denylist
         *  (`disallowedTools`) holds regardless. */
        readonly toolServer?: unknown;
        /** Tool-loop round ceiling when `toolServer` rides (maxTurns = rounds + the final reply). */
        readonly toolTurnLimit?: number | undefined;
        /** Structured output via the SDK's own `outputFormat: json_schema` (schema bound-stripped for the
         *  Anthropic wire) — honored on both agent-sdk skins (sub / OR skin). Absent ⇒ prose. */
        readonly responseFormat?: ResponseFormat | undefined;
        /** TERMINAL tools (D112 R1 — the folded state extraction) declared to the model on THIS completion and
         *  then abandoned: the backend mounts them as a SEPARATE in-process MCP server, denies the call at the
         *  `PreToolUse` seam (so nothing executes and no second model call is paid), and hands the co-emitted
         *  calls back on {@link ChatResult.toolCalls}. The same `WireTool` shape the array wires put in
         *  `tools[]` — the DELIVERY differs per wire, the declaration does not. Absent ⇒ byte-identical to a
         *  tool-less turn. Orthogonal to `toolServer` (registry tools): both may ride one turn. */
        readonly terminalTools?: readonly WireTool[] | undefined;
      }
    | {
        readonly api: "chat-completions";
        readonly history: readonly ChatHistoryMessage[];
        readonly historyCacheBreakpointFromEnd?: number | undefined;
        readonly providerRouting?: OpenRouterProviderRouting | undefined;
        readonly customParameters?: CustomParameters | undefined;
        readonly tools?: readonly WireTool[] | undefined;
        readonly toolChoice?: ToolChoice | undefined;
        readonly responseFormat?: ResponseFormat | undefined;
      }
    | {
        readonly api: "responses";
        readonly history: readonly ChatHistoryMessage[];
        readonly providerRouting?: OpenRouterProviderRouting | undefined;
        readonly customParameters?: CustomParameters | undefined;
        readonly tools?: readonly WireTool[] | undefined;
        readonly toolChoice?: ToolChoice | undefined;
        readonly responseFormat?: ResponseFormat | undefined;
      }
  );
// The agent-sdk arm carries no wire `tools[]`/`toolChoice`: the SDK owns the wire body and never reads an
// OpenAI-shaped tools array. Its two tool channels are MCP mounts instead — `toolServer` (REGISTRY tools: the
// SDK runs the loop and executes them) and `terminalTools` (DECLARE+CAPTURE: denied at PreToolUse, never
// executed, never recursed on).

/** Narrowed per-api shapes the sealed backends consume — a backend takes its own arm directly. */
export type AgentSdkChatRequest = ChatRequest & { readonly api: "agent-sdk" };
export type OpenRouterChatRequest = ChatRequest & {
  readonly api: "chat-completions" | "responses";
};

/** Normalized cross-backend "why did generation stop?" vocab. Raw value rides on `ChatResult.stopReason` as provenance. */
export const NORMALIZED_FINISH_REASONS = ["stop", "length", "filter", "tool", "other"] as const;
export type NormalizedFinishReason = (typeof NORMALIZED_FINISH_REASONS)[number];

const FINISH_REASON_MAP: Readonly<Record<string, NormalizedFinishReason>> = {
  end_turn: "stop",
  stop: "stop",
  stop_sequence: "stop",
  completed: "stop",
  max_tokens: "length",
  length: "length",
  max_output_tokens: "length",
  model_context_window_exceeded: "length",
  prompt_too_long: "length",
  budget_exhausted: "length",
  content_filter: "filter",
  refusal: "filter",
  tool_use: "tool",
  tool_calls: "tool",
  function_call: "tool",
};

/** Map any backend's raw stop/finish/status string to the normalized vocab; unrecognized non-null → "other". */
export function normalizeFinishReason(raw: string | null | undefined): NormalizedFinishReason | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  return FINISH_REASON_MAP[raw.toLowerCase()] ?? "other";
}

/** "How full is my context window" snapshot for one turn — an SDK-free projection; present only when the
 *  backend supports the control call and the best-effort probe returned in time. */
export interface ContextUsage {
  readonly totalTokens: number;
  readonly maxTokens: number;
  readonly percentage: number;
  readonly model: string;
}

/** Health of one configured MCP server after an agent turn — an SDK-free projection, best-effort. */
export interface AgentMcpServerHealth {
  readonly name: string;
  readonly status: string;
  readonly error?: string | undefined;
}

/** Per-phase upstream cost breakdown on {@link ChatUsage}. */
export interface CostDetails {
  readonly totalUsd: number;
  readonly promptUsd: number;
  readonly completionUsd: number;
}

/** Token + cost accounting for one chat turn. */
export interface ChatUsage {
  readonly model: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly cacheCreation5mTokens: number | null;
  readonly cacheCreation1hTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly contextWindow: number | null;
  readonly maxOutputTokens: number | null;
  readonly webSearchRequests: number;
  readonly costUsd: number;
  readonly costDetails: CostDetails | null;
  /** True when billed against a BYOK credential rather than our OpenRouter credits; null when N/A. */
  readonly isByok: boolean | null;
}

/** The result every chat/agent backend returns. No `sessionId` — the session is backend-internal. */
export interface ChatResult {
  readonly reply: string;
  readonly toolCalls?: readonly ToolCallInput[] | undefined;
  readonly reasoning: string;
  /** True when the model reasoned but the trace was withheld; distinguishes that from "no thinking at all". */
  readonly reasoningRedacted: boolean;
  readonly stopReason: string | null;
  readonly terminalReason: string | null;
  readonly finishReason: NormalizedFinishReason | null;
  readonly ttftMs: number | null;
  /** agent-sdk cold-start indicator: a miss means full spawn latency; null on stateless backends. */
  readonly warmSpareClaimed: boolean | null;
  readonly durationApiMs: number | null;
  /** Non-null when transient API errors occurred but retries recovered the turn. */
  readonly apiErrorStatus: number | null;
  readonly numTurns: number;
  /** The upstream OpenRouter generation handle (`gen-…`) this turn billed under — the key
   *  `connection.orGenerationCost` settles the per-message cost with (PD-137). Absent/null on a backend
   *  that surfaces no such handle (agent-sdk / the responses api / a BYO endpoint). */
  readonly generationId?: string | null | undefined;
  readonly usage: ChatUsage;
  /** How full the context window is after this turn — absent when the probe failed/timed out. */
  readonly contextUsage?: ContextUsage | undefined;
  readonly mcpServerHealth?: readonly AgentMcpServerHealth[] | undefined;
  readonly events: readonly ChatEvent[];
  readonly rateLimit: RateLimitSnapshot | null;
}
