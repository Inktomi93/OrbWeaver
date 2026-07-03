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
  ChatContentPart,
  GroupConfig,
  InviteView,
  MessageView,
  ParticipantView,
  SpeakerRef,
  TurnAbortReason,
} from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { UserIntent } from "@orb/contracts/preset";
import type { CharacterId, ChatId, MessageId, PersonaId, UserId } from "@orb/kit/ids";
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
/** The output axis (per-room generation — Part III §7): `per-speaker` (one msg per speaker, `{{char}}`=that
 *  speaker) vs `narrator` (one call voices the cast). Derived from {@link GroupConfig} (no inline re-spell). */
export type GroupOutput = GroupConfig["output"];
/** The card-scope axis — `merged` (all member cards in one block; required for narrator) vs `scoped` (own card
 *  + egocentric history). Lives ONLY on the `per-speaker` arm (`narrator ⇒ merged`, schema-unrepresentable). */
export type CardScope = Extract<GroupConfig, { output: "per-speaker" }>["cardScope"];

/** The per-speaker SHAPE axis a group round resolves and threads onto {@link TurnPrep} (chat.md Part III §7 —
 *  two-axis generation). ABSENT on the prep ⇒ the single-speaker core's pinned default (`per-speaker`/`merged`/
 *  no fold, `{{char}}`=the assemble ctx's primary) — so solo is byte-identical (D16) and the chunk-9 pipeline
 *  tests are unchanged. The arbitration/round-driver chunk SETS it per resolved speaker. */
export interface TurnSpeakerShape {
  readonly output: GroupOutput;
  readonly cardScope: CardScope;
  /** The egocentric scoped target (`cardScope: "scoped"`); null for merged / narrator / solo. */
  readonly scopedTargetId: CharacterId | null;
  /** The assistant-speaker label SHAPE name-stamps (`{{char}}`): the speaking character's name (per-speaker)
   *  or the joined-cast name (narrator). Overrides the assemble ctx's primary `character.name`. */
  readonly speakerName: string;
  /** The ACTIVE speaker's identity (D60) — the per-speaker card selection keys on this to pick the speaker's
   *  card (`ctx.character`) + the co-speakers off the immutable ctx's `castMembers`. A `character` or an
   *  `agent` (its card = the resolved soul). */
  readonly speakerRef: SpeakerRef;
}

export const TURN_KINDS = [
  "send",
  "swipe",
  "continue",
  "generate",
  "impersonate",
  "opening",
  "auto",
  "force",
  "simple-send",
] as const;
export type TurnKind = (typeof TURN_KINDS)[number];

/**
 * The persist MODE for a turn's generated output (chat.md Part III — the per-MODE persist step the ONE engine
 * lifecycle parametrizes; D26). ABSENT on a {@link TurnPrep} ⇒ `new-slot` assistant (the chunk-9 default: a
 * fresh assistant slot at `maxSeq+1`). The belts → turnStarted → pipeline → emit spine is SHARED across all
 * modes; only the persist step + the canon-context truncation differ:
 *   • `new-slot`       — a fresh slot+variant at the canon tail. `role:"assistant"` (send/generate/force) or
 *                        `role:"user"` (impersonate — human-voiced, D26). Context = the FULL canon.
 *   • `append-variant` — swipe/regenerate: APPEND a variant to an EXISTING assistant slot + select it (slot
 *                        attribution unchanged — D26). Context = the canon UP TO (excluding) the slot.
 *   • `continue`       — extend the target slot's SELECTED variant in place: snapshot `preContinue*`, append
 *                        the continuation, record `lastContinuation*` (D26 undo state). Context = the canon UP
 *                        TO AND INCLUDING the slot (+ a continue nudge on `appendUserTurn`).
 */
export type TurnPersist =
  | {
      readonly mode: "new-slot";
      /** The slot role — `assistant` (a normal turn) or `user` (impersonate; D26 — human-voiced). */
      readonly role: MessageRole;
      /** The human author for a `role:"user"` slot (impersonate — the responsible human); null otherwise. */
      readonly authorUserId?: UserId | null | undefined;
      /** The persona voicing a `role:"user"` slot (impersonate); null otherwise. */
      readonly personaId?: PersonaId | null | undefined;
    }
  | { readonly mode: "append-variant"; readonly targetMessageId: MessageId }
  | { readonly mode: "continue"; readonly targetMessageId: MessageId };

// ─────────────────────────────────────────────────────────────────────────────
// The role-call request/response (the ONE turn dispatch — chat.md §2)
// ─────────────────────────────────────────────────────────────────────────────

/** One shaped history message handed to the role on the wire (chat.md SHAPE output). The content is the
 *  post-SHAPE text (squash + name-stamp applied). NB: the multimodal SEND model (D45 `ChatHistoryMessage`
 *  → content-parts) is NOT yet homed cross-package — this is the pre-D45 text shape; the engine chunk
 *  extends it to content-parts when D45 lands (FLAGGED). */
export interface TurnMessage {
  readonly role: MessageRole;
  /** The send-path content (D45): a content-part array produced ONCE at the engine REQUEST seam by tokenizing
   *  the shaped string body + resolving embedded image refs (asset→CAS URL, external→gated). A text-only turn
   *  is a one-element `[{type:"text"}]` (byte-identical to the pre-D45 string path); a non-vision model never
   *  receives image parts (the engine drops them + emits a `warning` bus event). The text transforms upstream
   *  (assemble/SHAPE) still operate on the STRING — parts exist only from here out to the wire. */
  readonly content: readonly ChatContentPart[];
  /** The per-participant label for the `completion` names-behavior (names.ts) — set into the OpenAI-spec
   *  `name` field at the wire (mirrors `ChatHistoryMessage.name`), content left untouched. Undefined for
   *  the default/content/none behaviors (those stamp the name into `content` instead). */
  readonly name?: string | undefined;
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
  /** The room this turn runs in — keys the lock, the canon persist (next-seq), and every bus event. (Added
   *  by the engine chunk: `AssembleContext` is chat-agnostic by design, so the turn identity the engine
   *  lifecycle needs lives HERE, supplied by the verb that already holds it. FLAGGED in the handoff.) */
  readonly chatId: ChatId;
  readonly assembleContext: AssembleContext;
  readonly connection: ResolvedConnection;
  /** D19 turn-identity triple. `triggeredBy` = the responsible human (spend/abort/attribution); `runAsUserId`
   *  = the host whose box funds the turn. The CALLER (`Principal.userId`) never reaches this path. */
  readonly triggeredBy: UserId;
  readonly runAsUserId: UserId;
  readonly kind: TurnKind;
  /** The recorded generation params (sampling/effort/budget) for this turn — built into the `TurnRequest`,
   *  recorded on the committed `message_variants.params` (D26), and read for the §8 fit reserve. */
  readonly intent: UserIntent;
  /** The roster character this single turn voices (per-speaker / narrator group-character id); null for a
   *  non-character turn. The arbitration chunk resolves WHO speaks; the engine takes the resolved speaker. */
  readonly speakerCharacterId: CharacterId | null;
  /** A synthetic trailing user turn for the intent (regen prompt / continue nudge); null for a plain send
   *  (the verb-inserted user row is already the canon tail). The regen/guided chunks populate it. */
  readonly appendUserTurn?: string | null | undefined;
  /** The Step-6b group nudge (`[Write the next reply only as X.]`), set only on a multi-speaker round (the
   *  arbitration chunk's seam); null for the single-speaker core. */
  readonly groupNudge?: string | null | undefined;
  /** The per-speaker two-axis SHAPE (output × cardScope × scopedTarget × name — chat.md Part III §7), set by
   *  the group round driver. ABSENT ⇒ the single-speaker core's pinned default (per-speaker/merged/primary
   *  name); solo stays byte-identical (D16). */
  readonly shape?: TurnSpeakerShape | undefined;
  /** The persist MODE (D26 — see {@link TurnPersist}). ABSENT ⇒ `new-slot` assistant (the chunk-9 default —
   *  a fresh assistant slot at the canon tail). swipe/regenerate set `append-variant`; continue sets
   *  `continue`; impersonate sets `new-slot` with `role:"user"`. */
  readonly persist?: TurnPersist | undefined;
  /** Lock-free execution (chat.md active-turns) — `generate` runs CONCURRENT with a locked send (it does NOT
   *  acquire the per-chat send lock; the active-turns registry is its only concurrency control). ABSENT/false
   *  ⇒ the locked path (send/swipe/continue/impersonate/force). */
  readonly lockFree?: boolean | undefined;
  /** The caller's abort signal (the active-turns handle) threaded engine → pipeline → `runChatTurn`
   *  (abort propagation). The runner aborts its in-flight request when signalled; the engine
   *  maps the resulting `AbortError` to `turnAborted(reason:"user")` then rethrows (never swallows). */
  readonly signal?: AbortSignal | undefined;
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
