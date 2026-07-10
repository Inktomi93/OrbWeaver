// infra/providers/contract/chat — the `chat` role's infra-internal request + result shapes. The DOMAIN
// builds a `ChatRequest` ONCE and calls the `chat` role; it never sees sessions, seed frames, env vars,
// or name-stamping (those are backend-internal — participants-agents-identity.md §0). Infra-internal:
// the chat result contract has NOT landed in `@orb/contracts` (role-clients FLAG), so it lives here
// behind the barrel until it does.
//
// SELECTION vs EXECUTION: the request carries the user vocab `{api, model, credential, capability}` +
// the assembled view — NEVER the sealed `runner`/`family` (those are derived inside providers from
// {api, source} and never leak). The discriminator is `api` (the
// protocol axis), NOT `runner`: `deriveRunner(api, source)` maps to the sealed backend key in
// `roles/dispatch.ts`. Statelessness: there is NO `sessionStore`/`resume`/`sessionId` here (the
// agent-sdk session is a backend-internal canon-derived cache, D8/D25).

import type { ChatContentPart } from "@orb/contracts/chat";
import type { ModelCapability, OpenRouterProviderRouting } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { CustomParameters, UserIntent } from "@orb/contracts/preset";
import type { ModelId } from "@orb/kit/ids";
import type { ChatDeltaEvent, ChatEvent, RateLimitSnapshot } from "./events";

/** The WIRE-axis role vocabulary (D48; tool-use-design/02 §1) — deliberately NOT kit `MESSAGE_ROLES`:
 *  `tool` exists only between the engine REQUEST seam and a translator (a materialized tool-result
 *  message), never as a persisted slot role, and `system` is carried by `systemPrompt`, not history. */
export const HISTORY_ROLES = ["user", "assistant", "tool"] as const;
export type HistoryRole = (typeof HISTORY_ROLES)[number];

/** One assembled history turn (OpenAI-spec shape) the stateless backends consume. `content` is a
 *  content-part array (D45); `name` carries the per-participant label the egocentric view-builder stamped.
 *  A `tool`-role message carries only `tool-result` parts (assembly materializes a recorded exchange —
 *  D48; the persisted form stays `ToolCallRecord[]` on the variant). */
export interface ChatHistoryMessage {
  readonly role: HistoryRole;
  readonly content: readonly ChatContentPart[];
  readonly name?: string | undefined;
}

/** One wire-projected tool (registry → `tools[]`, tool-use-design/02 §2). `parameters` is the JSON-Schema
 *  projection cached at registration (`additionalProperties:false`, descriptions survive) — the domain
 *  builds these via `project-wire`, never hand-rolls. */
export interface WireTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

/** The caller's tool-choice intent; each translator spells it in its own dialect. The loop's default when
 *  tools are attached is `{mode:"auto"}` — a CALLER default, never a translator constant (D48 rejected
 *  ST's hardwired `'auto'`). */
export type ToolChoice =
  | { readonly mode: "auto" }
  | { readonly mode: "none" }
  | { readonly mode: "required" }
  | { readonly mode: "tool"; readonly name: string };

/** One assembled model-emitted call off the stream (the reducer's terminal product; tool-use-design/01 §3
 *  declares the same shape — the T3 domain leaf imports THIS one down, per the D47 dependency direction).
 *  `arguments` is the RAW JSON string exactly as emitted — parsed exactly once, inside execute. */
export interface ToolCallInput {
  // biome-ignore lint/plugin/no-raw-id: PROVIDER-emitted opaque handle (OpenAI `call_…`) — provenance-faithful, joins the call to its result on the wire; never an orbweaver brand.
  readonly toolCallId: string;
  readonly name: string;
  readonly arguments: string;
}

/** The structured-output request (D48's SECOND axis — never rides `toolChoice`; tool-use-design/04 §1).
 *  `schema` is projected from the caller's zod payload schema by the SAME rule as tool args — the zod
 *  schema stays the caller's runtime validator (validation + ONE bounded retry are the CALLER's). */
export interface ResponseFormat {
  /** Schema name (OpenAI `json_schema.name`; Anthropic tool name). */
  readonly name: string;
  /** JSON Schema — projected by the same rule as tools (`additionalProperties:false`). */
  readonly schema: Record<string, unknown>;
  /** Default true. */
  readonly strict?: boolean | undefined;
  readonly description?: string | undefined;
}

/** One rendered transcript turn the agent-sdk backend seeds its session from (the `seed` field on the
 *  agent-sdk arm). Role + final rendered text only — no session vocab, no SDK shapes. */
export interface AgentSeedTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/** The mode-2 (OR-Anthropic skin) tier → OpenRouter slug map the env firewall writes into the spawn's
 *  `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL` envs (the bundled CLI can't take a slash-containing id as
 *  `options.model`, so a tier ALIAS maps to an OR slug via these envs). DERIVED by the connection domain
 *  from its two live catalogs (`deriveOrSkinTierModels`) and threaded down on the agent-sdk request arm —
 *  a STRUCTURAL shape, so infra imports no domain type (the connection `OrSkinTierModels` is identical). */
export interface OrSkinTierModels {
  readonly opus: string;
  readonly sonnet: string;
  readonly haiku: string;
}

/** How a multi-row prompt tail joins into the ONE `prompt` string an agent-sdk turn sends. Part of the
 *  `seed` contract: the backend's session↔seed comparator merges consecutive user rows with the SAME
 *  joiner, so the stored session frame (the joined prompt) still matches next turn's per-row seed. */
export const AGENT_PROMPT_TAIL_JOINER = "\n\n";

/** Fields every chat call carries regardless of which sealed backend runs it. `ownerConsented` is the
 *  turn-time owner-consent belt (D17): a `max-pro-sub` (owner's box) credential driving a turn the
 *  owner didn't trigger is refused unless consent is ON — connection/buddy thread it in (default OFF). */
interface ChatRequestCommon {
  /** Resolved by credentials, handed in — brand-protected, discriminated by `source`. */
  readonly credential: ResolvedCredential;
  /** The model id for THIS backend (curated-shortlist branded ids and OR plain ids both inhabit it). */
  readonly model: ModelId;
  /** The descriptor the runner's translator reads to shape its wire body (connection produced it). */
  readonly capability: ModelCapability;
  /** Provider-agnostic generation intent; `resolve-chat` projects it into per-backend wire knobs. */
  readonly params: UserIntent;
  /** The split system prompt (a stable static prefix + a volatile dynamic tail — cache placement). */
  readonly systemPrompt: { readonly static: string; readonly dynamic: string };
  /** The chat this turn belongs to (the agent-sdk backend keys its internal session cache by it). */
  readonly chatId?: string | undefined;
  /** Owner-consent for a `max-pro-sub`-funded turn (D17 belt; default OFF upstream). */
  readonly ownerConsented?: boolean | undefined;
  /** Cross-role cancellation. */
  readonly signal?: AbortSignal | undefined;
  readonly onDelta?: ((event: ChatDeltaEvent) => void) | undefined;
  readonly onEvent?: ((event: ChatEvent) => void) | undefined;
}

/**
 * The discriminated input every sealed chat backend consumes. Discriminator: `api`.
 *   - `agent-sdk` — a single prompt string (history is implicit in the backend's resumed session).
 *   - `chat-completions` / `responses` — an assembled `history` array (OpenAI-spec).
 * `historyCacheBreakpointFromEnd` is the offset-from-end the chat pipeline COMPUTES; the runner PLACES
 * the Anthropic `cache_control` there (Anthropic models only). `runner`/`family` never appear.
 */
export type ChatRequest = ChatRequestCommon &
  (
    | {
        readonly api: "agent-sdk";
        readonly prompt: string;
        /** The OR-skin tier→slug map the mode-2 firewall writes into `ANTHROPIC_DEFAULT_*_MODEL`. REQUIRED
         *  (not optional): the connection domain DERIVES it from its two live catalogs and the derivation
         *  NEVER throws (a cold catalog degrades to the curated shortlist), so every agent-sdk turn carries
         *  a value and the firewall holds ZERO hardcoded model strings. mode-1/mode-3 ignore it (the sub /
         *  loopback builders don't map tier aliases); it is consumed ONLY on the openrouter dispatch. */
        readonly orSkinTierModels: OrSkinTierModels;
        /** The model-visible transcript BEFORE this turn (shaped/rendered by the domain), for the
         *  backend's canon-derived session seeding (PD-7): the backend resumes its cached session when
         *  the session transcript still matches this seed, and reseeds a fresh session from it on
         *  divergence (edit/swipe/window-slide). ABSENT ⇒ no seeding — the backend falls back to the
         *  bare per-chat resume cache. NOT a session concept: plain chat-domain vocabulary (role +
         *  rendered text); sessions stay backend-internal (D8/D25). */
        readonly seed?: readonly AgentSeedTurn[] | undefined;
      }
    | {
        readonly api: "chat-completions";
        readonly history: readonly ChatHistoryMessage[];
        readonly historyCacheBreakpointFromEnd?: number | undefined;
        readonly providerRouting?: OpenRouterProviderRouting | undefined;
        readonly customParameters?: CustomParameters | undefined;
        /** ABSENT (never `[]`) on a tool-less turn — the request stays byte-identical to pre-D48. */
        readonly tools?: readonly WireTool[] | undefined;
        readonly toolChoice?: ToolChoice | undefined;
        readonly responseFormat?: ResponseFormat | undefined;
      }
    | {
        readonly api: "responses";
        readonly history: readonly ChatHistoryMessage[];
        readonly providerRouting?: OpenRouterProviderRouting | undefined;
        readonly customParameters?: CustomParameters | undefined;
        /** ABSENT (never `[]`) on a tool-less turn — the request stays byte-identical to pre-D48. */
        readonly tools?: readonly WireTool[] | undefined;
        readonly toolChoice?: ToolChoice | undefined;
        readonly responseFormat?: ResponseFormat | undefined;
      }
  );
// The `agent-sdk` arm carries NO tools/toolChoice/responseFormat by design: tools ride `mcpServers`
// via `project-mcp` (the SDK owns its loop — D47/D8), and no committed agent-sdk consumer requests
// structured output (the field lands on that arm WITH its first consumer — tool-use-design/04 §1).

/** Narrowed per-api shapes the sealed backends consume — a backend takes its own arm directly. */
export type AgentSdkChatRequest = ChatRequest & { readonly api: "agent-sdk" };
export type OpenRouterChatRequest = ChatRequest & {
  readonly api: "chat-completions" | "responses";
};

/** Normalized cross-backend "why did generation stop?" vocab. Each backend speaks its own dialect
 *  (Anthropic stop_reason, OpenAI finish_reason, Responses status); this is the ONE normalized signal.
 *  The raw value rides on `ChatResult.stopReason` as provenance. */
export const NORMALIZED_FINISH_REASONS = ["stop", "length", "filter", "tool", "other"] as const;
export type NormalizedFinishReason = (typeof NORMALIZED_FINISH_REASONS)[number];

// Provider raw stop/finish/status string → the normalized vocab. File-local (not exported): a lookup
// table, not a boundary type.
const FINISH_REASON_MAP: Readonly<Record<string, NormalizedFinishReason>> = {
  end_turn: "stop",
  stop: "stop",
  stop_sequence: "stop",
  completed: "stop",
  max_tokens: "length",
  length: "length",
  max_output_tokens: "length",
  model_context_window_exceeded: "length",
  // agent-sdk TerminalReason dialect — the loop-level "ran out of room" outcomes normalize to length.
  prompt_too_long: "length",
  budget_exhausted: "length",
  content_filter: "filter",
  refusal: "filter",
  tool_use: "tool",
  tool_calls: "tool",
  function_call: "tool",
};

/** Map any backend's raw stop/finish/status string → the normalized vocab. `null`/empty in → `null`
 *  out; an unrecognized non-null value → `"other"` (so it is never silently a `"stop"`). */
export function normalizeFinishReason(
  raw: string | null | undefined,
): NormalizedFinishReason | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  return FINISH_REASON_MAP[raw.toLowerCase()] ?? "other";
}

/** The "how full is my context window" snapshot for one turn — an SDK-FREE projection of the agent-sdk
 *  `getContextUsage()` control response (only the four operator-legible aggregates; the per-category /
 *  grid / memory-file breakdown is deliberately NOT surfaced — it is a UI-render shape, not turn
 *  economics, and would leak SDK-internal detail through the contract). Present ONLY when the backend
 *  supports the control call AND the best-effort probe returned in time; ABSENT otherwise (a probe
 *  failure/timeout must never fail or delay the turn). Anthropic-family (agent-sdk) only; `undefined` on
 *  the stateless backends, which have no equivalent control channel. */
export interface ContextUsage {
  /** Total tokens currently occupying the context window (system + tools + messages + memory + …). */
  readonly totalTokens: number;
  /** The window's hard token ceiling (the SDK's `maxTokens`). */
  readonly maxTokens: number;
  /** Fill fraction the SDK reports (`totalTokens / maxTokens`-ish; the SDK owns the exact math). */
  readonly percentage: number;
  /** The model the usage was computed for (SDK `model`) — provenance for a mid-chat model swap. */
  readonly model: string;
}

/** The health of ONE configured MCP server after an AGENT turn — an SDK-FREE projection of the agent-sdk
 *  `Query.mcpServerStatus()` entry (name + status + the optional failed-server error). Homed HERE beside
 *  {@link ContextUsage} (not in `agent.ts`) because it rides the shared {@link ChatResult}; keeping it in
 *  `chat.ts` keeps the contract files acyclic. Best-effort: the backend probes the live control channel
 *  after the stream drains and maps each entry here. Today the only configured server is the in-process
 *  tool server, so a healthy turn reports one `connected` entry; the shape EXISTS so a reworked buddy
 *  attaching external MCP servers can read per-server health without importing the SDK. `status` is the
 *  SDK's own vocab passed through as a string (`connected`/`failed`/`needs-auth`/`pending`/`disabled`);
 *  `error` is the bounded CLI diagnostic on a failed server (never model/tool content). */
export interface AgentMcpServerHealth {
  readonly name: string;
  readonly status: string;
  readonly error?: string | undefined;
}

/** Per-phase upstream cost breakdown on {@link ChatUsage}. */
export interface CostDetails {
  /** Total upstream inference cost (= promptUsd + completionUsd). */
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
  /** Cache-creation tokens by TTL bucket — Anthropic/sdk only; `null` on openrouter. */
  readonly cacheCreation5mTokens: number | null;
  readonly cacheCreation1hTokens: number | null;
  /** Tokens used for CoT reasoning; `null` when the path doesn't report it. */
  readonly reasoningTokens: number | null;
  /** Model context window — drives the context-fill meter; `null` when unknown. */
  readonly contextWindow: number | null;
  /** Output ceiling the backend reports/echoes; `null` when unavailable. */
  readonly maxOutputTokens: number | null;
  /** Web-search tool calls this turn (agent-sdk only; 0 in the locked config). */
  readonly webSearchRequests: number;
  readonly costUsd: number;
  /** Per-phase cost breakdown (OpenRouter usage.costDetails); `null` on the sub path. */
  readonly costDetails: CostDetails | null;
  /** True when billed against a BYOK credential rather than our OpenRouter credits; `null` when N/A. */
  readonly isByok: boolean | null;
}

/** The result EVERY chat/agent backend returns. No `sessionId` (the session is backend-internal). */
export interface ChatResult {
  readonly reply: string;
  /** The reducer-assembled model-emitted tool calls (D48; tool-use-design/02 §6) — the T4 loop reads
   *  these off the normal turn result. ABSENT on a tool-less turn (never `[]`). */
  readonly toolCalls?: readonly ToolCallInput[] | undefined;
  /** Accumulated CoT / thinking text, separate from `reply`. Empty when reasoning is off/none. */
  readonly reasoning: string;
  /** True when the model reasoned but the trace was WITHHELD (agent-sdk `redacted_thinking` blocks —
   *  encrypted CoT on the OR-skin path; the sub path signs+empties raw CoT). Distinguishes "thought,
   *  trace withheld" (empty `reasoning` + this true) from "no thinking at all" (both empty/false).
   *  Always `false` on backends that don't emit redacted thinking. */
  readonly reasoningRedacted: boolean;
  /** Raw provider stop string — provenance for `stopReason`/`finishReason`. */
  readonly stopReason: string | null;
  /** The raw terminal reason string the backend reported (agent-sdk dialect); provenance only. */
  readonly terminalReason: string | null;
  /** NORMALIZED cross-backend finish reason — query this, not the raw. */
  readonly finishReason: NormalizedFinishReason | null;
  /** Time-to-first-token (ms), when reported. */
  readonly ttftMs: number | null;
  /** agent-sdk cold-start indicator: whether a pre-warmed subprocess spare was claimed for this turn (a
   *  miss means full spawn latency). `null` on stateless backends / when the SDK doesn't report it. */
  readonly warmSpareClaimed: boolean | null;
  /** API-only duration (ms); excludes subprocess spawn overhead; `null` when unavailable. */
  readonly durationApiMs: number | null;
  /** Non-null when transient API errors occurred but retries recovered the turn. */
  readonly apiErrorStatus: number | null;
  readonly numTurns: number;
  readonly usage: ChatUsage;
  /** How full the context window is AFTER this turn (agent-sdk `getContextUsage()`) — the long-RP fill
   *  signal. ABSENT when the backend has no context-usage control channel or the best-effort probe
   *  failed / timed out (never blocks or fails the turn). */
  readonly contextUsage?: ContextUsage | undefined;
  /** Per-server MCP health AFTER an AGENT turn (agent-sdk `Query.mcpServerStatus()`, best-effort). Present
   *  only on the agent-mode path when the probe returned; ABSENT on roleplay turns (no MCP server) and when
   *  the probe failed/timed out. An SDK-free {@link AgentMcpServerHealth} projection — see its contract doc.
   *  Today the sole entry is the in-process tool server; the field earns its place as the seam a reworked
   *  buddy attaching external MCP servers reads per-server health from. */
  readonly mcpServerHealth?: readonly AgentMcpServerHealth[] | undefined;
  /** Compaction / retry / rate-limit / status / auth events seen this turn. */
  readonly events: readonly ChatEvent[];
  /** Latest rate-limit snapshot seen this turn, if any. */
  readonly rateLimit: RateLimitSnapshot | null;
}
