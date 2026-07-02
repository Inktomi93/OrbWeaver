// domain/chat/contract/service — the ChatService interface: the read-this-to-know-everything public surface
// (chat.md Part I §"Public surface" + Part III §1/§2). Written WHOLE now so verb-impl chunks never re-touch
// this file. Groups: reads/lifecycle · turn-running · canon-edits · injections · variables · chat-row ·
// group/roster · invites · membership-lifecycle.
//
// MEMBERSHIP-scoped (D18): every chatId verb resolves `requireParticipant`/`requireHost(principal, chatId)`
// — there is no `ownerId`, no owner-equality. Host-only verbs (roster mutation, group-config, room-overrides,
// force-character, delete, createInvite/revokeInvite, kick, nominateHostHandoff) resolve `requireHost`. The
// TURN path freezes the D19 identity triple (`triggeredBy`/`runAsUserId`) internally — the caller never
// passes them.
//
// `generateOpening` is INTERNAL (injected into `startChat`, NOT on this interface — chat.md §"Public surface").
// The invite + membership-lifecycle surface (createInvite/previewInvite/redeemInvite/revokeInvite/
// declineInvite · kick/selfLeave/nominateHostHandoff/acceptHostHandoff) is sourced from chat.md Part III §1/§2
// + the 8-slot `verbs/{invites,roster}.ts` (the prose's "54 verbs" headline under-listed them). `redeemInvite`
// is the ONE participant-insert chokepoint AND the only public human-join path — there is NO standalone `join`
// verb (re-add rides the redeem upsert; characters join via `addCharacterToChat`). The two-party host handoff
// is modelled as TWO verbs (nominate + accept). The "@public" memory/persistence helpers (loadChatMeta/
// generateDigests/…) are wired through the FRONT DOOR for the composition root, not this tRPC surface.

// GroupConfig / RoomOverrides are the canonical @orb/contracts/chat shapes — referenced for the
// group/roster read+write results (one home, no re-spell).
import type { GroupConfig, RoomOverrides } from "@orb/contracts/chat";
import type { PromptConfig } from "@orb/contracts/preset";
import type {
  AbortParams,
  AcceptHostHandoffParams,
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
  ListMessagesParams,
  ListParticipantsParams,
  MoveMessageParams,
  NominateHostHandoffParams,
  PeekPromptParams,
  PreviewAssemblyParams,
  PreviewInviteParams,
  PreviewSectionParams,
  ReapTemporaryChatsParams,
  ReattributeMessagesParams,
  RedeemInviteParams,
  ReplayChatEventsParams,
  ReplayStreamEventsParams,
  RevertContinueParams,
  RevokeInviteParams,
  SelectVariantParams,
  SelfLeaveParams,
  SendParams,
  SetChatInjectionParams,
  SetGroupConfigParams,
  SetMessageHiddenParams,
  SetParticipantDisabledParams,
  SetParticipantTalkativenessParams,
  SetRoomOverridesParams,
  SetVariablesParams,
  SimpleSendParams,
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
  MessageView,
  ParticipantView,
  SectionPreview,
  StreamEventBounds,
} from "./views";

export interface ChatService {
  // ── reads / lifecycle ───────────────────────────────────────────────────────
  /** Lazy chat+roster creation with greeting/verbatim seeding + the first-turn delegate (D28 live-identity
   *  roster). The caller becomes the `host` participant; the founding characters join the roster. */
  readonly startChat: (params: StartChatParams) => Promise<StartChatResult>;
  /** The caller's chats (pure membership — host OR member; D18), newest activity first. */
  readonly listChats: (params: ListChatsParams) => Promise<ChatSummary[]>;
  /** The membership-scoped fork CHILDREN of a chat (the `parentChatId` index; D27). */
  readonly listForks: (params: ListForksParams) => Promise<ChatSummary[]>;
  /** The fork ancestry chain, membership-gated per ancestor (a fork grants NO parent membership — inv §16). */
  readonly getChatLineage: (params: GetChatLineageParams) => Promise<ChatLineageView>;
  /** One chat resolved (row + present roster + effective room behavior). Throws `ChatNotFoundError` when
   *  missing OR the caller is not a participant (leak-free). */
  readonly getChat: (params: GetChatParams) => Promise<ChatDetail>;
  /** The assembled prompt + trace for a hypothetical turn (host/admin debug surface). */
  readonly previewAssembly: (params: PreviewAssemblyParams) => Promise<AssemblyPreview>;
  /** The resolved `PromptConfig` the chat assembles against. */
  readonly getActivePresetConfig: (params: GetActivePresetConfigParams) => Promise<PromptConfig>;
  /** One section's render preview (the COMPOSER/editor surface). */
  readonly previewSection: (params: PreviewSectionParams) => Promise<SectionPreview>;
  /** The assembled prompt for the NEXT real turn (no generation). */
  readonly peekPrompt: (params: PeekPromptParams) => Promise<AssembledPrompt>;
  /** Paged canon read — each slot joined to its selected variant (D26). */
  readonly listMessages: (params: ListMessagesParams) => Promise<MessageView[]>;
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
  /** Append a fresh variant to an assistant slot (reroll; D26 — slot attribution unchanged). */
  readonly swipe: (params: SwipeParams) => Promise<TurnOutcome>;
  /** Generate a USER-side message as the active persona. */
  readonly impersonate: (params: ImpersonateParams) => Promise<TurnOutcome>;
  /** A lock-free auxiliary generation (runs concurrent with a locked send; active-turns Set). */
  readonly generate: (params: GenerateParams) => Promise<TurnOutcome>;
  /** The lightweight single-message send (no group machinery). */
  readonly simpleSend: (params: SimpleSendParams) => Promise<TurnOutcome>;
  /** Extend the tail assistant message in place (continue snapshot per-variant, D26). */
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

  // ── canon edits ───────────────────────────────────────────────────────────────
  /** Flip `selectedVariantId` to a sibling swipe (pointer move, zero copy — D26). */
  readonly selectVariant: (params: SelectVariantParams) => Promise<MessageView>;
  /** Edit the selected variant's content (author-or-host; `runOnEdit` regex re-applies). */
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
  /** Deep COPY the chat into a new membership-scoped chat (D27; `parentChatId` lineage). */
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
  /** Re-stamp the `characterId` attribution of a set of slots (host-only; self-heal hash-diff). */
  readonly reattributeMessages: (params: ReattributeMessagesParams) => Promise<void>;

  // ── group / roster ──────────────────────────────────────────────────────────────
  /** Host-only write of the `chatMetadata.group` sub-blob (parsed → fully-defaulted). */
  readonly setGroupConfig: (params: SetGroupConfigParams) => Promise<GroupConfig>;
  /** Add a character to the roster (host-only; the ONE character participant-insert chokepoint — D16). */
  readonly addCharacterToChat: (params: AddCharacterToChatParams) => Promise<ParticipantView>;
  /** Host-only write of the four-field `chatMetadata.roomOverrides` allowlist (Part III §9). */
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

  // ── invites (the ONE participant-insert chokepoint; token mirrors sessions — Part III §2) ──────────
  /** Mint a share-link / targeted invite (host-only). Returns the persisted `InviteView` + the RAW token
   *  ONCE for the `/join/:token` link (stored HASHED; never raw again — sessions discipline). */
  readonly createInvite: (params: CreateInviteParams) => Promise<CreateInviteResult>;
  /** Preview-then-confirm read (carries the raw token): room name / host handle / member count / mode label
   *  ONLY — NO roster identities, NO history (those replay from `joinSeq` after accept). */
  readonly previewInvite: (params: PreviewInviteParams) => Promise<InvitePreview>;
  /** Redeem an invite — THE participant-insert chokepoint (atomic; `role` server-forced `member`, `joinSeq`
   *  stamped; the re-add upsert lives here). The ONLY public human-join path (no standalone `join` verb). */
  readonly redeemInvite: (params: RedeemInviteParams) => Promise<RedeemInviteResult>;
  /** Revoke an outstanding invite (host-only; status → `revoked`). */
  readonly revokeInvite: (params: RevokeInviteParams) => Promise<void>;
  /** Decline a targeted invite the caller was notified about (status → `declined`). */
  readonly declineInvite: (params: DeclineInviteParams) => Promise<void>;

  // ── membership lifecycle (host-gated where authority — Part III §1/§2) ─────────────────────────────
  /** Remove a member (host-only; sets `leftSeq` + SSE teardown in the kick tx + notifies the removed user). */
  readonly kick: (params: KickParticipantParams) => Promise<void>;
  /** Leave your own membership (authored rows retained, persona drops; a sole-host self-leave archives). */
  readonly selfLeave: (params: SelfLeaveParams) => Promise<void>;
  /** Two-party host handoff, step 1 — nominate a member as the new host (host-only; notifies the nominee). */
  readonly nominateHostHandoff: (params: NominateHostHandoffParams) => Promise<void>;
  /** Two-party host handoff, step 2 — the nominee accepts (self-action) → atomic role swap. */
  readonly acceptHostHandoff: (params: AcceptHostHandoffParams) => Promise<void>;
}
