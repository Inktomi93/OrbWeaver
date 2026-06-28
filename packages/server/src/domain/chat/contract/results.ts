// domain/chat/contract/results — every verb's non-trivial `*Result` shape + the ENGINE types the movement
// table relocates out of `engine/` into `contract/` (the `types-in-contract` gate: exported feature types
// live here, never inline on the engine). Most reads return a `views.ts` read-model; most canon-edits return
// a `MessageView`; the bulk mutators return `void` — only the shapes that aren't one of those are declared.
//
// ENGINE TYPES (chat.md movement table — "engine inline types → chat contract/"): `TurnRequest` /
// `TurnOutcome` / `TurnPrep` / `TurnEngine` / `VariantProvenance` (+ the `TurnKind` dispatch axis). These are
// the LEAF contract the SHAPE/engine + verb-impl chunks build against — the turn path is "the domain calls a
// role, never a backend" (chat.md §2): the engine builds a {@link TurnRequest} and calls the injected
// `runChatTurn` role (see `context.ts`), which carries NO agent-sdk session/seed/runner vocab (inv §2/§3).

import type {
  AssembleContext,
  AssembledPrompt,
  InviteView,
  MessageView,
  ParticipantView,
  TurnAbortReason,
} from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { UserIntent } from "@orb/contracts/preset";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import type { ChatDetail, ChatVariables } from "./views";

// The public lifecycle-intent axis (5; bus events) + the abort-reason axis stay their ONE home in
// `@orb/contracts/chat` — re-exported type-only so the engine references one name, never re-spelled.
export type { TurnAbortReason, TurnIntent } from "@orb/contracts/chat";

// ─────────────────────────────────────────────────────────────────────────────
// The engine turn-dispatch axis
// ─────────────────────────────────────────────────────────────────────────────

/** The 8 turn KINDS the engine drives (chat.md §"What this domain owns" — the per-turn driver). DISTINCT
 *  from the public 5-member `TurnIntent` (the bus lifecycle axis, `@orb/contracts/chat`): this is the
 *  internal dispatch axis the engine + SHAPE switch on. NB: the movement table calls this engine type
 *  `TurnIntent`; it is RENAMED `TurnKind` here to avoid colliding with the canonical public `TurnIntent`
 *  (one home — FLAGGED in the handoff). */
export const TURN_KINDS = [
  "send",
  "swipe",
  "continue",
  "generate",
  "opening",
  "auto",
  "force",
  "simple-send",
] as const;
export type TurnKind = (typeof TURN_KINDS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// The role-call request/response (the ONE turn dispatch — chat.md §2)
// ─────────────────────────────────────────────────────────────────────────────

/** One shaped history message handed to the role on the wire (chat.md SHAPE output). The content is the
 *  post-SHAPE text (squash + name-stamp applied). NB: the multimodal SEND model (D45 `ChatHistoryMessage`
 *  → content-parts) is NOT yet homed cross-package — this is the pre-D45 text shape; the engine chunk
 *  extends it to content-parts when D45 lands (FLAGGED). */
export interface TurnMessage {
  readonly role: MessageRole;
  readonly content: string;
}

/**
 * The chat-domain turn REQUEST the engine builds and hands to the injected `runChatTurn` role (chat.md §2 —
 * "the domain calls a role, never a backend"). SDK/provider-free: it carries NO `sessionStore`/`resume`/
 * `runner`/`family` (inv §2/§3 — the agent-sdk session is sealed in `infra/providers`). The runner translates
 * THIS into its sealed `ChatTurnRequest` at the boundary.
 */
export interface TurnRequest {
  readonly connection: ResolvedConnection;
  /** The static (cache-stable) system prefix + the per-turn dynamic suffix — the BUILD product. */
  readonly prompt: AssembledPrompt;
  /** The SHAPE-shaped history (egocentric-scoped, spliced, squashed, name-stamped). */
  readonly history: readonly TurnMessage[];
  /** The recorded generation params (sampling/effort/budget) for this turn. */
  readonly intent: UserIntent;
  readonly kind: TurnKind;
  /** The §8 rolling-pair cache breakpoint offset from the tail (computed in SHAPE; the runner only PLACES
   *  the `cache_control` tag here). Null ⇒ no safe boundary this round (chat.md §8/Part III §7). */
  readonly cacheBreakpointFromEnd: number | null;
  readonly signal?: AbortSignal | undefined;
}

/** A streamed chunk from a role turn — text/reasoning deltas, then ONE terminal `final` chunk carrying the
 *  generation economics. The engine fans `text`/`reasoning` onto the chat bus as `ChatDeltaEvent`s and folds
 *  `final` into the committed `message_variants` row (D26). */
export type TurnStreamChunk =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "reasoning"; readonly text: string }
  | { readonly kind: "final"; readonly economics: TurnEconomics };

/** The post-generation economics a role turn reports (folded onto the variant — D26). All optional: a runner
 *  that doesn't report a field leaves it absent (never a fabricated zero). */
export interface TurnEconomics {
  readonly content: string;
  readonly reasoning?: string | null;
  readonly model?: string | null;
  readonly provider?: string | null;
  readonly tokensIn?: number | null;
  readonly tokensOut?: number | null;
  readonly cacheReadTokens?: number | null;
  readonly cacheWriteTokens?: number | null;
  readonly costUsd?: number | null;
  readonly contextWindow?: number | null;
  readonly ttftMs?: number | null;
  readonly finishReason?: string | null;
  readonly stopReason?: string | null;
  readonly terminalReason?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The immutable turn ctx + the injected engine driver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The immutable per-turn context (chat.md §5 — RESOLVE+GATHER produce it; BUILD+SHAPE take it + a speaker
 * and return a prompt, never mutating it). Carries the assemble ctx, the resolved connection, the
 * turn-identity triple (D19), and the turn kind. A per-speaker round re-derives SHAPE off this immutable
 * prep (+ the advancing canon) — no shared-ctx mutation (inv §4/§5).
 */
export interface TurnPrep {
  readonly assembleContext: AssembleContext;
  readonly connection: ResolvedConnection;
  /** D19 turn-identity triple. `triggeredBy` = the responsible human (spend/abort/attribution); `runAsUserId`
   *  = the host whose box funds the turn. The CALLER (`Principal.userId`) never reaches this path. */
  readonly triggeredBy: UserId;
  readonly runAsUserId: UserId;
  readonly kind: TurnKind;
}

/**
 * The injected per-turn driver the composition root builds ONCE and hands the verbs (service.ts "builds ctx +
 * one turnEngine"). `runTurn` executes the lifecycle shell (lock → preflight → plan → executeTurn → persist →
 * background) and resolves with the {@link TurnOutcome}; streaming deltas fan out over the chat bus, not the
 * return value (await-before-deliver durability — chat.md §"the chat bus"). The lock-free `runCompaction` is
 * injected INTO this engine at the root (chat.md §Decisions — compaction).
 */
export interface TurnEngine {
  readonly runTurn: (prep: TurnPrep) => Promise<TurnOutcome>;
}

/** The verb-level result of a completed (or aborted) turn — the committed message(s) joined to their selected
 *  variant (D26). A per-speaker group round commits several rows; `aborted` carries the lifecycle refusal. */
export interface TurnOutcome {
  /** The committed message(s) for this turn (≥1; a per-speaker round emits one per speaker). Empty when the
   *  turn aborted before any commit. */
  readonly messages: readonly MessageView[];
  readonly aborted: boolean;
  /** Set only when `aborted` — why the turn ended (chat.md `TURN_ABORT_REASONS`). */
  readonly abortReason?: TurnAbortReason | undefined;
}

/** Per-variant provenance recorded on each generated `message_variants` row (D26) — which turn produced it +
 *  the §8 cache hint. The static/dynamic split survives ONLY as this advisory provenance hint, never a cache
 *  gate (chat.md §8/Part II §11 — the hard boundary-gate is dead). */
export interface VariantProvenance {
  readonly kind: TurnKind;
  readonly triggeredBy: UserId;
  readonly runAsUserId: UserId;
  /** The speaker character voiced (per-speaker / narrator group-character id); null for a non-character turn. */
  readonly speakerCharacterId: CharacterId | null;
  readonly cacheBreakpointFromEnd: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verb result shapes (only those that aren't a view / MessageView / void)
// ─────────────────────────────────────────────────────────────────────────────

/** `startChat` — the lazily-created chat (+ roster) and the seeded opening, if any (greeting/verbatim/
 *  generated per the resolved `OpeningPolicy`). `opening` is null when the policy seeded no greeting. */
export interface StartChatResult {
  readonly chat: ChatDetail;
  readonly opening: TurnOutcome | null;
}

/** `forkChat` — the new deep-copied, membership-scoped fork (D27; `parentChatId` lineage). */
export interface ForkResult {
  readonly chat: ChatDetail;
}

/** `compact` — the portable compaction checkpoint produced (D25): the summary text + the seq it covers
 *  through (mirrors `chats.compactSummary`/`compactedAtSeq`). */
export interface CompactResult {
  readonly summary: string;
  readonly compactedAtSeq: number;
}

/** `getVariables`/`getStoredVariables` — the ChoiceBlock variable map (re-exported for the result surface). */
export type { ChatVariables } from "./views";

/** `reapTemporaryChats` — how many temporary chats were reaped. */
export interface ReapResult {
  readonly reaped: number;
}

// `ChatVariables` is the getVariables/getStoredVariables result (declared in views.ts; re-exported above).
export type VariablesResult = ChatVariables;

/** `createInvite` — the persisted invite (host-management view) PLUS the RAW token returned ONCE for the
 *  `/join/:token` share link. The token is stored HASHED (mirror sessions); it NEVER appears in an
 *  `InviteView` and is never persisted raw (Part III §2). */
export interface CreateInviteResult {
  readonly invite: InviteView;
  readonly token: string;
}

/** `redeemInvite` — the now-joined chat (history replays from the stamped `joinSeq` after accept) + the
 *  caller's new roster row. The ONE participant-insert chokepoint's success result (Part III §2). */
export interface RedeemInviteResult {
  readonly chat: ChatDetail;
  readonly participant: ParticipantView;
}
