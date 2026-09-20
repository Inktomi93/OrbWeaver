// The chat task's request + result shapes. The domain builds ONE `ChatRequest` around the `Resolved<"chat">`
// the runtime handed it and calls the executor; it never sees sessions, seed frames, child env or transport
// spelling. Discriminated on `api` (the protocol axis) — never on a wire or a provider id.

import type { ChatContentPart } from "@orb/contracts/chat";
import type { ChatUsage, NormalizedFinishReason } from "@orb/contracts/inference";
import type { EffortLevel, UserIntent } from "@orb/contracts/preset";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { ChatId } from "@orb/kit/ids";
import type { ChatDeltaEvent, ChatEvent, RateLimitSnapshot } from "./events.ts";
import type { Resolved } from "./resolved.ts";
import type { GeneratedImage } from "./roles.ts";

export type { ResponseFormat } from "@orb/contracts/role-clients";

// Deliberately not kit MESSAGE_ROLES: `tool` exists only between the engine request seam and a converter;
// `system` normally rides `systemPrompt` — the ONE exception is a capability-kept mid-conversation system
// row (`turns.midConversationSystem`), delivered over each wire's own system-authority channel.
export const HISTORY_ROLES = ["user", "assistant", "tool", "system"] as const;
export type HistoryRole = (typeof HISTORY_ROLES)[number];

/** The assembly's per-row hints the hosted wires forward (§8.0): a cache breakpoint on this row, a
 *  `clearAt` on a mid-conversation system row, a per-turn effort. The converter maps them; a hint the
 *  curated row says the model does not honour is dropped with a warning. NOTE the FIRST system row is
 *  hoisted by the anthropic converter, so `wireMeta` on it is inert by construction. */
export interface WireMeta {
  readonly cacheBreakpoint?: true | undefined;
  readonly clearAt?: "next_user_message" | undefined;
  readonly effort?: string | undefined;
}

/** One assembled history turn. `name` carries the per-participant label the view-builder stamped. */
export interface ChatHistoryMessage {
  readonly role: HistoryRole;
  readonly content: readonly ChatContentPart[];
  readonly name?: string | undefined;
  readonly wireMeta?: WireMeta | undefined;
}

/** One wire-projected tool (registry → `tools[]`). `parameters` is the JSON-Schema projection cached at registration. */
export interface WireTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  /** STRICT tool-input mode (audit C1): the provider constrains generation so the input ALWAYS validates,
   *  at the cost of a narrower supported schema subset. CALLER-SET, and only ever an override — what the
   *  ENDPOINT can do is `features.strictJson` (`default-on` ⇒ strict unless this says otherwise ·
   *  `declared-only` ⇒ strict only where this says so · `never` ⇒ the row has no strict mode and the ask
   *  drops loudly). Distinct from the RESPONSE-FORMAT strictness the same feature key gates: OpenAI models
   *  the two independently (`LanguageModelV4FunctionTool.strict` vs `response_format.json_schema.strict`),
   *  and every `strict` on this tree before now was the response-format one. */
  readonly strict?: boolean | undefined;
  /** Worked INPUT examples the provider shows the model alongside the schema (`input_examples` on the
   *  Anthropic wire; the openai-compatible converter has no slot and drops them). A registry tool whose
   *  arguments are easy to get subtly wrong is what this is for. */
  readonly inputExamples?: readonly Record<string, unknown>[] | undefined;
}

export type ToolChoice =
  | { readonly mode: "auto" }
  | { readonly mode: "none" }
  | { readonly mode: "required" }
  | { readonly mode: "tool"; readonly name: string };

/** One assembled model-emitted call off the stream. `arguments` is the raw JSON string, parsed once inside execute. */
export interface ToolCallInput {
  // PROVIDER-emitted opaque handle (OpenAI `call_…`) — provenance-faithful, never an orbweaver brand.
  readonly toolCallId: string;
  readonly name: string;
  readonly arguments: string;
}

/** The content a seed frame may carry — DERIVED from `ChatContentPart`, never re-spelled. Media is excluded
 *  (the agent-sdk seed has no image channel); the tool-exchange parts ride as STRUCTURE (#1605). */
export type AgentSeedBlock = Extract<ChatContentPart, { type: "text" | "tool-call" | "tool-result" }>;

/** The model's own thinking as a content part — DERIVED from `ChatContentPart`, never re-spelled. The turn
 *  produces these (`ChatResult.reasoningParts`), the record persists them, and the assembly materializes
 *  them back onto the assistant row so the next leg of a tool loop replays verified reasoning. */
export type ReasoningContentPart = Extract<ChatContentPart, { type: "reasoning" }>;

export interface AgentSeedTurn {
  readonly role: "user" | "assistant";
  readonly content: readonly AgentSeedBlock[];
}

/** How a multi-row prompt tail joins into the one `prompt` string an agent-sdk turn sends. */
export const AGENT_PROMPT_TAIL_JOINER = "\n\n";

/** THE CONTINUATION STUB — the one `prompt` an agent-sdk turn sends when the transcript has no trailing USER
 *  row. Host-authored, session-only, never persisted; it carries NO role label so content cannot imitate a
 *  turn boundary (#1593/#1607). */
export const AGENT_CONTINUATION_PROMPT_STUB = "*The scene continues.*";

interface ChatRequestCommon {
  readonly connection: Resolved<"chat">;
  readonly params: UserIntent;
  /** Split system prompt: a stable static prefix + a volatile dynamic tail (cache placement). */
  readonly systemPrompt: { readonly static: string; readonly dynamic: string };
  readonly chatId?: ChatId | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly onDelta?: ((event: ChatDeltaEvent) => void) | undefined;
  readonly onEvent?: ((event: ChatEvent) => void) | undefined;
}

/** The array-shaped wires share one arm body: an assembled history + the OpenAI-spec tool channel. */
interface HistoryChatRequest extends ChatRequestCommon {
  readonly history: readonly ChatHistoryMessage[];
  readonly tools?: readonly WireTool[] | undefined;
  readonly toolChoice?: ToolChoice | undefined;
  readonly responseFormat?: ResponseFormat | undefined;
  /** The assembly's rolling-history cache depth (`computeHistoryBreakpoint`, in ROLE SWITCHES from the end);
   *  the backend's placer turns it into the `d`/`d+2` breakpoint pair when the capability says
   *  `explicitPromptCache`. Absent ⇒ only the static system block (and any `wireMeta.cacheBreakpoint`) caches. */
  readonly cacheBreakpointDepth?: number | undefined;
  /** The preset's inline-reasoning tag pair (`reasoningParse`), present only when the user has AUTO-PARSE
   *  ON. The openai-compat transport turns an XML-shaped pair into `extractReasoningMiddleware` so the split
   *  happens at STREAM time (the F-table "Adopt" row); every other shape, and every other wire, leaves the
   *  engine's post-hoc split to do it. Absent ⇒ no inline split is wanted at all. */
  readonly reasoningTags?: { readonly prefix: string; readonly suffix: string } | undefined;
}

/**
 * The discriminated input every backend consumes:
 *   - `agent-sdk` — a single prompt string (history is implicit in the resumed session) + the seed.
 *   - `chat-completions` / `anthropic-messages` — an assembled history array.
 */
export type ChatRequest =
  | (ChatRequestCommon & {
      readonly api: "agent-sdk";
      readonly prompt: string;
      /** Model-visible transcript before this turn, for canon-derived session seeding (D8). */
      readonly seed?: readonly AgentSeedTurn[] | undefined;
      /** The in-process MCP tool server — the STATEFUL wire's tool channel; absent ⇒ the tool-less base. */
      readonly toolServer?: unknown;
      readonly toolTurnLimit?: number | undefined;
      readonly responseFormat?: ResponseFormat | undefined;
      /** TERMINAL tools (D112 R1): declared on THIS completion, denied at `PreToolUse`, the co-emitted calls
       *  handed back on {@link ChatResult.toolCalls}. */
      readonly terminalTools?: readonly WireTool[] | undefined;
    })
  | (HistoryChatRequest & { readonly api: "chat-completions" })
  | (HistoryChatRequest & { readonly api: "anthropic-messages" });

export type AgentSdkChatRequest = ChatRequest & { readonly api: "agent-sdk" };
export type OpenAiCompatChatRequest = ChatRequest & { readonly api: "chat-completions" };
export type AnthropicChatRequest = ChatRequest & { readonly api: "anthropic-messages" };

/** The per-wire raw → normalized fold. `other` is a NAMED arm for a recognised-but-unclassified value; an
 *  unrecognised non-empty string ALSO lands on `other`, and the raw string rides `stopReason` beside it. */
const FINISH_REASON_MAP: ReadonlyMap<string, NormalizedFinishReason> = new Map<string, NormalizedFinishReason>([
  ["end_turn", "stop"],
  ["stop", "stop"],
  ["stop_sequence", "stop"],
  ["completed", "stop"],
  ["max_tokens", "length"],
  ["length", "length"],
  ["max_output_tokens", "length"],
  ["model_context_window_exceeded", "length"],
  ["prompt_too_long", "length"],
  ["budget_exhausted", "length"],
  ["content_filter", "filter"],
  ["refusal", "filter"],
  ["tool_use", "tool"],
  ["tool_calls", "tool"],
  ["function_call", "tool"],
  // The Vercel V4 vocabulary (`LanguageModelV4FinishReason`).
  ["tool-calls", "tool"],
  ["content-filter", "filter"],
  ["error", "other"],
  ["other", "other"],
  ["unknown", "other"],
]);

export function normalizeFinishReason(raw: string | null | undefined): NormalizedFinishReason | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  return FINISH_REASON_MAP.get(raw.toLowerCase()) ?? "other";
}

/** "How full is my context window" after one turn — present only when the backend supports the control call. */
export interface ContextUsage {
  readonly totalTokens: number;
  readonly maxTokens: number;
  readonly percentage: number;
  readonly model: string;
}

export interface AgentMcpServerHealth {
  readonly name: string;
  readonly status: string;
  readonly error?: string | undefined;
}

/** The result every chat/agent backend returns. No session id — the session is backend-internal. */
export interface ChatResult {
  readonly reply: string;
  readonly toolCalls?: readonly ToolCallInput[] | undefined;
  readonly reasoning: string;
  /** The model's thinking as REPLAYABLE parts, in stream order, each carrying the wire's own opaque
   *  provenance (Anthropic signature / redacted payload, OpenRouter `reasoning_details`). Distinct from
   *  `reasoning`, which is the rendered prose: these are what a tool loop must hand back. Absent on the
   *  wires that surface no per-part provenance. */
  readonly reasoningParts?: readonly ReasoningContentPart[] | undefined;
  /** True when the model reasoned but the trace was withheld — a REAL redacted block, never inferred from
   *  "no text but some reasoning tokens" (that shape is also an adaptive model with display off). */
  readonly reasoningRedacted: boolean;
  /** The raw upstream stop word — declared-opaque provenance for `finishReason`. */
  readonly stopReason: string | null;
  readonly terminalReason: string | null;
  readonly finishReason: NormalizedFinishReason | null;
  readonly ttftMs: number | null;
  readonly durationApiMs: number | null;
  /** Non-null when transient API errors occurred but retries recovered the turn. */
  readonly apiErrorStatus: number | null;
  readonly numTurns: number;
  /** The provider's response id for this generation — OpenRouter's `gen-…` (the cost-settlement key), Anthropic's
   *  `msg_…` (the support handle); null where a wire reports none (agent-sdk). Opaque provenance (§5.3c class 4). */
  readonly generationId?: string | null | undefined;
  /** The reasoning effort the wire ACTUALLY CARRIED, in the preset's 7-member vocabulary (the `reasoning_effort`
   *  column's CHECK): `"none"` when the transport spelled thinking OFF, the wire word when it spelled a level,
   *  `null` when it spelled no effort field at all (a row with `features.effort: "none"`, a budget-mode turn, an
   *  SDK vocabulary drop, a mandatory-reasoning replay) — the model then reasoned at ITS default, which we do not
   *  know. The REQUESTED intent stays in `params`; this field is what the record stores (inference audit B1).
   *  Read back from the options the transport built, never recomputed from the knobs. */
  readonly appliedEffort: EffortLevel | null;
  readonly usage: ChatUsage;
  /** Wire-opaque facts the normalized core cannot carry (the agent-sdk 5m/1h cache split, warm-spare, the OR
   *  cache receipt) — keyed by provider id at the read seam into `variantMetadataSchema.providerMetadata`. */
  readonly providerMetadata?: Readonly<Record<string, unknown>> | undefined;
  /** Inline reply pictures (§6.7) — a chat model whose `output.modalities ∋ image` answered with them. */
  readonly images?: readonly GeneratedImage[] | undefined;
  readonly contextUsage?: ContextUsage | undefined;
  readonly mcpServerHealth?: readonly AgentMcpServerHealth[] | undefined;
  readonly events: readonly ChatEvent[];
  readonly rateLimit: RateLimitSnapshot | null;
}
