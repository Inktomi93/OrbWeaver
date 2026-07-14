// domain/chat/contract/service — the ChatService interface: the read-this-to-know-everything public
// surface. Groups: reads/lifecycle · turn-running · canon-edits · injections · variables · chat-row ·
// group/roster · invites · membership-lifecycle.
//
// Membership-scoped: every chatId verb resolves `requireParticipant`/`requireHost(principal, chatId)` —
// there is no `ownerId`. Host-only verbs resolve `requireHost`. The turn path freezes the identity triple
// (`triggeredBy`/`runAsUserId`) internally — the caller never passes them.
//
// `generateOpening` is internal (injected into `startChat`, not on this interface). `redeemInvite` is the
// one participant-insert chokepoint AND the only public human-join path — there is no standalone `join`
// verb. The two-party host handoff is modelled as two verbs (nominate + accept).

import type { GroupConfig, RoomOverrides } from "@orb/contracts/chat";
import type { PromptConfig } from "@orb/contracts/preset";
import type {
  AbortParams,
  AcceptHostHandoffParams,
  AcceptInviteParams,
  AddCharacterToChatParams,
  ArchiveChatParams,
  ChatEventBoundsParams,
  ClearReasoningParams,
  ClearVariablesParams,
  CompactParams,
  ContinueTurnParams,
  CreateInviteParams,
  DeclineInviteParams,
  DeleteChatInjectionParams,
  DeleteChatParams,
  DeleteMessagesParams,
  DuplicateMessageParams,
  EditMessageParams,
  EditReasoningParams,
  ForceCharacterTurnParams,
  ForkChatParams,
  GenerateImageParams,
  GenerateParams,
  GetActivePresetConfigParams,
  GetChatLineageParams,
  GetChatParams,
  GetGroupConfigForChatParams,
  GetRoomOverridesForChatParams,
  GetStoredVariablesParams,
  GetVariablesParams,
  ImpersonateParams,
  KickParticipantParams,
  ListChatInjectionsParams,
  ListChatsParams,
  ListForksParams,
  ListInvitesParams,
  ListMessagesParams,
  ListMessageVariantsParams,
  ListParticipantsParams,
  MoveMessageParams,
  NominateHostHandoffParams,
  PeekPromptParams,
  PreviewAssemblyParams,
  PreviewInviteParams,
  PreviewSectionParams,
  ReapTemporaryChatsParams,
  ReattributeMessagesParams,
  ReattributePersonaParams,
  RedeemInviteParams,
  ReplayChatEventsParams,
  ReplayStreamEventsParams,
  RevertContinueParams,
  RevokeInviteParams,
  SeatAgentParams,
  SelectVariantParams,
  SelfLeaveParams,
  SendParams,
  SetChatAnchorPersonaParams,
  SetChatInjectionParams,
  SetGroupConfigParams,
  SetMessageHiddenParams,
  SetParticipantDisabledParams,
  SetParticipantTalkativenessParams,
  SetRoomOverridesParams,
  SetVariablesParams,
  StarChatParams,
  StartChatParams,
  StreamEventBoundsParams,
  SwipeParams,
  UndoContinueParams,
  UpdateTitleParams,
} from "./params";
import type {
  CompactResult,
  CreateInviteResult,
  DrainDeferredTurnsScope,
  DrainReport,
  ForkResult,
  ReapResult,
  RedeemInviteResult,
  StartChatResult,
  TurnOutcome,
  VariablesResult,
} from "./results";
import type {
  AssembledPrompt,
  AssemblyPreview,
  ChatBusReplayEvent,
  ChatDetail,
  ChatInjectionView,
  ChatLineageView,
  ChatStreamReplayEvent,
  ChatSummary,
  InvitePreview,
  InviteView,
  MessagesPage,
  MessageVariantSummary,
  MessageView,
  ParticipantView,
  SectionPreview,
  StreamEventBounds,
} from "./views";

export interface ChatService {
  // ── reads / lifecycle ───────────────────────────────────────────────────────
  /** Lazy chat+roster creation with greeting/verbatim seeding + the first-turn delegate. The caller
   *  becomes the `host` participant; the founding characters join the roster. */
  readonly startChat: (params: StartChatParams) => Promise<StartChatResult>;
  /** The caller's chats (pure membership — host or member), newest activity first. */
  readonly listChats: (params: ListChatsParams) => Promise<ChatSummary[]>;
  /** The membership-scoped fork children of a chat. */
  readonly listForks: (params: ListForksParams) => Promise<ChatSummary[]>;
  /** The fork ancestry chain, membership-gated per ancestor (a fork grants no parent membership). */
  readonly getChatLineage: (params: GetChatLineageParams) => Promise<ChatLineageView>;
  /** One chat resolved (row + present roster + effective room behavior). Throws `ChatNotFoundError` when
   *  missing or the caller is not a participant (leak-free). */
  readonly getChat: (params: GetChatParams) => Promise<ChatDetail>;
  /** The assembled prompt + trace for a hypothetical turn (host/admin debug surface). */
  readonly previewAssembly: (params: PreviewAssemblyParams) => Promise<AssemblyPreview>;
  /** The resolved `PromptConfig` the chat assembles against. */
  readonly getActivePresetConfig: (params: GetActivePresetConfigParams) => Promise<PromptConfig>;
  /** One section's render preview (the COMPOSER/editor surface). */
  readonly previewSection: (params: PreviewSectionParams) => Promise<SectionPreview>;
  /** The assembled prompt for the NEXT real turn (no generation). */
  readonly peekPrompt: (params: PeekPromptParams) => Promise<AssembledPrompt>;
  /** Paged canon read — each slot joined to its selected variant + the page's macro name producer. */
  readonly listMessages: (params: ListMessagesParams) => Promise<MessagesPage>;
  /** The full sibling-variant set for one slot — `{variantId, idx}[]` ordered by idx, no content. */
  readonly listMessageVariants: (
    params: ListMessageVariantsParams,
  ) => Promise<MessageVariantSummary[]>;
  /** The resolved present roster. */
  readonly listParticipants: (params: ListParticipantsParams) => Promise<ParticipantView[]>;
  /** Resume the SSE token log from a cursor (late-subscriber ramp-up). */
  readonly replayStreamEvents: (
    params: ReplayStreamEventsParams,
  ) => Promise<ChatStreamReplayEvent[]>;
  /** The retained stream-log replay-cursor bounds (min/max seq). */
  readonly streamEventBounds: (params: StreamEventBoundsParams) => Promise<StreamEventBounds>;
  /** Resume the durable chat-bus log from a cursor (the `chat.streamMessages` SSE reconnect replay). */
  readonly replayChatEvents: (params: ReplayChatEventsParams) => Promise<ChatBusReplayEvent[]>;
  /** The durable bus-log cursor bounds — also the SSE per-yield membership gate (member-scoped read). */
  readonly chatEventBounds: (params: ChatEventBoundsParams) => Promise<StreamEventBounds>;

  // ── turn-running ──────────────────────────────────────────────────────────────
  /** Persist a user message (SEND-regex applied) then run the AI turn (arbitration → per-speaker/narrator). */
  readonly send: (params: SendParams) => Promise<TurnOutcome>;
  /** Append a fresh variant to an assistant slot (reroll; slot attribution unchanged). */
  readonly swipe: (params: SwipeParams) => Promise<TurnOutcome>;
  /** Generate a USER-side message as the active persona. */
  readonly impersonate: (params: ImpersonateParams) => Promise<TurnOutcome>;
  /** A lock-free auxiliary generation (runs concurrent with a locked send; active-turns Set). */
  readonly generate: (params: GenerateParams) => Promise<TurnOutcome>;
  /** Extend the tail assistant message in place (continue snapshot per-variant). */
  readonly continueTurn: (params: ContinueTurnParams) => Promise<TurnOutcome>;
  /** Revert the last continuation on a variant (restores `preContinue*`). */
  readonly undoContinue: (params: UndoContinueParams) => Promise<MessageView>;
  /** Re-apply the last reverted continuation (the redo twin). */
  readonly revertContinue: (params: RevertContinueParams) => Promise<MessageView>;
  /** Force a specific roster character to speak next (host-only). */
  readonly forceCharacterTurn: (params: ForceCharacterTurnParams) => Promise<TurnOutcome>;
  /** The manual compaction lever (produces the portable D25 checkpoint). */
  readonly compact: (params: CompactParams) => Promise<CompactResult>;
  /** Cancel an in-flight turn (lock-free; turn-owner only — rollback-theft defense). */
  readonly abort: (params: AbortParams) => Promise<void>;
  /** Drain the durable `pending_turns` queue (Part III §5): reconstruct + run each host-offline DEFERRED AI
   *  response through the engine (which re-validates consent/budget in-lock), or DROP it on a re-validation
   *  refusal. System-triggered (no principal): the boot reclaim (`{all:true}`) + the host-return drain
   *  (`{hostUserId}`). The durable row is consumed either way. */
  readonly drainDeferredTurns: (scope: DrainDeferredTurnsScope) => Promise<DrainReport>;
  /** Generate image(s) via the injected imagery op + persist one caller-authored message with `asset:`
   *  refs. Returns the committed message view. */
  readonly generateImage: (params: GenerateImageParams) => Promise<MessageView>;

  // ── canon edits ───────────────────────────────────────────────────────────────
  /** Flip `selectedVariantId` to a sibling swipe (pointer move, zero copy). */
  readonly selectVariant: (params: SelectVariantParams) => Promise<MessageView>;
  /** Edit the selected variant's content (author-or-host; self-label purify, then the `runOnEdit`
   *  host-tier regex re-applies before persist — assistant slot ⇒ AI_OUTPUT, user slot ⇒ USER_INPUT). */
  readonly editMessage: (params: EditMessageParams) => Promise<MessageView>;
  /** Toggle `excludedFromPrompt` (held out of assembly; the row survives). */
  readonly setMessageHidden: (params: SetMessageHiddenParams) => Promise<MessageView>;
  /** Delete a set of slots (author-or-host; cascades variants). */
  readonly deleteMessages: (params: DeleteMessagesParams) => Promise<void>;
  readonly editReasoning: (params: EditReasoningParams) => Promise<MessageView>;
  readonly clearReasoning: (params: ClearReasoningParams) => Promise<MessageView>;
  /** Reorder a slot to a new seq (re-stamps canon order). */
  readonly moveMessage: (params: MoveMessageParams) => Promise<void>;
  /** Copy a slot + its selected variant to a new tail slot. */
  readonly duplicateMessage: (params: DuplicateMessageParams) => Promise<MessageView>;
  /** Deep copy the chat into a new membership-scoped chat (`parentChatId` lineage). */
  readonly forkChat: (params: ForkChatParams) => Promise<ForkResult>;

  // ── injections ────────────────────────────────────────────────────────────────
  /** Upsert a persisted positional injection (the `ChatInjection` wire shape). */
  readonly setChatInjection: (params: SetChatInjectionParams) => Promise<ChatInjectionView>;
  readonly listChatInjections: (params: ListChatInjectionsParams) => Promise<ChatInjectionView[]>;
  readonly deleteChatInjection: (params: DeleteChatInjectionParams) => Promise<void>;

  // ── variables ─────────────────────────────────────────────────────────────────
  /** The EFFECTIVE ChoiceBlock variables computed for the next turn. */
  readonly getVariables: (params: GetVariablesParams) => Promise<VariablesResult>;
  /** The persisted `chats.variableValues` flush. */
  readonly getStoredVariables: (params: GetStoredVariablesParams) => Promise<VariablesResult>;
  readonly setVariables: (params: SetVariablesParams) => Promise<void>;
  readonly clearVariables: (params: ClearVariablesParams) => Promise<void>;

  // ── chat-row ──────────────────────────────────────────────────────────────────
  /** Delete the chat (host-only; cascades messages/roster/invites/etc.). */
  readonly delete: (params: DeleteChatParams) => Promise<void>;
  /** Sweep the caller's expired temporary chats (maintenance lever). */
  readonly reapTemporaryChats: (params: ReapTemporaryChatsParams) => Promise<ReapResult>;
  readonly updateTitle: (params: UpdateTitleParams) => Promise<void>;
  readonly star: (params: StarChatParams) => Promise<void>;
  readonly archive: (params: ArchiveChatParams) => Promise<void>;
  /** Manual/host re-pin of the anchor persona, host-only — mid-chat change of `chats.anchorPersonaId`.
   *  `null` clears it. The target persona (non-null) must be owned by a present human participant. */
  readonly setChatAnchorPersona: (params: SetChatAnchorPersonaParams) => Promise<void>;
  /** Re-stamp the `characterId` attribution of a set of slots (host-only; self-heal hash-diff). */
  readonly reattributeMessages: (params: ReattributeMessagesParams) => Promise<void>;
  /** Re-stamp the authoring `personaId` of a set of user slots (author-or-host per row; the target
   *  persona must be owned by each row's author). */
  readonly reattributePersona: (params: ReattributePersonaParams) => Promise<void>;

  // ── group / roster ──────────────────────────────────────────────────────────────
  /** Host-only write of the `chatMetadata.group` sub-blob (parsed → fully-defaulted). */
  readonly setGroupConfig: (params: SetGroupConfigParams) => Promise<GroupConfig>;
  /** Add a character to the roster (host-only; the one character participant-insert chokepoint). */
  readonly addCharacterToChat: (params: AddCharacterToChatParams) => Promise<ParticipantView>;
  /** Seat an agent principal in the roster (host-gated). The owner (whose agent) must be a present
   *  member; the principal is lazily minted. Idempotent re-seat. */
  readonly seatAgent: (params: SeatAgentParams) => Promise<ParticipantView>;
  /** Host-only write of the four-field `chatMetadata.roomOverrides` allowlist. */
  readonly setRoomOverrides: (params: SetRoomOverridesParams) => Promise<RoomOverrides>;
  readonly getGroupConfigForChat: (params: GetGroupConfigForChatParams) => Promise<GroupConfig>;
  readonly getRoomOverridesForChat: (
    params: GetRoomOverridesForChatParams,
  ) => Promise<RoomOverrides>;
  /** Mute/unmute a roster participant (host-only; cards/WI still contribute). */
  readonly setParticipantDisabled: (
    params: SetParticipantDisabledParams,
  ) => Promise<ParticipantView>;
  /** Set a participant's 0–1 arbitration sampling weight (host-only). */
  readonly setParticipantTalkativeness: (
    params: SetParticipantTalkativenessParams,
  ) => Promise<ParticipantView>;

  // ── invites (the one participant-insert chokepoint) ──────────
  /** Mint a share-link / targeted invite (host-only). Returns the persisted `InviteView` + the raw token
   *  once for the `/join/:token` link (stored hashed; never raw again). */
  readonly createInvite: (params: CreateInviteParams) => Promise<CreateInviteResult>;
  /** Preview-then-confirm read (carries the raw token): room name / host handle / member count / mode
   *  label only — no roster identities, no history. */
  readonly previewInvite: (params: PreviewInviteParams) => Promise<InvitePreview>;
  /** Redeem an invite — the participant-insert chokepoint (atomic; `role` server-forced `member`, `joinSeq`
   *  stamped). The only public human-join path. */
  readonly redeemInvite: (params: RedeemInviteParams) => Promise<RedeemInviteResult>;
  /** Accept a targeted invite by id — the token-free in-app join (self-authorizing: bound to
   *  `invitedUserId`). A share-link / foreign / invalid / spent invite is a leak-free NOT_FOUND. */
  readonly acceptInvite: (params: AcceptInviteParams) => Promise<RedeemInviteResult>;
  /** Revoke an outstanding invite (host-only; status → `revoked`). */
  readonly revokeInvite: (params: RevokeInviteParams) => Promise<void>;
  /** Every invite for the chat as `InviteView`s (`remainingUses` computed; tokens never re-derivable).
   *  Host-only, newest-first. */
  readonly listInvites: (params: ListInvitesParams) => Promise<readonly InviteView[]>;
  /** Decline a targeted invite the caller was notified about (status → `declined`). */
  readonly declineInvite: (params: DeclineInviteParams) => Promise<void>;

  // ── membership lifecycle (host-gated where authority applies) ─────────────────────────────
  /** Remove a member (host-only; sets `leftSeq` + SSE teardown in the kick tx + notifies the removed user). */
  readonly kick: (params: KickParticipantParams) => Promise<void>;
  /** Leave your own membership (authored rows retained, persona drops; a sole-host self-leave archives). */
  readonly selfLeave: (params: SelfLeaveParams) => Promise<void>;
  /** Two-party host handoff, step 1 — nominate a member as the new host (host-only; notifies the nominee). */
  readonly nominateHostHandoff: (params: NominateHostHandoffParams) => Promise<void>;
  /** Two-party host handoff, step 2 — the nominee accepts (self-action) → atomic role swap. */
  readonly acceptHostHandoff: (params: AcceptHostHandoffParams) => Promise<void>;
}
