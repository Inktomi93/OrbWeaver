// Every verb's *Params, declared once. Pure types (no z.object): the cross-boundary wire input schemas live
// in @orb/contracts/chat and are referenced type-only here. Every verb carries the resolved principal — chat
// is membership-scoped, resolving requireParticipant/requireHost(principal, chatId); there is no ownerId.

import type {
  ChatInjection,
  ChatInjectionInput,
  ChatListCursor,
  CreateInviteInput,
  GroupConfigInput,
  GuidedSteer,
  HandoffOffer,
  JoinHistoryVisibility,
  MessageContentBlock,
  OpeningPolicy,
  PreviewInviteInput,
  ReactionEmoji,
  ReattributeScope,
  RedeemInviteInput,
  RegexTierKey,
  RoomOverrides,
  SeatKnobs,
  TurnInitiator,
} from "@orb/contracts/chat";
import type { ChatDocumentVisibility } from "@orb/contracts/databank";
import type { Principal } from "@orb/contracts/identity";
import type { PromptTemplateMode, SizePresetName } from "@orb/contracts/imagery";
import type { UserIntent, UserMacroValues } from "@orb/contracts/preset";
import type { RpgRuleset } from "@orb/contracts/rpg";
import type { ThemeBackground } from "@orb/contracts/theme";
import type {
  AssetId,
  CharacterId,
  ChatId,
  ChatInjectionId,
  ChatInviteId,
  ChatParticipantId,
  MessageId,
  MessageVariantId,
  PersonaId,
  PresetId,
  UserId,
} from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";

// The one-turn typed steer is the CONTRACTS wire shape (`guidedSteerSchema`) — re-exported here so the
// verb *Params surface stays one import (F6 re-home: the local re-spell died when the wire schema landed).
export type { GuidedSteer } from "@orb/contracts/chat";

/** Common to every chat verb: the acting principal. */
interface ChatActorParams {
  readonly principal: Principal;
}

/** The common chatId-scoped base — requireParticipant/requireHost resolves against (principal, chatId). */
interface ChatScopedParams extends ChatActorParams {
  readonly chatId: ChatId;
}

/** A message-scoped base (canon edits/variant operations). */
interface MessageScopedParams extends ChatScopedParams {
  readonly messageId: MessageId;
}

/** `startChat` — lazy chat+roster creation, greeting seeding, CREATION-INTENT inputs only
 *  (D166). The former nine-field "draft carry"
 *  (seedGreetings/rosterOverrides/groupConfig/roomOverrides/guided, plus the `generate` opening arm) is
 *  GONE — R1 made every client caller create the real room before mounting, so post-create roster tuning,
 *  group config, room overrides and greeting edits ride their own already-built verbs
 *  (`setSeatKnobs`/`setGroupConfig`/`setRoomOverrides`/`editMessage`/`setSeededGreeting`) against the real
 *  room instead. `opening` EXCLUDES `"generate"` — "guide the opening" is an ordinary post-creation
 *  `chat.generate` action now, never a creation-fused turn. */
export interface StartChatParams extends ChatActorParams {
  readonly characterIds: readonly CharacterId[];
  readonly anchorPersonaId?: PersonaId | null | undefined;
  readonly title?: string | null | undefined;
  readonly opening?: Exclude<OpeningPolicy, "generate"> | undefined;
  readonly injections?: readonly ChatInjectionInput[] | undefined;
  /** Born ephemeral: hidden from listChats, swept by reapTemporaryChats once expired. */
  readonly temporary?: boolean | undefined;
  /** #40 DRAFT-TIME game start: mint a lite game atomically with the new chat (turn 1 is already in-game).
   *  Threaded BLIND to the injected `ChatRpgOps.planGameBirth` (the pointer precedent);
   *  `ruleset` is rpg's own setting axis (omit = `freeform`, the birth default — #862). */
  readonly startAsGame?: { readonly ruleset?: RpgRuleset | undefined } | undefined;
}

/** `listChats` — the caller's membership library, newest-CONVERSATION-first (#150: the ONE recency clock,
 *  `coalesce(newest message, updatedAt)` — the same value the row displays), KEYSET-PAGED (the `character.list`
 *  precedent). `characterId` is the D18 PROJECTION filter: it narrows the SERVER read to the chats that seat
 *  one character (present or departed), so a character screen never has to pull the whole library to find
 *  her three threads. `limit` is clamped in the verb; an absent `cursor` is the first page. */
export interface ListChatsParams extends ChatActorParams {
  readonly includeArchived?: boolean | undefined;
  readonly characterId?: CharacterId | undefined;
  /** SERVER-SIDE search. Matches the chat title, a character seat's name, or the
   *  newest message's body, over the WHOLE library instead of the page the
   *  client happens to hold. Blank/whitespace is the unsearched list. */
  readonly search?: string | undefined;
  /** Exclusive epoch-millisecond ceiling over the displayed-recency clock. */
  readonly beforeRecencyAt?: number | undefined;
  readonly limit?: number | undefined;
  readonly cursor?: ChatListCursor | undefined;
}

/** `listForks` — the membership-scoped fork children of a chat. */
export interface ListForksParams extends ChatScopedParams {}

/** `getChatLineage` — walks the fork ancestry, membership-gated per ancestor. */
export interface GetChatLineageParams extends ChatScopedParams {}

export interface GetChatParams extends ChatScopedParams {}

/** `getMemberCard` — read ONE roster character's card, field-clamped to the room's `memberCardVisibility`
 *  (D22). The `characterId` MUST be a present character seat of THIS chat; a not-in-roster / foreign id is a
 *  leak-free NOT_FOUND (you cannot read an arbitrary card through a chat you happen to be in). */
export interface GetMemberCardParams extends ChatScopedParams {
  readonly characterId: CharacterId;
}

/** `previewAssembly` — the BUILD product for a hypothetical turn (host/admin trace). */
export interface PreviewAssemblyParams extends ChatScopedParams {
  readonly speakerCharacterId?: CharacterId | null | undefined;
  readonly guided?: GuidedSteer | undefined;
  /** D121-G / §7.1 — assemble this room as if THIS preset were active, for the preset editor's BOUND Prompt
   *  readout (which prices a preset the chat has not adopted). Rides the SAME
   *  `ResolveForeignInputsOp.presetOverride` seam as {@link PreviewActionTemplatesParams.presetId} and
   *  inherits its safety: resolved owned-or-system UNDER THE HOST, degraded to the host's own default on a
   *  stale/unowned id. Absent ⇒ the chat's own active preset (every pre-existing caller). */
  readonly presetOverride?: PresetId | undefined;
}

/** `getActivePresetConfig` — the resolved PromptConfig the chat assembles against. */
export interface GetActivePresetConfigParams extends ChatScopedParams {}

/** `previewActionTemplates` — every ACTION template of ONE preset,
 *  resolved against THIS chat. `presetId` is the editor's OVERRIDE: assemble this room as if that preset were
 *  active, so the preset editor can show a real resolution for a preset the chat has not adopted. It rides the
 *  landed `ResolveForeignInputsOp.presetOverride` seam (the rpg GM-voice redirect's), which resolves
 *  owned-or-system UNDER THE HOST and degrades to the host's own default on a stale/unowned id — so a preset
 *  the caller does not own can never be read through a chat. */
export interface PreviewActionTemplatesParams extends ChatScopedParams {
  readonly presetId: PresetId;
}

/** `previewSection` — one section's render preview (the composer/editor surface). */
export interface PreviewSectionParams extends ChatScopedParams {
  readonly sectionId: string;
  readonly speakerCharacterId?: CharacterId | null | undefined;
}

/** `peekPrompt` — the assembled prompt for the next real turn (no generation). */
export interface PeekPromptParams extends ChatScopedParams {
  readonly speakerCharacterId?: CharacterId | null | undefined;
}

/** `getVariantWire` — the per-variant WIRE RECORD: what ONE past generation actually sent (host/admin
 *  inspector). `variantId` is scoped by the `messages.chatId` join, so a foreign variant is unreachable even
 *  with a valid chatId (D108 carve #1, the same belt `rpg/persistence/reveal` uses). */
export interface GetVariantWireParams extends ChatScopedParams {
  readonly variantId: MessageVariantId;
}

/** `getShapeTrace` — the content-free SHAPE trace for the next-turn shaping of the current canon (host/admin
 *  inspector; PD-132). `speakerCharacterId` picks the primary speaker the peek shapes for (as `peekPrompt`). */
export interface GetShapeTraceParams extends ChatScopedParams {
  readonly speakerCharacterId?: CharacterId | null | undefined;
}

/** `previewContextFit` — the present-tense fit budget for the current canon + the host's effective preset/
 *  capability (the transcript divider's live source; PD-#7). `speakerCharacterId` picks the primary speaker
 *  the fit shapes for (as `getShapeTrace`), so the preview matches the boundary the next real turn stamps. */
export interface PreviewContextFitParams extends ChatScopedParams {
  readonly speakerCharacterId?: CharacterId | null | undefined;
}

/** `listMessages` — paged canon read. */
export interface ListMessagesParams extends ChatScopedParams {
  readonly beforeSeq?: number | undefined;
  readonly limit?: number | undefined;
}

export interface ListParticipantsParams extends ChatScopedParams {}

/** `listMessageVariants` — the full sibling-variant set for one slot (no content). */
export interface ListMessageVariantsParams extends MessageScopedParams {}

/** `replayStreamEvents` — resume the SSE token log from a cursor. */
export interface ReplayStreamEventsParams extends ChatScopedParams {
  readonly afterSeq?: number | undefined;
}

export interface StreamEventBoundsParams extends ChatScopedParams {}

/** `replayChatEvents` — resume the durable chat-bus log from a cursor. */
export interface ReplayChatEventsParams extends ChatScopedParams {
  readonly afterSeq?: number | undefined;
}

/** `chatEventBounds` — the durable chat-bus log's cursor bounds. */
export interface ChatEventBoundsParams extends ChatScopedParams {}

/** `send` — persist a user message then run the AI turn. */
export interface SendParams extends ChatScopedParams {
  readonly content: string;
  readonly personaId?: PersonaId | null | undefined;
  readonly blocks?: readonly MessageContentBlock[] | undefined;
  /** The inline images the user attached to this send; each must be owned by the actor. */
  readonly attachmentAssetIds?: readonly AssetId[] | undefined;
  readonly intent?: UserIntent | undefined;
  readonly guided?: GuidedSteer | undefined;
}

/** `commitMessage` — the "Simple Send" / post-without-generate lever (D56): commit a user message WITHOUT
 *  firing the AI turn. `SendParams` MINUS `intent`/`guided` (no generation ⇒ no gen-config, no steer). */
export interface CommitMessageParams extends ChatScopedParams {
  readonly content: string;
  readonly personaId?: PersonaId | null | undefined;
  readonly blocks?: readonly MessageContentBlock[] | undefined;
  /** The inline images the user attached; each must be owned by the actor (the send trust boundary). */
  readonly attachmentAssetIds?: readonly AssetId[] | undefined;
}

/** `swipe` — appends a fresh variant to an assistant slot (a reroll; slot attribution unchanged). */
export interface SwipeParams extends MessageScopedParams {
  readonly intent?: UserIntent | undefined;
  readonly guided?: GuidedSteer | undefined;
}

/** `impersonateStream` — STREAMS the user's next line (active persona's voice) into the composer as it
 *  generates, persisting NOTHING. The user reviews the drafted line in the composer and commits it with a
 *  normal send. Same steer/perspective picker as a real turn; `personaId` selects the authoring persona's
 *  voice. The verb yields text deltas (see {@link ChatService.impersonateStream}). */
export interface ImpersonateStreamParams extends ChatScopedParams {
  readonly personaId?: PersonaId | null | undefined;
  readonly intent?: UserIntent | undefined;
  readonly guided?: GuidedSteer | undefined;
  /** The subscription's abort signal (transport-supplied) — cancels the in-flight generation when the client
   *  tears down the stream (unmount / user cancel). Absent in a non-streaming caller (a test driving it directly). */
  readonly signal?: AbortSignal | undefined;
}

/** `generate` — a lock-free auxiliary generation (runs concurrent with a locked send). */
export interface GenerateParams extends ChatScopedParams {
  readonly speakerCharacterId?: CharacterId | null | undefined;
  readonly intent?: UserIntent | undefined;
  readonly guided?: GuidedSteer | undefined;
  /** The wand's Response icon sets this when the tail canon row is an ASSISTANT turn (it already resolves
   *  `tailAssistantMessageId`): a reply generated after the model's OWN last line needs the `responseNudge`
   *  trailing-user turn to have something to respond to. A Response on a USER tail (the common empty-send-
   *  generate case — a fresh fork at your own message) omits it: the user message is the prompt. Absent ⇒ no
   *  nudge (byte-identical to pre-wand `generate`). */
  readonly afterAssistant?: boolean | undefined;
}

/** `continueTurn` — extends the tail assistant message in place. */
export interface ContinueTurnParams extends MessageScopedParams {
  readonly intent?: UserIntent | undefined;
  readonly guided?: GuidedSteer | undefined;
}

/** `undoContinue` — reverts the last continuation on a variant. */
export interface UndoContinueParams extends MessageScopedParams {}

/** `revertContinue` — re-applies the last reverted continuation. */
export interface RevertContinueParams extends MessageScopedParams {}

/** `forceCharacterTurn` — forces a specific roster character to speak next (host-only). */
export interface ForceCharacterTurnParams extends ChatScopedParams {
  readonly characterId: CharacterId;
  readonly intent?: UserIntent | undefined;
  readonly guided?: GuidedSteer | undefined;
}

/**
 * `requestTurn` — the NON-HUMAN turn seam (automation-design/03 §4 / 05 §AC-B). PRINCIPAL-FREE by design: it
 * is NOT on `ChatService` and never routed — it is an injected op the composition root hands automation's
 * `trigger_turn` arm and the Tier-2 plugin membrane's `turn.trigger` host-fn. The verb resolves the funding
 * host from the room itself (never a caller-supplied id), gates the initiator's membership, threads the origin
 * onto the reply slot, and runs the turn through the SAME engine path a human send clears — the per-chat turn
 * lock and the cascade-depth cap included. (The owner-consent and per-member budget belts this line used to
 * name left with the inference program §14 F13/F11; automation's own §3 rate gate is the surviving spend wall, and
 * it sits in the arm above this op.)
 */
export interface RequestTurnParams {
  readonly chatId: ChatId;
  /** The non-human origin stamped on the reply slot (`"automation"` | `"plugin"`) — the cascade guard's label
   *  (depth is the lever, not the label). A caller may not pass `"human"` here (see the verb's guard). */
  readonly initiator: TurnInitiator;
  /** The responsible human (D19): the rule AUTHOR / plugin INSTALLER. Owns attribution and abort rights and
   *  must be a PRESENT participant (else a leak-free NOT_FOUND). The room's frozen host funds and runs the
   *  turn. */
  readonly triggeredBy: UserId;
  /** The parent depth + 1 (automation-design/03 §4). Stamped on the reply slot so the reply's events resolve
   *  their cascade depth; the verb REFUSES a value past `AUTOMATION_DEPTH_HARD_CAP` (the plugin-path belt —
   *  automation's dispatch gate already bounds its own path). */
  readonly automationDepth: number;
  /** Force the speaker; absent ⇒ normal arbitration. */
  readonly speakerCharacterId?: CharacterId | undefined;
  /** A one-turn guided steer (the rendered `guidedTemplate`) placed via GATHER→BUILD, exactly like a human
   *  send's `guided`. */
  readonly guided?: GuidedSteer | undefined;
}

/** `compact` — the manual compaction lever; produces the portable checkpoint. */
export interface CompactParams extends ChatScopedParams {
  readonly instructions?: string | undefined;
}

/** `abort` — cancel an in-flight turn (lock-free; owner-of-the-turn only). */
export interface AbortParams extends ChatScopedParams {}

/** `generateImage` — generates n image(s), then persists one message whose body carries n asset: refs. */
export interface GenerateImageParams extends ChatScopedParams {
  readonly mode: PromptTemplateMode;
  readonly prompt?: string | undefined;
  readonly n?: number | undefined;
  /** The semantic size preset (imagery-design/02 §6) — forwarded to `imagery.generatePicture`; when absent
   *  the leaf uses `defaultSizeFor(mode)`. The I5 mode picker surfaces it. */
  readonly size?: SizePresetName | undefined;
}

/** `selectVariant` — flips messages.selectedVariantId to a sibling swipe (pointer move, zero copy). */
export interface SelectVariantParams extends MessageScopedParams {
  readonly variantId: MessageVariantId;
}

/** `editMessage` — edits the selected variant's content in place. */
export interface EditMessageParams extends MessageScopedParams {
  readonly content: string;
}

/**
 * `applyProseRewrite` — HOST-only. Lands an automation prose audit's CONFIRMED rewrite of one reply
 * as a NEW VARIANT of the audited slot, selected.
 *
 * WHY IT IS ITS OWN VERB and not an arm of `editMessage`, which also writes caller text: the two differ on
 * every axis that decides whether a machine may be given the door.
 *  • IT IS PINNED. The caller must name the exact `variantId` its rewrite was written against AND the hash of
 *    that variant's bytes. Both are re-read here and refused on mismatch (`rewrite_superseded` when the host
 *    has swiped since, `rewrite_stale` when the text changed), so this door can only ever land on the exact
 *    bytes an audit read — nothing a caller sends can overwrite a reply that moved under it. `editMessage`
 *    has no such pin, by design: a human editing their own room's message means "whatever it says now".
 *  • IT IS VARIANT-PRESERVING, which is the C3 REVERT OBLIGATION's mechanism. An in-place edit destroys the
 *    original; appending a variant leaves the audited text sitting one swipe away, forever, using the control
 *    the room already has. That is a durable undo with no expiry, no snapshot column, and nothing new to
 *    teach — as opposed to an `originalContent` stamp, which is a schema change this row does not own.
 *  • IT IS HOST-ONLY where edit is author-or-host: the rewrite is offered by a rule the HOST authored and
 *    executed on the HOST's confirm, and a member has no standing to accept a machine's rewrite of the room.
 */
export interface ApplyProseRewriteParams extends MessageScopedParams {
  /** The variant the audit READ. Must still be the slot's selected one, else `rewrite_superseded`. */
  readonly variantId: MessageVariantId;
  /** sha256-hex of that variant's content as the audit read it (`@orb/server/kit/content-hash`). */
  readonly expectedContentHash: string;
  /** The full corrected reply — already `neutralizeMacros`'d by the producer (§2 law 7). */
  readonly content: string;
}

/**
 * `setSeededGreeting` — steps a seeded greeting row onto another of its character card's alternates.
 *
 * IT CARRIES AN INDEX, NOT TEXT (a deliberate divergence from the design doc's parenthetical
 * `{chatId, messageId, text}` sketch — D166, whose RULING is
 * "replaces a seeded greeting row's content with another card alternate"). With text, this host-gated verb
 * would be a second arbitrary content-write door standing beside `editMessage`'s author-or-host one, and
 * "another card alternate" would be a client-side promise. With an INDEX, the server resolves the bytes from
 * the card, so the ruling is a runtime fact: nothing a caller sends can become message content.
 */
export interface SetSeededGreetingParams extends MessageScopedParams {
  /** Which of the character card's `greetings[]` to show. Out of range ⇒ `greeting_alternate_not_found`. */
  readonly greetingIndex: number;
}

/** `setMessageHidden` — toggles excludedFromPrompt (held out of assembly; the row survives). */
export interface SetMessageHiddenParams extends MessageScopedParams {
  readonly hidden: boolean;
}

/** `deleteMessages` — deletes a set of slots (author-or-host; cascades their variants). */
export interface DeleteMessagesParams extends ChatScopedParams {
  readonly messageIds: readonly MessageId[];
}

export interface EditReasoningParams extends MessageScopedParams {
  readonly reasoning: string;
}

export interface ClearReasoningParams extends MessageScopedParams {}

/** `moveMessage` — reorders a slot to a new seq position. */
export interface MoveMessageParams extends MessageScopedParams {
  readonly toSeq: number;
}

/** `duplicateMessage` — copies a slot + its selected variant to a new tail slot. */
export interface DuplicateMessageParams extends MessageScopedParams {}

/** `forkChat` — deep-copies the chat into a new membership-scoped chat, linked only by parentChatId. */
export interface ForkChatParams extends ChatScopedParams {
  readonly throughSeq?: number | undefined;
  readonly title?: string | null | undefined;
}

/** `setChatInjection` — upserts a persisted positional injection. The resolved actor/chat scope wraps the
 *  wire input fields; `id` set means update, absent means create. */
export interface SetChatInjectionParams extends ChatScopedParams {
  readonly id?: ChatInjectionId | undefined;
  readonly position: ChatInjection["position"];
  readonly depth: number;
  readonly role: MessageRole;
  readonly content: string;
  readonly order?: number | undefined;
}

export interface ListChatInjectionsParams extends ChatScopedParams {}

export interface DeleteChatInjectionParams extends ChatScopedParams {
  readonly injectionId: ChatInjectionId;
}

/** `getVariables` — the effective ChoiceBlock variables computed for the next turn. */
export interface GetVariablesParams extends ChatScopedParams {}

/** `getRuntimeVariables` — the room's RUNTIME variable fold (S5 §4's vars read, priced with `setVariable`;
 *  the needle's meter and B9's clock widget both consume it). Member-gated: the vars plane is
 *  member-visible BY DESIGN — which is exactly why analysis arcs/twists/guidance never write into it. */
export interface GetRuntimeVariablesParams extends ChatScopedParams {}

/** `toggleReaction` (B6/MR0) — add or remove ONE emoji on ONE variant, attributed to the caller's own seat.
 *
 *  ONE verb, not an add/remove pair: the affordance is a toggle, the two directions share every gate, and a
 *  single verb makes the "which direction?" decision the SERVER'S (from what the seat already holds) instead
 *  of trusting a client that may be a repaint behind. `emoji` is the wire-validated vocabulary member. */
export interface ToggleReactionParams extends ChatScopedParams {
  readonly variantId: MessageVariantId;
  readonly emoji: ReactionEmoji;
  /** B7/MR3 — the segment CLAIM: target ONE `parseSpeakerSpans` line of the variant's CANON (absent =
   *  whole-message, the default at every pointer). The verb re-parses the canon itself and stores ITS OWN
   *  speaker + snippet; the claim is only compared (a mismatch is `invalid_segment`), never persisted —
   *  a member cannot write free text into a column every transcript renders. `segmentSpeaker` is the span
   *  label the CLIENT parsed at that index (`null` = a narration span), carried so a content/roster race
   *  refuses instead of landing the click on somebody else's line. */
  readonly segmentIndex?: number | undefined;
  readonly segmentSpeaker?: string | null | undefined;
}

/** The B7 segment-anchor trio as one PERSISTED value (`message_reactions.segment_*`; `null` at the write
 *  seam = a whole-message reaction). Minted ONLY from the server's own canon parse (`mintSegmentAnchor` /
 *  `resolveToSpeakerAnchor` in `verbs/reactions.ts`) — never from wire text. The SPEAKER may be null inside
 *  a present anchor (a narration span has no label); the snippet may not (the schema CHECK). Homed here
 *  (the domain's contract) because the write statement (`persistence/reactions.ts::insertReaction`) and
 *  both writers share it. */
export interface StoredSegmentAnchor {
  readonly segmentIndex: number;
  readonly segmentSpeaker: string | null;
  readonly segmentSnippet: string;
}

/** `reactAsCharacter` (B7/MR5) — the `react` TOOL's write half: attach ONE emoji to the room's NEWEST
 *  committed message, attributed to a PRESENT character's seat. NOT a `ChatService` member: its one
 *  consumer is the composition root (the tool definition closes over it), so it ships as a standalone
 *  factory (`createReactAsCharacter`) rather than growing the routed surface. `principal` is the TURN's
 *  resolved host (the tool exec context's identity); the character named must hold a present seat.
 *  `toSpeaker` narrows to that speaker's LAST canon span (the model targets by name — Marinara's proven
 *  surface; it cannot know ids). ADD-ONLY: a model retry must never un-react a human's click. */
export interface ReactAsCharacterParams extends ChatScopedParams {
  readonly characterName: string;
  readonly emoji: ReactionEmoji;
  readonly toSpeaker?: string | undefined;
}

/** `listReactions` (B6/MR0) — the room's bounded grouped reaction window, member-gated and floor-clamped.
 *  Takes no cursor and no variant: it is ONE read per room that the client indexes by `variantId`, so a
 *  swipe re-targets data already held (the `rpg.listTurnToolCalls` posture). */
export interface ListReactionsParams extends ChatScopedParams {}

/** `getVariablePicks` — the picks pane's ChoiceBlock read: the chat's declared variables + the persisted
 *  picks `setVariables` writes (the `getUserMacroPicks` sibling — the pane's two knob families). */
export interface GetVariablePicksParams extends ChatScopedParams {}

/** `setVariables` — flushes a \{\{var\}\}→value map to chats.variableValues. */
export interface SetVariablesParams extends ChatScopedParams {
  readonly values: Record<string, string>;
}

/** `setUserMacroValues` (WAVE MU) — flushes the per-chat user-macro INPUT picks (a nested macro→input→typed
 *  pick bag) to `chats.user_macro_values`. A SIBLING of `setVariables` (the ChoiceBlock-picks store), kept a
 *  distinct column because the nested-typed shape can't share the flat `variableValues` map. */
export interface SetUserMacroValuesParams extends ChatScopedParams {
  readonly values: UserMacroValues;
}

/** `getUserMacroPicks` (#24) — the picks pane's ONE read: the chat's pickable user-macro declarations +
 *  the persisted picks `setUserMacroValues` writes. */
export interface GetUserMacroPicksParams extends ChatScopedParams {}

export interface ClearVariablesParams extends ChatScopedParams {}

/** `delete` — deletes the chat (host-only; cascades messages/roster/invites/etc.). */
export interface DeleteChatParams extends ChatScopedParams {}

/** `reapTemporaryChats` — sweeps the caller's expired temporary chats AND expired husks (R0 §4.6). */
export interface ReapTemporaryChatsParams extends ChatActorParams {}

/** `reapHusk` — the nav-away drop of ONE unclaimed room (R0 §4.6). Host-only; the server re-checks
 *  `started_at IS NULL`, so this is a REQUEST to reap, never an assertion that the room is a husk. */
export interface ReapHuskParams extends ChatScopedParams {}

export interface UpdateTitleParams extends ChatScopedParams {
  readonly title: string | null;
}

export interface StarChatParams extends ChatScopedParams {
  readonly starred: boolean;
}

export interface ArchiveChatParams extends ChatScopedParams {
  readonly archived: boolean;
}

/** `setChatAnchorPersona` — host-only, mid-chat change of chats.anchorPersonaId (the frozen card \{\{user\}\}
 *  POV). Null clears the anchor. */
export interface SetChatAnchorPersonaParams extends ChatScopedParams {
  readonly personaId: PersonaId | null;
}

/** `reattributeMessages` — re-stamps the characterId attribution of a set of slots (host-only). */
export interface ReattributeMessagesParams extends ChatScopedParams {
  readonly messageIds: readonly MessageId[];
  readonly characterId: CharacterId;
}

/** `reattributePersona` — re-stamps the authoring personaId of a set of user-role slots. Author-or-host per
 *  targeted row; the target persona must be owned by each row's author. The {@link ReattributeScope} arm
 *  decides WHICH rows: an explicit id set, or the server-resolved "every row I authored" bulk arm. */
export interface ReattributePersonaParams extends ChatScopedParams {
  readonly scope: ReattributeScope;
  readonly personaId: PersonaId;
}

/** `setGroupConfig` — host-only write of the chatMetadata.group sub-blob. */
export interface SetGroupConfigParams extends ChatScopedParams {
  readonly config: GroupConfigInput;
}

/** `addCharacterToChat` — adds a character to the roster (host-only). */
export interface AddCharacterToChatParams extends ChatScopedParams {
  readonly characterId: CharacterId;
}

/** `removeCharacterFromChat` — leftSeq-stamps a character seat out of the roster (host-only). The symmetric
 *  drop for {@link AddCharacterToChatParams}; the only server consumer today is rpg's scene-cast prune
 *  (rpg-design/07 §2.2, injected). */
export interface RemoveCharacterFromChatParams extends ChatScopedParams {
  readonly characterId: CharacterId;
}

/** `setRoomOverrides` — host-only write of the four-field chatMetadata.roomOverrides allowlist. */
export interface SetRoomOverridesParams extends ChatScopedParams {
  readonly overrides: RoomOverrides;
}

/** `setChatDocumentVisibility` — host-only write of the per-document databank retrieval-visibility override
 *  (D85). `visibility.hidden` REPLACES the whole excluded-document set (set-semantics, not a merge patch) —
 *  the host sends the full list of documents to exclude from this chat's retrieval union. */
export interface SetChatDocumentVisibilityParams extends ChatScopedParams {
  readonly visibility: ChatDocumentVisibility;
}

/** `setChatBackground` — host-only write of the per-chat carried BACKGROUND source (BG-C, the
 *  `chatMetadata.background` sub-blob). Replaces the whole blob; `kind:"none"` clears it (⇒ the card-carried
 *  twin, then the viewer's own appearance, wins). Applied client-side at the app-root background layer in a
 *  true-solo room. */
export interface SetChatBackgroundParams extends ChatScopedParams {
  readonly background: ThemeBackground;
}

/** `setHostDisplayScripts` — host-only write of the D121-E display-tier room OPTION
 *  (`chatMetadata.hostDisplayScripts`). `true` ⇒ the HOST's display-tier regex scripts render for every
 *  viewer in this room (each viewer's own still apply on top); `false`/absent ⇒ the per-user default, where
 *  a viewer only ever sees their own. RENDER-only on both arms — never canon, never the wire. */
export interface SetHostDisplayScriptsParams extends ChatScopedParams {
  readonly enabled: boolean;
}

/** ONE lever of the room's regex, as the host flipped it (#1742). A discriminated union rather than a bag of
 *  optional fields because the write is ONE metadata key per call (#1450 — `commitMetadataUpdate` writes a
 *  single JSON path, and a two-key write would be a lost-update race against every other host knob), and
 *  because "the master" and "a tier" are different keys with different blobs. */
type RegexAllowLever =
  /** `ChatMetadata.regexEnabled` — the section's `Run regex in this chat` master. */
  | { readonly kind: "master"; readonly enabled: boolean }
  /** One entry of `ChatMetadata.regexTiers`. The verb MERGES it into the stored map: the client flips one
   *  lever and never has to send back a map it might have raced. */
  | { readonly kind: "tier"; readonly tier: RegexTierKey; readonly enabled: boolean };

/** `setRegexAllow` — host-only write of ONE of the room's regex levers (#1742,
 *  `docs/design/mocks/regex-section/DESIGN.md` §3). Host authority for the `setOfferChoices` reason and not
 *  the display-scripts one: these levers govern PROMPT CONTENT for everyone in the room (they decide which
 *  scripts the shared assembly runs), so they are room state, never a viewer preference. Returns the stored
 *  post-write allow so the caller's optimistic state and the server's blob can never disagree. */
export interface SetRegexAllowParams extends ChatScopedParams {
  readonly lever: RegexAllowLever;
}

/** `listEffectiveRegex` — the host's read of what regex runs in this room, in run order, by tier (#1742). */
export type ListEffectiveRegexParams = ChatScopedParams;

/** `setOfferChoices` — host-only write of the B1 offer-choices POSTURE (`chatMetadata.offerChoices`).
 *  `enabled` is what this ROOM is pinned to; there is no "clear back to inherit" arm, because the host's
 *  own toggle only ever sends the state they just chose (a fresh room, having never been written, is the
 *  inherit case). Governs PROMPT CONTENT — with it on, the turn teaches the model the standing `:::choices`
 *  fence — so it is host authority, not a viewer preference. */
export interface SetOfferChoicesParams extends ChatScopedParams {
  readonly enabled: boolean;
}

/** `setCharactersCanReact` — host-only write of the B7 react-tool ATTACH posture
 *  (`chatMetadata.charactersCanReact`). The `setOfferChoices` twin: `enabled` pins this room; a fresh room
 *  (never written) inherits the host's per-user default, which itself defaults OFF — the react tool is
 *  opt-in at both tiers (owner requirement). Governs PROMPT CONTENT (the tool + its description reach the
 *  wire), so host authority. */
export interface SetCharactersCanReactParams extends ChatScopedParams {
  readonly enabled: boolean;
}

/** `setReactionsEnabled` — host-only write of the B7 reaction-plane MASTER posture
 *  (`chatMetadata.reactionsEnabled`). Same tri-state shape; the per-user default ships ON (B6 is a live
 *  feature — this knob makes it disableable). Resolved OFF is enforced at the verbs (`toggleReaction`
 *  refuses, `listReactions` answers empty-with-verdict), not merely hidden. */
export interface SetReactionsEnabledParams extends ChatScopedParams {
  readonly enabled: boolean;
}

/** `setToolRecurseLimit` — host-only write of the per-chat tool-call recursion cap
 *  (`chatMetadata.toolRecurseLimit`, 1..20). Bounds how many times a turn may re-enter the engine on a
 *  `finishReason:"tool"` before it stops. */
export interface SetToolRecurseLimitParams extends ChatScopedParams {
  readonly limit: number;
}

export interface GetGroupConfigForChatParams extends ChatScopedParams {}

export interface GetRoomOverridesForChatParams extends ChatScopedParams {}

/** `setSeatKnobs` — the ONE participantId-keyed AI-seat knob write (host-only; D80). Replaces the retired
 *  per-kind forking (`setParticipantDisabled`/`setParticipantTalkativeness`/`setAgentSeatDisabled` — the
 *  pattern that guaranteed skipped arms, e.g. agent talkativeness was unsettable). Targets a PRESENT
 *  AI-driven seat (character|agent) by its `participantId`; `patch` carries only the knobs to change (both
 *  optional — an empty patch is a no-op that still returns the current view). */
export interface SetSeatKnobsParams extends ChatScopedParams {
  readonly participantId: ChatParticipantId;
  readonly patch: SeatKnobs;
}

/** `createInvite` — host-only. Mints a share-link or targeted-by-handle invite. The token is CSPRNG-minted
 *  and stored hashed; the raw token is returned once, never persisted raw. */
export interface CreateInviteParams extends ChatScopedParams {
  readonly input: CreateInviteInput;
}

/** `previewInvite` — the preview-then-confirm read: carries the raw token, returns the minimal preview
 *  (no roster identities, no history). */
export interface PreviewInviteParams extends ChatActorParams {
  readonly input: PreviewInviteInput;
}

/** `redeemInvite` — the participant-insert chokepoint (atomic conditional redeem → insert with
 *  server-forced role + stamped joinSeq). The only public join path for a human. */
export interface RedeemInviteParams extends ChatActorParams {
  readonly input: RedeemInviteInput;
}

/** `revokeInvite` — host-only. Invalidates an outstanding invite. */
export interface RevokeInviteParams extends ChatScopedParams {
  readonly inviteId: ChatInviteId;
}

/** `listInvites` — host-only. Every invite for the chat as InviteViews. */
export interface ListInvitesParams extends ChatScopedParams {}

/** `declineInvite` — declines a targeted invite the caller was notified about. Keyed by inviteId, not the
 *  raw token. */
export interface DeclineInviteParams extends ChatActorParams {
  readonly inviteId: ChatInviteId;
}

/** `acceptInvite` — the in-app accept of a targeted invite; self-authorizing (the invite must be bound to
 *  the caller). Reuses redeemInvite's atomic seat + idempotent already-member recovery. */
export interface AcceptInviteParams extends ChatActorParams {
  readonly inviteId: ChatInviteId;
}

/** `kick` — host-only. Removes a member (sets leftSeq + SSE teardown + notifies the removed user). */
export interface KickParticipantParams extends ChatScopedParams {
  readonly userId: UserId;
}

/** `setMemberHistoryVisibility` — host-only. The ONE write path for the D16 per-participant join-history
 *  policy (`chat_participants.joinHistoryVisibility`, the floor `substrate/auth::resolveHistoryFloorSeq`
 *  reads). Targets a PRESENT HUMAN member by `userId` (the kick/nominate keying) — a character seat carries
 *  a NULL userId and has no reader floor at all, so it is unreachable here by construction. Does NOT move
 *  the target's `joinSeq`: `from-join` clamps their reads to the join point they already have. */
export interface SetMemberHistoryVisibilityParams extends ChatScopedParams {
  readonly userId: UserId;
  readonly visibility: JoinHistoryVisibility;
}

/** `selfLeave` — a member leaves their own membership. A sole-host self-leave archives the room. */
export interface SelfLeaveParams extends ChatScopedParams {}

/** `nominateHostHandoff` — host-only, step 1 of the two-party handoff: nominates a member as the new host. */
export interface NominateHostHandoffParams extends ChatScopedParams {
  readonly userId: UserId;
  /** The departing host's OPT-IN property offer, persisted beside the nominee and
   *  executed at ACCEPT. Absent ⇒ no offer ⇒ the built D64 drop, byte-identical to a pre-offer handoff. */
  readonly offer?: HandoffOffer | undefined;
}

/** `acceptHostHandoff` — step 2: the nominee accepts, triggering the atomic role swap. */
export interface AcceptHostHandoffParams extends ChatScopedParams {}
