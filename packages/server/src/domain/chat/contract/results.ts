// Every verb's non-trivial *Result shape + the engine types that live in contract/ (exported feature types
// live here, never inline on the engine). Most reads return a views.ts read-model; most canon-edits return
// a MessageView; bulk mutators return void — only the other shapes are declared here.

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
  TurnInitiator,
} from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { ChatRoster } from "@orb/contracts/identity";
import type { CustomParameters, UserIntent } from "@orb/contracts/preset";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { CharacterId, ChatId, MessageId, PersonaId, UserId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import type { HistoryRole, ToolCallInput, ToolChoice, WireTool } from "#infra/providers";
import type { MemoryConfig, MemoryRecallInputs } from "./memory";
import type { RequestTurnParams } from "./params";
import type { ChatDetail, ChatVariables } from "./views";

export type { TurnIntent } from "@orb/contracts/chat";

/** The output axis: per-speaker (one message per speaker) vs narrator (one call voices the cast). */
export type GroupOutput = GroupConfig["output"];
/** The card-scope axis: merged (all member cards in one block) vs scoped (own card + egocentric history).
 *  Lives only on the per-speaker arm — narrator is always merged. */
type CardScope = Extract<GroupConfig, { output: "per-speaker" }>["cardScope"];

/** The per-speaker shape axis a group round resolves and threads onto {@link TurnPrep}. Absent means the
 *  single-speaker core's pinned default, so solo stays byte-identical. */
export interface TurnSpeakerShape {
  readonly output: GroupOutput;
  readonly cardScope: CardScope;
  /** The egocentric scoped target; null for merged/narrator/solo. */
  readonly scopedTargetId: CharacterId | null;
  /** The assistant-speaker label SHAPE name-stamps: the speaking character's name (per-speaker) or the
   *  joined-cast name (narrator). */
  readonly speakerName: string;
  /** The active speaker's identity — the per-speaker card selection keys on this. */
  readonly speakerRef: SpeakerRef;
}

const TURN_KINDS = ["send", "swipe", "continue", "generate", "impersonate", "opening", "auto", "force"] as const;
export type TurnKind = (typeof TURN_KINDS)[number];

/**
 * The persist mode for a turn's generated output. Absent on a {@link TurnPrep} means new-slot assistant (a
 * fresh assistant slot at maxSeq+1). The belts → turnStarted → pipeline → emit spine is shared across all
 * modes; only the persist step + canon-context truncation differ:
 *   • new-slot — a fresh slot+variant at the canon tail (role assistant or user for impersonate). Context =
 *     the full canon.
 *   • append-variant — swipe/regenerate: append a variant to an existing assistant slot + select it. Context
 *     = the canon up to (excluding) the slot.
 *   • continue — extend the target slot's selected variant in place, snapshotting undo state. Context = the
 *     canon up to and including the slot.
 */
export type TurnPersist =
  | {
      readonly mode: "new-slot";
      readonly role: MessageRole;
      /** The human author for a role:"user" slot (impersonate); null otherwise. */
      readonly authorUserId?: UserId | null | undefined;
      /** The persona voicing a role:"user" slot (impersonate); null otherwise. */
      readonly personaId?: PersonaId | null | undefined;
    }
  | { readonly mode: "append-variant"; readonly targetMessageId: MessageId }
  | { readonly mode: "continue"; readonly targetMessageId: MessageId };

/** One shaped history message handed to the role on the wire. The content is the post-SHAPE text (squash +
 *  name-stamp applied). */
export interface TurnMessage {
  /** `tool` exists only on a materialized tool-exchange row the recurse loop appends; persisted slot roles
   *  never carry it. */
  readonly role: HistoryRole;
  /** The send-path content: a content-part array produced once at the engine request seam by tokenizing
   *  the shaped string body + resolving embedded image refs. A text-only turn is a one-element text part;
   *  a non-vision model never receives image parts. */
  readonly content: readonly ChatContentPart[];
  /** The per-participant label for the `completion` names-behavior, set into the wire `name` field. */
  readonly name?: string | undefined;
}

/**
 * The chat-domain turn request the engine builds and hands to the injected `runChatTurn` role. SDK/
 * provider-free: carries no sessionStore/resume/runner/family. The runner translates this into its sealed
 * request at the boundary.
 */
export interface TurnRequest {
  readonly connection: ResolvedConnection;
  /** The chat this turn belongs to — the stateful backend keys its resume cache by it. */
  readonly chatId: ChatId;
  /** The static (cache-stable) system prefix + the per-turn dynamic suffix. */
  readonly prompt: AssembledPrompt;
  /** The SHAPE-shaped history (egocentric-scoped, spliced, squashed, name-stamped). */
  readonly history: readonly TurnMessage[];
  readonly intent: UserIntent;
  /** The preset's provider-passthrough blob (PD-148) — folded onto the wire request body UNDER the runner's
   *  owned fields (the preset-hijack firewall). Absent when the preset carries none ⇒ byte-identical request. */
  readonly customParameters?: CustomParameters | undefined;
  readonly kind: TurnKind;
  /** The owner-consent value the infra credential firewall re-verifies, already enforced by the engine's
   *  in-lock belt. */
  readonly ownerConsented: boolean;
  /** The rolling-pair cache breakpoint offset from the tail; null means no safe boundary this round. */
  readonly cacheBreakpointFromEnd: number | null;
  /** Absent (never []) on a tool-less turn, so the request stays byte-identical to pre-tools. */
  readonly tools?: readonly WireTool[] | undefined;
  readonly toolChoice?: ToolChoice | undefined;
  /** The structured-output request for this turn (D79) — set by the request-builder gate only when the model
   *  supports it; the runChatTurn translator maps it onto the wire arm's `responseFormat`. */
  readonly responseFormat?: ResponseFormat | undefined;
  readonly signal?: AbortSignal | undefined;
}

/** The per-chat macro name producer maps `renderHistoryMacros` needs to resolve a canon-history row's own
 *  macro stamps. Built by the engine after `loadCanonHistory` (the history's distinct ids aren't known in
 *  turn prep). */
export interface HistoryMacroNames {
  readonly characterNamesById: ReadonlyMap<CharacterId, RowCharacterName>;
  readonly personaNamesById: ReadonlyMap<PersonaId, RowPersonaName>;
}

/** A streamed chunk from a role turn: text/reasoning deltas, then one terminal final chunk carrying the
 *  generation economics. */
export type TurnStreamChunk =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "reasoning"; readonly text: string }
  | { readonly kind: "final"; readonly economics: TurnEconomics };

/** The post-generation economics a role turn reports, folded onto the variant. All optional: a runner that
 *  doesn't report a field leaves it absent, never a fabricated zero. */
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
  readonly maxOutputTokens?: number | null;
  readonly reasoningEffort?: string | null;
  readonly ttftMs?: number | null;
  readonly finishReason?: string | null;
  readonly stopReason?: string | null;
  readonly terminalReason?: string | null;
  /** The upstream OpenRouter generation handle (`gen-…`) this turn billed under — the PD-137 cost key,
   *  folded onto the variant. Absent/null on a backend that doesn't surface one (agent-sdk / responses). */
  readonly generationId?: string | null;
  /** The reducer-assembled model-emitted calls; the loop pivots on finishReason === "tool" and reads these. */
  readonly toolCalls?: readonly ToolCallInput[] | undefined;
}

/**
 * The immutable per-turn context (RESOLVE+GATHER produce it; BUILD+SHAPE take it + a speaker and return a
 * prompt, never mutating it). A per-speaker round re-derives SHAPE off this immutable prep — no shared-ctx
 * mutation.
 */
export interface TurnPrep {
  /** The room this turn runs in — keys the lock, the canon persist, and every bus event. */
  readonly chatId: ChatId;
  readonly assembleContext: AssembleContext;
  readonly connection: ResolvedConnection;
  /** `triggeredBy` is the responsible human; `runAsUserId` is the host whose box funds the turn. The
   *  caller (Principal.userId) never reaches this path. */
  readonly triggeredBy: UserId;
  readonly runAsUserId: UserId;
  /** The turn's origin (automation-design/03 §4 — the cascade guard's non-human-initiator seam). Absent ⇒
   *  a human turn (`'human'`/depth 0 — the DB column defaults), so every human/character/agent verb stays
   *  byte-identical. An automation `requestTurn` (A6) threads `'automation'` + `parentDepth + 1`; the engine
   *  stamps both onto the reply slot (new-slot only — a swipe/continue re-voices nothing), and `getTurnOrigin`
   *  reads them back. NOT a bus-event field (the D19/D50 allowlist). */
  readonly initiator?: TurnInitiator | undefined;
  readonly automationDepth?: number | undefined;
  readonly kind: TurnKind;
  readonly intent: UserIntent;
  /** The host's `UserSettings.chat.customStoppingStrings` (PD-146), merged into the generation request's
   *  stop set at the pipeline REQUEST seam (never mutating `intent`). Absent/empty ⇒ the request stop is
   *  exactly `intent.stop` — byte-identical to a host who never set custom stops. */
  readonly extraStopSequences?: readonly string[] | undefined;
  /** The resolved host memory config — the same resolution recall reads. Threaded so a host who disabled
   *  memory doesn't pay the summarizer/embed every turn. Absent falls back to the build's baked defaults;
   *  mode:"off" skips the whole build. */
  readonly memoryConfig?: MemoryConfig | null | undefined;
  /** The ROUND-LEVEL recall inputs (gathered once) the engine re-runs `recallMemory` with PER SCOPED SPEAKER —
   *  each real speaker's OWN bucket + its join/leave `witnessing` horizons (D6). Absent / null ⇒ no per-speaker
   *  recall (merged/narrator/solo, memory off, or empty cast) ⇒ the round-level `assembleContext.memory` stands
   *  byte-identically. Shared across the round's speakers (the recent-window + name-map are speaker-invariant). */
  readonly memoryRecall?: MemoryRecallInputs | null | undefined;
  /** The roster character this single turn voices; null for a non-character turn. */
  readonly speakerCharacterId: CharacterId | null;
  /** A synthetic trailing user turn (regen prompt/continue nudge); null for a plain send. */
  readonly appendUserTurn?: string | null | undefined;
  /** The group nudge, set only on a multi-speaker round; null for the single-speaker core. */
  readonly groupNudge?: string | null | undefined;
  /** The union of gather-contributed tool names. Absent/empty means no tools ride, and the loop degenerates
   *  to one runChatTurn call. */
  readonly attachedToolNames?: readonly string[] | undefined;
  /** rpg-design/05 §6 slot-adjacency verdict: is this turn (re)generating the assistant slot that DIRECTLY
   *  responds to the latest user message? The engine marks the turn dice-eligible (`ctx.rpg.markDicePreRollEligible`)
   *  after minting `turnId` when true, so the player's queued d20 feeds the FIRST skill check of a send /
   *  deferred-drain / swipe-of-that-slot but never a later GM/auto/director round. Absent ⇒ false (ineligible). */
  readonly respondsToLatestUserTurn?: boolean | undefined;
  /** The caller's loaded membership for chat-scoped tool ceilings; absent until a chat-scoped registrant exists. */
  readonly toolRoster?: ChatRoster | undefined;
  /** The chat-level recurse cap; absent means the engine applies the seed default. */
  readonly toolRecurseLimit?: number | undefined;
  /** The per-speaker two-axis SHAPE, set by the group round driver; absent falls back to the single-speaker
   *  core's pinned default. */
  readonly shape?: TurnSpeakerShape | undefined;
  /** The persist mode (see {@link TurnPersist}); absent means new-slot assistant. */
  readonly persist?: TurnPersist | undefined;
  /** Lock-free execution — generate runs concurrent with a locked send. Absent/false means the locked path. */
  readonly lockFree?: boolean | undefined;
  /** The caller's abort signal, threaded engine → pipeline → runChatTurn. The engine maps a resulting
   *  AbortError to turnAborted(reason:"user") then rethrows. */
  readonly signal?: AbortSignal | undefined;
}

/**
 * The injected per-turn driver the composition root builds once and hands the verbs. `runTurn` executes the
 * lifecycle shell and resolves with the {@link TurnOutcome}; streaming deltas fan out over the chat bus, not
 * the return value.
 */
export interface TurnEngine {
  readonly runTurn: (prep: TurnPrep) => Promise<TurnOutcome>;
}

/** The PRINCIPAL-FREE non-human turn op (automation-design/03 §4 / 05 §AC-B). Built once at the chat
 *  composition root over the same turn deps the human verbs use, then handed to automation's `trigger_turn`
 *  arm + the plugin membrane's `turn.trigger`. Homed here (not on the verb file) per `no-inline-types` — the
 *  op shape is contract surface. See {@link RequestTurnParams} for the four walls it enforces. */
export type RequestTurnOp = (params: RequestTurnParams) => Promise<TurnOutcome>;

/** The verb-level result of a completed (or aborted) turn — the committed message(s) joined to their
 *  selected variant. A per-speaker group round commits several rows. */
export interface TurnOutcome {
  /** Empty when the turn aborted before any commit. */
  readonly messages: readonly MessageView[];
  readonly aborted: boolean;
  readonly abortReason?: TurnAbortReason | undefined;
}

/** The scope of a deferred-turn drain (Part III §5). `all` = the boot reclaim (every chat's queued turns);
 *  `hostUserId` = the host-return drain (only the turns funded by the returning host's box). Neither carries
 *  a `principal` — a drain is system-triggered, and the durable `pending_turns` row IS the authorization
 *  (it was minted by a `send` that already cleared `requireParticipant`). */
export type DrainDeferredTurnsScope = { readonly all: true } | { readonly hostUserId: UserId };

/** `drainDeferredTurns` — how many queued turns RAN (arbitrated + drove a round) vs. were DROPPED (a
 *  re-validation refusal: consent/budget/gone-chat). Both outcomes consume the durable row. */
export interface DrainReport {
  readonly ran: number;
  readonly dropped: number;
}

/** `startChat` — the lazily-created chat (+ roster) and the seeded opening, if any. `opening` is null when
 *  the policy seeded no greeting. */
export interface StartChatResult {
  readonly chat: ChatDetail;
  readonly opening: TurnOutcome | null;
}

/** `forkChat` — the new deep-copied, membership-scoped fork. */
export interface ForkResult {
  readonly chat: ChatDetail;
}

/** `compact` — the portable compaction checkpoint produced: the summary text + the seq it covers through. */
export interface CompactResult {
  readonly summary: string;
  readonly compactedAtSeq: number;
}

/** `reapTemporaryChats` — how many temporary chats were reaped. */
export interface ReapResult {
  readonly reaped: number;
}

/** `getVariables`/`getStoredVariables` — the ChoiceBlock variable map. */
export type VariablesResult = ChatVariables;

/** `createInvite` — the persisted invite plus the raw token returned once for the share link. The token is
 *  stored hashed; it never appears in an InviteView. */
export interface CreateInviteResult {
  readonly invite: InviteView;
  readonly token: string;
}

/** `redeemInvite` — the now-joined chat + the caller's new roster row. */
export interface RedeemInviteResult {
  readonly chat: ChatDetail;
  readonly participant: ParticipantView;
}
