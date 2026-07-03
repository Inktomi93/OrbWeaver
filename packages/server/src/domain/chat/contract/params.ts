// domain/chat/contract/params — every verb's `*Params`, declared ONCE (§7.4 — one type home). Pure types
// (no `z.object`): the cross-boundary WIRE input schemas live in `@orb/contracts/chat` (the tRPC router +
// the client form validate the SAME schema) and are referenced TYPE-ONLY here, so the verb signatures + the
// front door reference one name without this file taking on a contract-test obligation (the schemas are
// tested in `tests/contracts/chat/`).
//
// Every verb carries the resolved `principal` (spine §7.1) — chat is MEMBERSHIP-scoped (D18): the verb
// resolves `requireParticipant`/`requireHost(principal, chatId)`; there is NO `ownerId`. The TURN path
// additionally resolves the D19 identity triple (`triggeredBy`/`runAsUserId`) INTERNALLY from the principal +
// the loaded host — the caller never passes them (no `callerUserId` term).

import type {
  CreateInviteInput,
  GroupConfigInput,
  MessageContentBlock,
  OpeningPolicy,
  PreviewInviteInput,
  RedeemInviteInput,
  RoomOverrides,
} from "@orb/contracts/chat";
import type { AgentSourceKind, Principal } from "@orb/contracts/identity";
import type { GuidedActionKind, UserIntent } from "@orb/contracts/preset";
import type {
  CharacterId,
  ChatId,
  ChatInjectionId,
  ChatInviteId,
  MessageId,
  MessageVariantId,
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";

// ─────────────────────────────────────────────────────────────────────────────
// Shared bases
// ─────────────────────────────────────────────────────────────────────────────

/** Common to every chat verb: the acting principal (membership/authority is resolved off `principal.userId`). */
export interface ChatActorParams {
  readonly principal: Principal;
}

/** The common chatId-scoped base — `requireParticipant`/`requireHost` resolves against `(principal, chatId)`. */
export interface ChatScopedParams extends ChatActorParams {
  readonly chatId: ChatId;
}

/** A message-scoped base (canon edits / variant operations). */
export interface MessageScopedParams extends ChatScopedParams {
  readonly messageId: MessageId;
}

/** A one-turn typed steer (chat.md §6 — guided steering). `placement` defaults to the `{{guided_instruction}}`
 *  system-marker; set the `inject` arm only for an action that must read as an in-character turn (the steer
 *  reaches the model ONLY via its placement — never folded into history/WI). Untrusted `input` is
 *  macro-neutralized downstream. */
export type GuidedPlacement =
  | { readonly kind: "system" }
  | { readonly kind: "inject"; readonly role: MessageRole };

export interface GuidedSteer {
  readonly action: GuidedActionKind;
  readonly input?: string | undefined;
  readonly placement?: GuidedPlacement | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// reads / lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/** `startChat` — lazy chat+roster creation, greeting/verbatim seeding, first-turn delegate (D28 live-identity
 *  roster). `characterIds` is the founding cast; `anchorPersonaId` is the chat-open `{{user}}` POV; `opening`
 *  overrides the resolved default opening policy. */
export interface StartChatParams extends ChatActorParams {
  readonly characterIds: readonly CharacterId[];
  readonly anchorPersonaId?: PersonaId | null | undefined;
  readonly title?: string | null | undefined;
  readonly opening?: OpeningPolicy | undefined;
  /** ST "Temporary Chat" (PD-65): born ephemeral — hidden from `listChats`, swept by
   *  `reapTemporaryChats` once expired. Absent ⇒ a normal persistent chat. */
  readonly temporary?: boolean | undefined;
}

export interface ListChatsParams extends ChatActorParams {
  readonly includeArchived?: boolean | undefined;
}

/** `listForks` — the membership-scoped fork CHILDREN of a chat (the `parentChatId` index). */
export interface ListForksParams extends ChatScopedParams {}

/** `getChatLineage` — walk the fork ancestry, membership-gated per ancestor (D27/inv §16). */
export interface GetChatLineageParams extends ChatScopedParams {}

export interface GetChatParams extends ChatScopedParams {}

/** `previewAssembly` — the BUILD product for a hypothetical turn (host/admin trace). `speakerCharacterId`
 *  scopes the preview to a per-speaker turn; `generationType`/`guided` mirror a real turn's gate. */
export interface PreviewAssemblyParams extends ChatScopedParams {
  readonly speakerCharacterId?: CharacterId | null | undefined;
  readonly guided?: GuidedSteer | undefined;
}

/** `getActivePresetConfig` — the resolved `PromptConfig` the chat assembles against. */
export interface GetActivePresetConfigParams extends ChatScopedParams {}

/** `previewSection` — one section's render preview (the COMPOSER/editor surface). */
export interface PreviewSectionParams extends ChatScopedParams {
  readonly sectionId: string;
  readonly speakerCharacterId?: CharacterId | null | undefined;
}

/** `peekPrompt` — the assembled prompt for the NEXT real turn (no generation). */
export interface PeekPromptParams extends ChatScopedParams {
  readonly speakerCharacterId?: CharacterId | null | undefined;
}

/** `listMessages` — paged canon read (D26: each row joined to its selected variant). */
export interface ListMessagesParams extends ChatScopedParams {
  /** Page backwards from this seq (exclusive); absent ⇒ from the tail. */
  readonly beforeSeq?: number | undefined;
  readonly limit?: number | undefined;
}

export interface ListParticipantsParams extends ChatScopedParams {}

/** `replayStreamEvents` — resume the SSE token log from a cursor (late-subscriber ramp-up). */
export interface ReplayStreamEventsParams extends ChatScopedParams {
  /** Replay strictly after this `seq`; absent ⇒ from the start of the retained window. */
  readonly afterSeq?: number | undefined;
}

export interface StreamEventBoundsParams extends ChatScopedParams {}

/** `replayChatEvents` — resume the durable chat-bus log from a cursor (the `chat.streamMessages` SSE
 *  reconnect replay; chat_events is append-only, so a replay is never truncated). */
export interface ReplayChatEventsParams extends ChatScopedParams {
  /** Replay strictly after this `seq`; absent ⇒ the whole log (callers pass the resume cursor). */
  readonly afterSeq?: number | undefined;
}

/** `chatEventBounds` — the durable chat-bus log's cursor bounds (+ the SSE per-yield membership gate). */
export interface ChatEventBoundsParams extends ChatScopedParams {}

// ─────────────────────────────────────────────────────────────────────────────
// turn-running
// ─────────────────────────────────────────────────────────────────────────────

/** `send` — persist a user message (SEND-regex applied) then run the AI turn. `personaId` voices the user
 *  line; `intent` carries per-turn sampling overrides; `guided` is an optional one-turn steer. */
export interface SendParams extends ChatScopedParams {
  readonly content: string;
  readonly personaId?: PersonaId | null | undefined;
  readonly blocks?: readonly MessageContentBlock[] | undefined;
  readonly intent?: UserIntent | undefined;
  readonly guided?: GuidedSteer | undefined;
}

/** `simpleSend` — the lightweight single-message send (no roster arbitration / group machinery). */
export interface SimpleSendParams extends ChatScopedParams {
  readonly content: string;
  readonly personaId?: PersonaId | null | undefined;
  readonly intent?: UserIntent | undefined;
}

/** `swipe` — append a fresh variant to an assistant slot (a reroll; D26 — slot attribution unchanged). */
export interface SwipeParams extends MessageScopedParams {
  readonly intent?: UserIntent | undefined;
  readonly guided?: GuidedSteer | undefined;
}

/** `impersonate` — generate a USER-side message as the active persona (the steer reaches the model only via
 *  placement). */
export interface ImpersonateParams extends ChatScopedParams {
  readonly personaId?: PersonaId | null | undefined;
  readonly intent?: UserIntent | undefined;
  readonly guided?: GuidedSteer | undefined;
}

/** `generate` — a lock-free auxiliary generation (runs concurrent with a locked send; chat.md active-turns). */
export interface GenerateParams extends ChatScopedParams {
  readonly speakerCharacterId?: CharacterId | null | undefined;
  readonly intent?: UserIntent | undefined;
  readonly guided?: GuidedSteer | undefined;
}

/** `continueTurn` — extend the tail assistant message in place (continue snapshot per-variant, D26). */
export interface ContinueTurnParams extends MessageScopedParams {
  readonly intent?: UserIntent | undefined;
  readonly guided?: GuidedSteer | undefined;
}

/** `undoContinue` — revert the last continuation on a variant (restores `preContinue*`). */
export interface UndoContinueParams extends MessageScopedParams {}

/** `revertContinue` — re-apply the last reverted continuation (the redo twin of `undoContinue`). */
export interface RevertContinueParams extends MessageScopedParams {}

/** `forceCharacterTurn` — force a specific roster character to speak next (host-only; chat.md Part III §6). */
export interface ForceCharacterTurnParams extends ChatScopedParams {
  readonly characterId: CharacterId;
  readonly intent?: UserIntent | undefined;
  readonly guided?: GuidedSteer | undefined;
}

/** `compact` — the manual compaction lever (the lock-free `runCompaction` core is injected into the engine;
 *  chat.md §Decisions). Produces the portable checkpoint (D25). */
export interface CompactParams extends ChatScopedParams {
  readonly instructions?: string | undefined;
}

/** `abort` — cancel an in-flight turn (lock-free; owner-of-the-turn only — rollback-theft defense). */
export interface AbortParams extends ChatScopedParams {}

// ─────────────────────────────────────────────────────────────────────────────
// canon edits
// ─────────────────────────────────────────────────────────────────────────────

/** `selectVariant` — flip `messages.selectedVariantId` to a sibling swipe (pointer move, zero copy — D26). */
export interface SelectVariantParams extends MessageScopedParams {
  readonly variantId: MessageVariantId;
}

/** `editMessage` — edit the SELECTED variant's content in place (a `runOnEdit` regex re-applies — chat.md §7). */
export interface EditMessageParams extends MessageScopedParams {
  readonly content: string;
}

/** `setMessageHidden` — toggle `excludedFromPrompt` (held out of assembly; the row survives). */
export interface SetMessageHiddenParams extends MessageScopedParams {
  readonly hidden: boolean;
}

/** `deleteMessages` — delete a set of slots (author-or-host; cascades their variants). */
export interface DeleteMessagesParams extends ChatScopedParams {
  readonly messageIds: readonly MessageId[];
}

export interface EditReasoningParams extends MessageScopedParams {
  readonly reasoning: string;
}

export interface ClearReasoningParams extends MessageScopedParams {}

/** `moveMessage` — reorder a slot to a new seq position (re-stamps the canon order). */
export interface MoveMessageParams extends MessageScopedParams {
  readonly toSeq: number;
}

/** `duplicateMessage` — copy a slot + its selected variant to a new tail slot. */
export interface DuplicateMessageParams extends MessageScopedParams {}

/** `forkChat` — deep COPY the chat (+ messages/variants) into a new membership-scoped chat (D27); the only
 *  link is `chats.parentChatId`. `throughSeq` truncates the copy at a point in history (absent ⇒ whole chat). */
export interface ForkChatParams extends ChatScopedParams {
  readonly throughSeq?: number | undefined;
  readonly title?: string | null | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// injections
// ─────────────────────────────────────────────────────────────────────────────

/** `setChatInjection` — upsert a persisted positional injection (the `ChatInjection` wire shape). `id` set ⇒
 *  update; absent ⇒ create. */
export interface SetChatInjectionParams extends ChatScopedParams {
  readonly id?: ChatInjectionId | undefined;
  readonly position: "before_prompt" | "in_static" | "in_prompt" | "in_chat";
  readonly depth: number;
  readonly role: MessageRole;
  readonly content: string;
  readonly order?: number | undefined;
}

export interface ListChatInjectionsParams extends ChatScopedParams {}

export interface DeleteChatInjectionParams extends ChatScopedParams {
  readonly injectionId: ChatInjectionId;
}

// ─────────────────────────────────────────────────────────────────────────────
// variables
// ─────────────────────────────────────────────────────────────────────────────

/** `getVariables` — the EFFECTIVE ChoiceBlock variables computed for the next turn. */
export interface GetVariablesParams extends ChatScopedParams {}

/** `getStoredVariables` — the persisted `chats.variableValues` flush (chat.md L547 persisted canon). */
export interface GetStoredVariablesParams extends ChatScopedParams {}

/** `setVariables` — flush a `{{var}}`→value map to `chats.variableValues`. */
export interface SetVariablesParams extends ChatScopedParams {
  readonly values: Record<string, string>;
}

export interface ClearVariablesParams extends ChatScopedParams {}

// ─────────────────────────────────────────────────────────────────────────────
// chat-row
// ─────────────────────────────────────────────────────────────────────────────

/** `delete` — delete the chat (host-only; cascades messages/roster/invites/etc.). */
export interface DeleteChatParams extends ChatScopedParams {}

/** `reapTemporaryChats` — sweep the caller's expired temporary chats (a maintenance lever, principal-scoped). */
export interface ReapTemporaryChatsParams extends ChatActorParams {}

export interface UpdateTitleParams extends ChatScopedParams {
  readonly title: string | null;
}

export interface StarChatParams extends ChatScopedParams {
  readonly star: boolean;
}

export interface ArchiveChatParams extends ChatScopedParams {
  readonly archived: boolean;
}

/** `reattributeMessages` — re-stamp the `characterId` attribution of a set of slots (host-only; a swipe never
 *  re-voices, but a deliberate re-attribution does — chat.md self-heal hash-diff). */
export interface ReattributeMessagesParams extends ChatScopedParams {
  readonly messageIds: readonly MessageId[];
  readonly characterId: CharacterId;
}

// ─────────────────────────────────────────────────────────────────────────────
// group / roster
// ─────────────────────────────────────────────────────────────────────────────

/** `setGroupConfig` — host-only write of the `chatMetadata.group` sub-blob (parsed → fully-defaulted). */
export interface SetGroupConfigParams extends ChatScopedParams {
  readonly config: GroupConfigInput;
}

/** `addCharacterToChat` — add a character to the roster (host-only; the ONE participant-insert chokepoint for
 *  characters — D16). */
export interface AddCharacterToChatParams extends ChatScopedParams {
  readonly characterId: CharacterId;
}

/** `seatAgent` — seat an agent principal in the roster (host-gated; the ONE agent-seat chokepoint — D60,
 *  doc 04 §3). The host consents to the seat; the OWNER (whose agent/buddy this is) must be a present member
 *  (owner==host collapses to one call). The principal is lazily minted via `provisionAgentPrincipal`. */
export interface SeatAgentParams extends ChatScopedParams {
  /** Whose agent to seat (v1: whose buddy) — must be a present human member of the room. */
  readonly ownerUserId: UserId;
  /** The agent flavor driving the seat (`AGENT_SOURCE_KINDS`; v1 = `'buddy'`). */
  readonly sourceKind: AgentSourceKind;
}

/** `setRoomOverrides` — host-only write of the four-field `chatMetadata.roomOverrides` allowlist (Part III §9). */
export interface SetRoomOverridesParams extends ChatScopedParams {
  readonly overrides: RoomOverrides;
}

export interface GetGroupConfigForChatParams extends ChatScopedParams {}

export interface GetRoomOverridesForChatParams extends ChatScopedParams {}

/** `setParticipantDisabled` — mute/unmute a roster participant (host-only; cards/WI still contribute). */
export interface SetParticipantDisabledParams extends ChatScopedParams {
  readonly characterId: CharacterId;
  readonly disabled: boolean;
}

/** `setParticipantTalkativeness` — set a participant's 0–1 arbitration sampling weight (host-only). */
export interface SetParticipantTalkativenessParams extends ChatScopedParams {
  readonly characterId: CharacterId;
  readonly talkativeness: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// invites (the ONE participant-insert chokepoint; token mirrors sessions — Part III §2)
// ─────────────────────────────────────────────────────────────────────────────

/** `createInvite` — host-only. Mint a share-link OR targeted-by-handle invite. The `token` is CSPRNG-minted
 *  + stored HASHED server-side (NEVER raw — mirror the `sessions` discipline); the raw token is returned
 *  ONCE in the result (for the `/join/:token` link), never persisted raw, never in an `InviteView`. */
export interface CreateInviteParams extends ChatScopedParams {
  readonly input: CreateInviteInput;
}

/** `previewInvite` — the preview-then-confirm read (Part III §2): carries the RAW token; returns the MINIMAL
 *  preview (room name / host handle / member count / mode label — NO roster identities, NO history). The
 *  caller is an authed user considering the join (no chatId — the token identifies the room). */
export interface PreviewInviteParams extends ChatActorParams {
  readonly input: PreviewInviteInput;
}

/** `redeemInvite` — THE participant-insert chokepoint (atomic conditional redeem → insert with `role`
 *  server-forced `member` + `joinSeq` stamped; the re-add upsert lives here too — Part III §1/§2). Carries the
 *  RAW token; no chatId (the token identifies the room). This is the ONLY public join path for a human (a
 *  standalone `join` verb does NOT exist — see the handoff note). */
export interface RedeemInviteParams extends ChatActorParams {
  readonly input: RedeemInviteInput;
}

/** `revokeInvite` — host-only. Invalidate an outstanding invite (status → `revoked`). */
export interface RevokeInviteParams extends ChatScopedParams {
  readonly inviteId: ChatInviteId;
}

/** `declineInvite` — first-class decline of a TARGETED invite the caller was notified about (status →
 *  `declined`). Keyed by `inviteId` (carried in the notification), not the raw token. */
export interface DeclineInviteParams extends ChatActorParams {
  readonly inviteId: ChatInviteId;
}

// ─────────────────────────────────────────────────────────────────────────────
// membership lifecycle (host-gated where authority — Part III §1/§2)
// ─────────────────────────────────────────────────────────────────────────────

/** `kick` — host-only. Remove a member (set `leftSeq` + SSE teardown within the kick tx + `notifications.emit`
 *  to the removed user). Targets the member's `userId`. */
export interface KickParticipantParams extends ChatScopedParams {
  readonly userId: UserId;
}

/** `selfLeave` — a member leaves their own membership (set `leftSeq`; authored rows are retained, the persona
 *  drops from the cast). A SOLE-host self-leave archives the room (never refused — Part III §2). */
export interface SelfLeaveParams extends ChatScopedParams {}

/** `nominateHostHandoff` — host-only, step 1 of the two-party handoff (Part III §2): nominate a member as the
 *  new host → `notifications.emit` to the nominee. The role swap happens only on the nominee's accept. (The
 *  two-party handoff is modelled as TWO verbs — nominate + accept — see the handoff note.) */
export interface NominateHostHandoffParams extends ChatScopedParams {
  /** The nominee (an existing member who will become host on accept). */
  readonly userId: UserId;
}

/** `acceptHostHandoff` — step 2: the nominee accepts (after the un-spoofable "what your credentials will
 *  power" confirmation) → atomic role swap. The caller IS the nominee (self-action). */
export interface AcceptHostHandoffParams extends ChatScopedParams {}
