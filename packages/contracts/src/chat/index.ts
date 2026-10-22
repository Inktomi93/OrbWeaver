// @orb/contracts/chat — the front-door for the chat wire contracts. The shapes are split across sibling
// modules by concern (D15's directory-module law: internals flat, this index re-exports, consumer-invisible):
//   • participants.ts   — participant kinds + drive/identity axes + the AI-speaker ref + `messageRoleSchema`
//                         + the MESSAGE-KIND axis (`MESSAGE_KINDS` / `MESSAGE_KIND_POLICY` — row PURPOSE)
//   • assemble.ts       — the ASSEMBLE family (slim projections, `AssembleContext`, traces, injections)
//   • messages.ts       — the D26 message/variant wire (`MessageView`, tool/var records)
//   • member-projection.ts — the pure §3.6 member projection of a `MessageView` (hidden-span and reasoning strip)
//   • producers.ts      — the member-gated kind-polymorphic CHAT IDENTITY producer (D137) + its two projections
//   • bus.ts            — the stream delta, the `ChatBusEvent` union, warning codes, turn origin, D50 transform
//   • metadata.ts       — the `chats.metadata` sub-blobs (roomOverrides/group/opening/visibility/steer)
//   • roster.ts         — the unified-roster wire (D16/D22/D80): roster/seat/invite/render-policy/history-floor
//   • detail.ts         — the full chat read (`ChatDetail`) + the invite join result that carries it
//   • content-blocks.ts — the D44 §12.4 render blocks + `contentSpansToBlocks`
//   • card-frame.ts     — the trust-gated card-frame doorway wire (mint request/response + the route)
//   • content-classes.ts — the content-class visibility registry (`CONTENT_CLASS_POLICY`)
//   • listing.ts        — the `listChats` KEYSET cursor (`chatListCursorSchema`)
//   • bulk-import.ts    — the chat-owned bulk-import op shapes (D34)
//   • prose.ts          — the PROSE-1 app-tier slot table (the side-generation prompts' shipped defaults)
//   • reactions.ts      — the B6 reaction emoji vocabulary + the grouped read projection (MA-2)
//   • visible-rooms.ts  — the leak-safe reverse-room read every usage roster shares (`VisibleRoomRef` +
//                         `ResolveVisibleRoomsOp`, D18)
//   • regex-tiers.ts    — the room's REGEX TIER vocabulary (#1742): the tier key, the per-chat allow blob,
//                         the per-seat character slice, and the `chat.listEffectiveRegex` view
//
// LAWS honored across these modules:
//   • Turn identity (D19): a wire shape that carries turn attribution uses `triggeredBy`/`runAsUserId`,
//     NEVER `callerUserId`. No bus event here carries a caller id.
//   • No `chats.ownerId` (D18): chats are membership-scoped; no wire shape stamps a chat owner.
//   • Bus-payload allowlist: credentials/secrets/baseUrls are TYPE-LEVEL UNREPRESENTABLE in `ChatBusEvent`
//     — every member is a closed object literal of branded ids, enums, scalars, and `MessageView`.
//   • D26: `messages` is a pure SLOT (no content/economics); all generation content lives on
//     `message_variants`. `MessageView` is the slot joined with its selected variant.

export type { AdjustedKnob } from "./adjusted-knobs.ts";
export { ADJUSTED_KNOBS } from "./adjusted-knobs.ts";
export type {
  AssembleCharacter,
  AssembleContext,
  AssembledPrompt,
  AssemblePersona,
  AssembleTrace,
  AssembleWorldEntry,
  AssembleWorldEntryAttachment,
  AssemblyBudgetPart,
  AssemblyBudgetPreview,
  AssemblyBudgetSlice,
  AssemblySectionCost,
  AssemblySectionRow,
  AssemblySource,
  ChatInjection,
  ChatInjectionInput,
  ChatInjectionOrigin,
  ContextFitAnswer,
  ContextFitPreview,
  ContextFitUnbound,
  ContextLimit,
  MemoryRecallCandidate,
  MemoryRecallSlice,
  MemoryRecallVerdict,
  SectionPreview,
  ShapeBreakpointDecision,
  ShapeFoldReason,
  ShapeRowSource,
  ShapeTrace,
  ShapeTraceRow,
  VariantWireView,
} from "./assemble.ts";
export {
  ASSEMBLY_SOURCES,
  CHAT_INJECTION_POSITIONS,
  chatInjectionInputSchema,
  contextFitAnswerSchema,
  MEMORY_RECALL_REJECTS_SHOWN,
  SHAPE_BREAKPOINT_DECISIONS,
  sentPromptSchema,
  shapeTraceSchema,
  variantWireViewSchema,
} from "./assemble.ts";
// The two corpus-sweep workloads' params + results chat OWNS (the junk-drawer exit: a workload's wire shapes
// are authored by the OWNING domain) — `memory-backfill` + `group-character-backfill`.
export type { BackfillPassResult, ImportWindow, MemoryBackfillResult, MemoryBackfillWorkloadParams } from "./backfill.ts";
export { importWindowSchema, memoryBackfillWorkloadParams, mergeImportWindows } from "./backfill.ts";
export type {
  BulkImportChatInput,
  BulkImportChatsResult,
  BulkImportInjectionInput,
  BulkImportMessageInput,
  BulkImportSeatKnobs,
  BulkImportVariantInput,
  ImportedChatIdentity,
  PendingGenerationObservationInput,
} from "./bulk-import.ts";
export { pendingGenerationObservationsSchema } from "./bulk-import.ts";
export type {
  ChatBusEvent,
  ChatContentPart,
  ChatDeltaEvent,
  ChatSettingsAdjustedWarning,
  ChatWarning,
  ChatWarningCode,
  DurableChatBusEvent,
  LiveOnlyChatBusEvent,
  LiveOnlyChatEventType,
  MemoryRecallPhase,
  PlainChatWarningCode,
  PromptTransform,
  PromptTransformEnv,
  PromptTransformOutcome,
  PromptTransformPoint,
  PromptTransformResult,
  RoomEntityKind,
  TurnAbortReason,
  TurnInitiator,
  TurnIntent,
  TurnOrigin,
} from "./bus.ts";
export {
  AUTOMATION_DEPTH_HARD_CAP,
  CHAT_BUS_EVENT_TYPES,
  CHAT_WARNING_CODES,
  DEADLINE_ABORT_REASON,
  LIVE_ONLY_CHAT_EVENT_TYPES,
  PROMPT_TRANSFORM_ABORT_REASON_MAX,
  PROMPT_TRANSFORM_POINTS,
  PROVIDER_ADJUSTMENT_KINDS,
  ROOM_ENTITY_KINDS,
  TURN_ABORTED_OP_CODE,
  TURN_INITIATORS,
  TURN_LOCKED_OP_CODE,
  USER_MACRO_UNKNOWN_PICK_OP_CODE,
} from "./bus.ts";
export type { CardFrameMintRequest, CardFrameMintResponse } from "./card-frame.ts";
export { CARD_FRAME_MINT_BODY_MAX_BYTES, CARD_FRAME_ROUTE, cardFrameMintRequestSchema, cardFrameMintResponseSchema, cardFrameUrl } from "./card-frame.ts";
export type { CardTrust, ContentSpansToBlocksOptions, MessageContentBlock } from "./content-blocks.ts";
export { contentSpansToBlocks, messageContentBlockSchema } from "./content-blocks.ts";

export type { AnchorState, ChatDetail, RedeemInviteResult } from "./detail.ts";
export { chatDetailSchema, redeemInviteResultSchema, viewerGalleryCharacter } from "./detail.ts";
export type { HandoffCardCopy, HandoffCardPair, HandoffHealArgs } from "./handoff-context.ts";
export type { ImpersonateStreamDelta } from "./impersonation.ts";
export { impersonateStreamDeltaSchema } from "./impersonation.ts";
export { chatIdInputSchema, chatListInputSchema, listMessagesInputSchema } from "./inputs.ts";
export type { ChatLibraryLens } from "./library.ts";
export { chatCensusInputSchema } from "./library.ts";
export type { ChatListCursor } from "./listing.ts";
export { CHAT_LIST_MAX_LIMIT } from "./listing.ts";
export { memberToolCalls, projectViewForMember } from "./member-projection.ts";
export type { MessagesPage, MessageWindow } from "./message-pages.ts";
export { messagesPageSchema, messageWindowSchema } from "./message-pages.ts";
// `MacroFreeze` (the single occurrence) is NOT re-exported here — kit owns that shape and consumers import it
// from `@orb/kit/macro`; contracts owns only the persisted/wire ARRAY (`MacroFreezeRecord`) + its parse seam.
export type {
  ChatReasoningPart,
  ConnectionAttributionProvenance,
  ContentSignatures,
  CueRole,
  MacroFreezeRecord,
  MessageAssetOrigin,
  MessageView,
  ReasoningPartMeta,
  ReattributeScope,
  StandaloneVariableDelta,
  TextSignature,
  ToolCallEditAction,
  ToolCallRecord,
  UserMacroDraws,
  VariablePrecondition,
  VariableWriteResult,
  VariantMetadata,
  VariantProviderMetadata,
} from "./messages.ts";
export {
  CHAT_MESSAGE_LIST_MAX_LIMIT,
  CONNECTION_ATTRIBUTION_PROVENANCES,
  CUE_ROLES,
  chatReasoningPartSchema,
  INLINE_REPLY_ORIGIN,
  isSeededGreetingRow,
  legacyNotionalCostSamples,
  MESSAGE_ASSET_ORIGINS,
  macroFreezeRecordSchema,
  messageViewSchema,
  parseVariantMetadata,
  reattributeScopeSchema,
  standaloneVariableDeltasSchema,
  TOOL_CALL_EDIT_ACTIONS,
  toolCallRecordSchema,
  userMacroDrawsSchema,
  VARIANT_METADATA_REASONING_MS_KEY,
  VARIANT_METADATA_TOKEN_COUNT_KEY,
  variableDeltaSchema,
  variablePreconditionsSchema,
  variantProviderMetadataSchema,
  varOpSchema,
} from "./messages.ts";
export type {
  ChatMetadata,
  GroupConfig,
  GroupConfigInput,
  GroupPolicy,
  GuidedSteer,
  MemberCardVisibility,
  NormalizedGroupConfigInput,
  OpeningPolicy,
  RoomOverrides,
  SmartPicker,
} from "./metadata.ts";
export {
  DEFAULT_GROUP_CONFIG,
  DEFAULT_ROOM_OVERRIDES,
  GROUP_OUTPUT_LABELS,
  GROUP_POLICIES,
  GROUP_POLICY_LABELS,
  groupConfigInputSchema,
  groupConfigSchema,
  guidedSteerSchema,
  MEMBER_CARD_VISIBILITY_LEVELS,
  narratorPolicyOf,
  openingPolicySchema,
  resolveCharactersCanReact,
  resolveOfferChoices,
  resolveReactionsEnabled,
  roomOverridesSchema,
  SMART_PICKER_LABELS,
  SMART_UTILITY_SWITCH_LABEL,
  storedGroupConfigSchema,
} from "./metadata.ts";
export type { NextTurnConnectionView } from "./next-turn-connection.ts";
export { nextTurnConnectionViewSchema } from "./next-turn-connection.ts";
export type {
  ChatLivePublish,
  MemoryDigestInput,
  RequestTurnOp,
  RequestTurnParams,
  ResolveCharacterTagsOp,
  ResolveSeatDecoOp,
  ResolveSeatDecosOp,
  ResolveViewerVisibility,
  SeatDeco,
  SignupMinterCheckOp,
  StoreSegmentParams,
  TurnRetrievalEvents,
  ViewerVisibility,
} from "./owner-ops.ts";
export type { MessageKind, MessageKindPolicy, ParticipantKind, SpeakerRef } from "./participants.ts";
// B7 — the narrator-voice predicate, promoted from the client (the server's segment-anchor validation and
// the client picker must gate the plain-label span grammar identically).
export {
  DEFAULT_MESSAGE_KIND,
  isAiDriven,
  isNarratorVoiced,
  isUserBacked,
  MEMORY_INGEST_KINDS,
  MESSAGE_KIND_POLICY,
  MESSAGE_KINDS,
  messageKindSchema,
  messageRoleSchema,
  PARTICIPANT_KINDS,
  participantKindSchema,
  speakerKey,
} from "./participants.ts";
export type {
  ChatIdentity,
  ChatIdentityKind,
  ChatIdentityKindPolicy,
} from "./producers.ts";
export {
  buildIdentityAvatarMaps,
  buildIdentityNameContext,
  CHAT_IDENTITY_KIND_POLICY,
  identityKey,
} from "./producers.ts";
// The PROSE-1 app-tier slot table (census 74-81) — `#prose` imports it to compose `PROSE_SLOTS`.
export { CHAT_PROSE_SLOTS, CHAT_REACT_TOOL_DESCRIPTION } from "./prose.ts";
// B6/MR0 — the message-reaction vocabulary + the grouped read projection (MA-2); B7 adds the segment
// anchor, the `react` tool name and the attribution caps.
export type {
  ChatReactionsView,
  MessageReactionGroup,
  ReactAsCharacterResult,
  ReactionEmoji,
  ReactToolArgs,
  ReactToolOutcome,
} from "./reactions.ts";
export {
  CHAT_REACT_TOOL_NAME,
  CHAT_REACTION_SLOT_WINDOW,
  chatReactionsViewSchema,
  REACTION_ATTRIBUTION_CONTENT_CAP,
  REACTION_ATTRIBUTION_MAX_PER_MESSAGE,
  REACTION_ATTRIBUTION_SLOT_WINDOW,
  REACTION_EMOJIS,
  REACTION_SEGMENT_SNIPPET_MAX,
  REACTION_SPEAKER_NAME_MAX,
  reactionEmojiSchema,
  reactToolArgsSchema,
} from "./reactions.ts";
export type {
  CharacterRegexSlice,
  EffectiveRegexEntry,
  EffectiveRegexView,
  RegexTierGroupView,
  RegexTierKey,
  RegexTierRowView,
} from "./regex-tiers.ts";
export {
  characterRegexTierKey,
  effectiveRegexViewSchema,
  type HostTierRegexAllow,
  hostTierRegexAllowSchema,
  isRegexEnabledInChat,
  isRegexTierAllowed,
  parseCharacterRegexTierKey,
  regexTierAllowSchema,
  regexTierKeySchema,
} from "./regex-tiers.ts";
export type {
  CarriedAppearance,
  CharacterMemberSpec,
  CreateInviteInput,
  CreateInviteResult,
  DeploymentRenderPolicy,
  HandoffOffer,
  HandoffOfferContents,
  HistoryFloorSeq,
  HtmlTrustStep,
  InvitePreview,
  InviteView,
  JoinHistoryVisibility,
  MemberCardView,
  ParticipantView,
  PendingJoinConfirmRequest,
  PendingJoinErrorCode,
  PreviewInviteInput,
  RedeemInviteInput,
  RenderPolicy,
  RenderPolicyOverride,
  SeatKnobs,
  SignedOutInvitePreview,
  SignupErrorCode,
  SignupPreviewRequest,
  SignupRequest,
} from "./roster.ts";
export {
  acceptInviteSchema,
  allowsInteractiveCards,
  carriedAppearanceFromParticipants,
  characterMemberSpecSchema,
  createInviteResultSchema,
  createInviteSchema,
  HTML_TRUST_STEPS,
  handoffOfferSchema,
  historyFloor,
  INVITE_STATUSES,
  invitePreviewSchema,
  inviteViewSchema,
  JOIN_HISTORY_VISIBILITIES,
  joinHistoryVisibilitySchema,
  memberCardViewSchema,
  NO_HANDOFF_OFFER,
  NO_HANDOFF_OFFER_CONTENTS,
  NO_HISTORY_FLOOR,
  PENDING_JOIN_ERROR_CODES,
  participantRoleSchema,
  participantViewSchema,
  pendingJoinConfirmRequestSchema,
  pendingJoinConfirmResultSchema,
  previewInviteSchema,
  redeemInviteSchema,
  renderPolicyOverrideForStep,
  rendersTrustedHtml,
  resolveCarriedBackground,
  resolveCarriedBackgroundForAppearance,
  resolveCarriedTheme,
  resolveRenderPolicy,
  SIGNUP_ERROR_CODES,
  SIGNUP_HANDLE_MAX_CHARS,
  SIGNUP_HANDLE_MIN_CHARS,
  SIGNUP_INVITES_MINTABLE,
  SIGNUP_MAX_TTL_DAYS,
  SIGNUP_MAX_TTL_MS,
  SIGNUP_MAX_USES,
  seatKnobsSchema,
  signedOutInvitePreviewSchema,
  signupPreviewRequestSchema,
  signupRequestSchema,
  signupResultSchema,
  stepFromRenderPolicyOverride,
  TALKATIVENESS_DEFAULT,
} from "./roster.ts";
export type { StartChatInput } from "./start.ts";
export { startChatSchema } from "./start.ts";
export type { TokenProvenance } from "./token-provenance.ts";
export { combineTokenProvenance, TOKEN_PROVENANCES, tokenProvenanceSchema } from "./token-provenance.ts";
export type {
  CompareAndSetImportedTokenUsage,
  ImportedTokenUsageCandidate,
  ImportedTokenUsageResolution,
  ListImportedTokenUsageCandidates,
} from "./token-usage-backfill.ts";
export * from "./views.ts";
// The leak-safe reverse-room read (D18) — one shape + one op type for every library that keeps a chat-scope
// attachment junction (regex scripts · databank documents · the rpg GM preset).
export type { ResolveVisibleRoomsOp, VisibleRoomRef } from "./visible-rooms.ts";
