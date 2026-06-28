// infra/providers/contract/chat — the `chat` role's infra-internal request + result shapes. The DOMAIN
// builds a `ChatRequest` ONCE and calls the `chat` role; it never sees sessions, seed frames, env vars,
// or name-stamping (those are backend-internal — participants-agents-identity.md §0). Infra-internal:
// the chat result contract has NOT landed in `@orb/contracts` (role-clients FLAG), so it lives here
// behind the barrel until it does.
//
// SELECTION vs EXECUTION: the request carries the user vocab `{api, model, credential, capability}` +
// the assembled view — NEVER the sealed `runner`/`family` (those are derived inside providers from
// {api, source} and never leak; connection.md invariants 1 & 6). The discriminator is `api` (the
// protocol axis), NOT `runner`: `deriveRunner(api, source)` maps to the sealed backend key in
// `roles/dispatch.ts`. Statelessness: there is NO `sessionStore`/`resume`/`sessionId` here (the
// agent-sdk session is a backend-internal canon-derived cache, D8/D25).

import type { ModelCapability, OpenRouterProviderRouting } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { CustomParameters, UserIntent } from "@orb/contracts/preset";
import type { ModelId } from "@orb/kit/ids";
import type { ChatDeltaEvent, ChatEvent, RateLimitSnapshot } from "./events";

/** A single part of a history turn's content (D45 multimodal send). A turn is ALWAYS a content-part array;
 *  a text-only turn is a one-element `[{ type:"text" }]` (no `if(hasImage)` branch — the no-special-case
 *  discipline). `image.url` is the resolved, model-fetchable URL/data-URI the assembly produced (asset→URL
 *  or a gated external URL); a non-vision model never receives image parts (assembly drops them, gated by
 *  `ModelCapability.input.vision`). The per-backend image→wire mapping lands when vision-input is wired
 *  (Phase 5); until then history is text-only. */
export type ChatContentPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly url: string };

/** One assembled history turn (OpenAI-spec shape) the stateless backends consume. `content` is a
 *  content-part array (D45); `name` carries the per-participant label the egocentric view-builder stamped. */
export interface ChatHistoryMessage {
  readonly role: "user" | "assistant";
  readonly content: readonly ChatContentPart[];
  readonly name?: string | undefined;
}

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
    | { readonly api: "agent-sdk"; readonly prompt: string }
    | {
        readonly api: "chat-completions";
        readonly history: readonly ChatHistoryMessage[];
        readonly historyCacheBreakpointFromEnd?: number | undefined;
        readonly providerRouting?: OpenRouterProviderRouting | undefined;
        readonly customParameters?: CustomParameters | undefined;
      }
    | {
        readonly api: "responses";
        readonly history: readonly ChatHistoryMessage[];
        readonly providerRouting?: OpenRouterProviderRouting | undefined;
        readonly customParameters?: CustomParameters | undefined;
      }
  );

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
  /** Accumulated CoT / thinking text, separate from `reply`. Empty when reasoning is off/none. */
  readonly reasoning: string;
  /** Raw provider stop string — provenance for `stopReason`/`finishReason`. */
  readonly stopReason: string | null;
  /** The raw terminal reason string the backend reported (agent-sdk dialect); provenance only. */
  readonly terminalReason: string | null;
  /** NORMALIZED cross-backend finish reason — query this, not the raw. */
  readonly finishReason: NormalizedFinishReason | null;
  /** Time-to-first-token (ms), when reported. */
  readonly ttftMs: number | null;
  /** API-only duration (ms); excludes subprocess spawn overhead; `null` when unavailable. */
  readonly durationApiMs: number | null;
  /** Non-null when transient API errors occurred but retries recovered the turn. */
  readonly apiErrorStatus: number | null;
  readonly numTurns: number;
  readonly usage: ChatUsage;
  /** Compaction / retry / rate-limit / status / auth events seen this turn. */
  readonly events: readonly ChatEvent[];
  /** Latest rate-limit snapshot seen this turn, if any. */
  readonly rateLimit: RateLimitSnapshot | null;
}
