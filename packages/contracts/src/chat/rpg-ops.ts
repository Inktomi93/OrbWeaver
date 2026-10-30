// The chat data and injected ops the rpg domain consumes. Runtime types (AbortSignal, resolved connections,
// tool wires) stay with their owners; each consumer types its op signature over these shapes.

import type { CharacterId, ChatId, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import type { ChatMembership } from "#identity";
import type { ProseOverrides } from "#prose-slot";
import type { ChatRpgPointer, RpgParticipantActor } from "#rpg";
import type { ChatInjection } from "./assemble.ts";

/** The turn-kind axis of a chat turn. */
const TURN_KINDS = ["send", "swipe", "continue", "generate", "impersonate", "opening", "auto", "force"] as const;
export type TurnKind = (typeof TURN_KINDS)[number];

/** Model-plane story evidence keeps hidden spans; consumers slice the loaded chronological transcript. */
export interface RpgTurnTranscriptMessage {
  readonly role: MessageRole;
  readonly speakerName: string | null;
  readonly content: string;
  readonly tokens: number;
}

/** The completed turn's captured facts, never re-resolved against a later host or preset. The resolved
 *  connection, the terminal tool calls and the cancellation signal ride beside it in the consumer's own
 *  turn-context type. */
export interface RpgTurnFacts {
  /** Continuation replaces its selected variant snapshot; other kinds write a new variant. */
  readonly kind: TurnKind;
  readonly transcript: readonly RpgTurnTranscriptMessage[];
  /** A registry-name collision withheld the folded channel; distinct from an incapable connection. */
  readonly terminalToolsCollided: readonly string[];
  /** The initiator owns cancellation, independently of the frozen host's execution authority. */
  readonly triggeredBy: UserId;
  /** The turn's captured prose view, never a later re-resolve after commit. */
  readonly prose: ProseOverrides;
}

/** CLAIM a chat: the husk-to-real transition. Idempotent, one-way, and a no-op on an already-claimed or vanished
 *  room. Call it before your own canon write, because the claim replays the creation stats over the canon present
 *  at claim. */
export type ClaimChatOp = (chatId: ChatId) => Promise<void>;

/** The caller's PRESENT role in a chat, or `null` (not a present member, or no such chat; one leak-free answer). */
export type GetMembership = (chatId: ChatId, userId: UserId) => Promise<ChatMembership | null>;

/** Merge the healed `metadata.rpg` `{gameId}` pointer into the chat; a `null` pointer deletes the sub-blob. Chat
 *  stores the pointer blind: the truth is the game row. */
export type SetRpgPointer = (chatId: ChatId, pointer: ChatRpgPointer | null) => Promise<void>;

/** Resolve a chat's PRESENT participants into rpg actor refs plus display name and avatar. */
export type ResolveRpgParticipants = (chatId: ChatId) => Promise<readonly RpgParticipantActor[]>;

/** The selected-lineage canon of a chat sliced to the last `maxTokens` (newest-first fill, oldest-to-newest
 *  order). Room-plane; hidden-class spans stay intact for the model plane. */
export type ResolveCanonWindow = (chatId: ChatId, opts: { readonly maxTokens: number }) => Promise<readonly RpgTurnTranscriptMessage[]>;

/** The BORN-STATE corpus one character's populate round reads: the card's authored prose and the room's OPENING
 *  line. Deliberately not the story window, so a beat that already happened cannot bleed into the born state. */
export interface RpgCardCorpus {
  /** The card's display name, the `targetRef` the round's inventory writes must name. */
  readonly name: string;
  /** The card's authored prose (description, personality, scenario), labeled and joined. Empty sections are omitted. */
  readonly card: string;
  /** The room's OPENING line (the first canon slot's selected body, edits included). `""` when the room has no message. */
  readonly opening: string;
}

/** Resolve one roster character's {@link RpgCardCorpus}. `null` means no such card under the room host, or a
 *  hostless room: the caller refuses the round. */
export type ResolveRpgCardCorpus = (chatId: ChatId, characterId: CharacterId) => Promise<RpgCardCorpus | null>;

/** The call args of a game turn's gather. `pendingUserText` and `respondsToLatestUserTurn` are the dice-feed
 *  inputs; `steerIdentity` is chat's resolved `{{user}}`/`{{char}}` pair for the host-authored steering note;
 *  `regenSlotMessageId` is the assistant slot a swipe or reroll regenerates; `prose` is the turn preset's prose
 *  overrides, absent meaning every slot resolves to its shipped default. */
export interface GatherTurnContextArgs {
  readonly chatId: ChatId;
  /** The turn's FUNDER, whose chat connection the rpg delivery verdict reads. */
  readonly funderUserId: UserId;
  readonly pendingUserText: string | undefined;
  readonly respondsToLatestUserTurn: boolean;
  readonly steerIdentity?: { readonly user: string | undefined; readonly char: string } | undefined;
  readonly regenSlotMessageId?: MessageId | undefined;
  readonly prose?: ProseOverrides | undefined;
}

/** What a game turn's gather contributes, minus the runtime-typed terminal tools. Chat merges `macros` into the
 *  turn's macro values, `injections` into its single injection list and `tools` into the attached tool names,
 *  and learns no rpg type. */
export interface ChatRpgGatherData {
  readonly macros: Readonly<Record<string, string>>;
  readonly injections: readonly ChatInjection[];
  readonly tools: readonly string[];
  /** The `{{expr::...}}` activation a game turn contributes: a data-only `rpg` binding shaped as a tree of
   *  scalars, lists and maps. Absent means `{{expr::rpg...}}` renders empty (non-game). */
  readonly celBindings?: Readonly<Record<string, unknown>> | undefined;
  /** The keep-last-X card wire knob (0 = every history card collapses to its stub). */
  readonly cardKeepLastX: number;
}

/** The `forkChat` to rpg clone call args. Carries the fork's id remaps (an entry off the map is dropped) and the
 *  forker's source-room posture, which drives the host-secret strip. */
export interface ForkGameArgs {
  readonly sourceChatId: ChatId;
  readonly newChatId: ChatId;
  /** The fork's slot remap (source `messages.id` to fork id). */
  readonly slotIdMap: ReadonlyMap<MessageId, MessageId>;
  /** The fork's variant remap (source `messageVariants.id` to fork id); a variant with no entry drops its rpg rows. */
  readonly variantIdMap: ReadonlyMap<MessageVariantId, MessageVariantId>;
  /** `readsHidden` is the source-room host verdict: a non-host forker never had host-plane access to the source's
   *  secrets, so the clone strips them. `userId` is the ownership axis for the `gmPresetId` carry gate. */
  readonly forker: { readonly userId: UserId; readonly readsHidden: boolean };
}

/** The clone outcome. `cloned: false` is a non-game source (or rpg unwired): the fork ships plain, with no pointer. */
export interface ForkGameResult {
  readonly cloned: boolean;
}

export type ForkGameOp = (args: ForkGameArgs) => Promise<ForkGameResult>;

/** The GM seat holder's FK-derived kind. Chat branches only on the `agent` arm. */
type GmSeatHolderKind = { readonly kind: "human" } | { readonly kind: "agent"; readonly enabled: boolean };

/** The GM seat holder's kind for the game rooted at this chat, or `null` for a non-game, an AI-narrator seat or a
 *  vanished holder. */
export type ResolveGmSeatHolderKindOp = (chatId: ChatId) => Promise<GmSeatHolderKind | null>;

/** The chat's app-tier PROSE overrides, resolved for the room host. A hostless or stale room resolves `{}`, so
 *  every slot falls to its shipped default. */
export type ResolveChatProseOp = (chatId: ChatId) => Promise<ProseOverrides>;
