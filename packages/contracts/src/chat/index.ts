// @orb/contracts/chat — the front-door for the chat wire contracts. The shapes are split across sibling
// modules by concern and re-exported here (D15's directory-module law: internals flat, this index
// re-exports, consumer-invisible).
//
// LAWS honored across these modules:
//   • Turn identity (D19): a wire shape that carries turn attribution uses `triggeredBy`/`runAsUserId`,
//     NEVER `callerUserId`. No bus event here carries a caller id.
//   • No `chats.ownerId` (D18): chats are membership-scoped; no wire shape stamps a chat owner.
//   • Bus-payload allowlist: credentials/secrets/baseUrls are TYPE-LEVEL UNREPRESENTABLE in `ChatBusEvent`
//     — every member is a closed object literal of branded ids, enums, scalars, and `MessageView`.
//   • D26: `messages` is a pure SLOT (no content/economics); all generation content lives on
//     `message_variants`. `MessageView` is the slot joined with its selected variant.

export type { AdjustedKnob, BannedPhraseCause } from "./adjusted-knobs.ts";
export { ADJUSTED_KNOB_NAMES, ADJUSTED_KNOBS } from "./adjusted-knobs.ts";
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
  MacroSlice,
  MacroSliceEntry,
  MacroSliceRejection,
  MemoryRecallCandidate,
  MemoryRecallSlice,
  MemoryRecallVerdict,
  SaveCorrectionInput,
  ShapeBreakpointDecision,
  ShapeFoldReason,
  ShapeRowSource,
  ShapeTrace,
  ShapeTraceRow,
  TurnGlobalVariables,
  VariantWireView,
} from "./assemble.ts";
export {
  ASSEMBLY_SOURCES,
  CHAT_INJECTION_POSITIONS,
  chatInjectionInputSchema,
  contextFitAnswerSchema,
  MEMORY_RECALL_REJECTS_SHOWN,
  NEW_CHAT_INJECTION_PLACEMENT,
  saveCorrectionInputSchema,
  sentPromptSchema,
  shapeTraceSchema,
  storedMacroSliceSchema,
  variantWireViewSchema,
} from "./assemble.ts";
// The two corpus-sweep workloads' params + results chat OWNS (the junk-drawer exit: a workload's wire shapes
// are authored by the OWNING domain) — `memory-backfill` + `group-character-backfill`.
export type { BackfillPassResult, ImportWindow, MemoryBackfillResult, MemoryBackfillWorkloadParams } from "./backfill.ts";
export { importWindowSchema, memoryBackfillWorkloadParams, mergeImportWindows } from "./backfill.ts";
export type {
  BulkImportChatInput,
  BulkImportChatsOp,
  BulkImportChatsResult,
  BulkImportInjectionInput,
  BulkImportMessageInput,
  BulkImportRefusedRow,
  BulkImportSeatKnobs,
  BulkImportVariantInput,
  FindImportedChatHashes,
  ImportedChatIdentity,
  ImportedChatRemap,
  PendingGenerationObservationInput,
} from "./bulk-import.ts";
export { pendingGenerationObservationsSchema } from "./bulk-import.ts";
export type {
  ChatBusEvent,
  ChatContentPart,
  ChatDeltaEvent,
  ChatRegexNotAppliedOverflowWarning,
  ChatRegexNotAppliedWarning,
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
  ProviderFailureReason,
  ProviderWaitBusEvent,
  ProviderWaitPhase,
  RegexNotAppliedCause,
  RegexServerPass,
  RoomEntityKind,
  TurnAbortReason,
  TurnInitiator,
  TurnIntent,
  TurnOrigin,
} from "./bus.ts";
export {
  AUTOMATION_DEPTH_HARD_CAP,
  CHAT_BUS_EVENT_TYPES,
  CHAT_NOT_HOST_OP_CODE,
  CONNECTION_FIXABLE_FAILURE_REASONS,
  DEADLINE_ABORT_REASON,
  EMPTY_GENERATION_CAUSE,
  EMPTY_GENERATION_OP_CODE,
  fansWhenDropped,
  HIDDEN_TAG_BROKEN_CODE,
  LIVE_ONLY_CHAT_EVENT_TYPES,
  PROMPT_TRANSFORM_ABORT_REASON_MAX,
  PROMPT_TRANSFORM_POINTS,
  PROVIDER_FAILURE_REASON_PREFIX,
  REGEX_NOT_APPLIED_NAMED_MAX,
  REGEX_NOT_APPLIED_OVERFLOW_CODE,
  REGEX_SCRIPT_NOT_APPLIED_CODE,
  ROOM_ENTITY_KINDS,
  SETTINGS_ADJUSTED_CODE,
  TURN_ABORTED_OP_CODE,
  TURN_HOST_UNAVAILABLE_OP_CODE,
  TURN_INITIATORS,
  TURN_LOCKED_OP_CODE,
  TURN_ROOM_CLOSING_OP_CODE,
  USER_MACRO_UNKNOWN_PICK_OP_CODE,
} from "./bus.ts";
export type { CardFrameMintRequest, CardFrameMintResponse } from "./card-frame.ts";
export {
  CARD_FRAME_CARRIED_AUTHORS_MAX,
  CARD_FRAME_HTML_MAX_CHARS,
  CARD_FRAME_MINT_BODY_MAX_BYTES,
  CARD_FRAME_MINTS_IN_FLIGHT,
  CARD_FRAME_ROUTE,
  cardFrameMintRequestSchema,
  cardFrameMintResponseSchema,
  cardFrameUrl,
} from "./card-frame.ts";
export type { CardTrust, ContentSpansToBlocksOptions, MessageContentBlock, SendContentBlock } from "./content-blocks.ts";
export {
  composeSendBody,
  contentSpansToBlocks,
  fillSendPictures,
  picturesPlaceExactlyOnce,
  placeSendPictures,
  sendBlockDraft,
  sendBlockText,
  sendContentBlocksSchema,
  stripSendPlaceholders,
} from "./content-blocks.ts";
export type { AnchorState, ChatDetail, RedeemInviteResult } from "./detail.ts";
export { chatDetailSchema, redeemInviteResultSchema, viewerGalleryCharacter } from "./detail.ts";
export type { BeginGenerationObservationOp, GenerationObservationParent } from "./generation-observation.ts";
export type { HandoffCardCopy, HandoffCardPair, HandoffHealArgs } from "./handoff-context.ts";
export { handoffCardPairsSchema } from "./handoff-context.ts";
export type { ImpersonateStreamDelta } from "./impersonation.ts";
export { chatIdInputSchema, chatListInputSchema, listMessagesInputSchema } from "./inputs.ts";
export type { ChatLibraryLens } from "./library.ts";
export { chatCensusInputSchema } from "./library.ts";
export type { ChatListCursor } from "./listing.ts";
export { CHAT_LIST_MAX_LIMIT, HOME_RECENT_CHATS_LIMIT } from "./listing.ts";
export { memberToolCalls, projectViewForMember } from "./member-projection.ts";
export type {
  ImportedMemoryStrike,
  ImportMemoryStrikesOp,
  MemoryItemKey,
  MemoryItemStrikeView,
  MemoryItemView,
  MemoryView,
  RestoreMemoryInput,
  StrikeMemoryInput,
  StrikeMemoryResult,
  UnmatchedStrikeView,
} from "./memory-view.ts";
export {
  MEMORY_ITEM_STALE_OP_CODE,
  memoryOffReason,
  memoryViewSchema,
  memoryViewStatus,
  restoreMemoryInputSchema,
  strikeMemoryInputSchema,
  strikeMemoryResultSchema,
} from "./memory-view.ts";
export type { HistoryPage, MessageWindow } from "./message-pages.ts";
export { historyPageSchema, messageWindowSchema } from "./message-pages.ts";
// `MacroFreeze` (the single occurrence) is NOT re-exported here — kit owns that shape and consumers import it
// from `@orb/kit/macro`; contracts owns only the persisted/wire ARRAY (`MacroFreezeRecord`) + its parse seam.
export type {
  ChatReasoningPart,
  ChatSource,
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
  ToolCallId,
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
  hasRedactedReasoning,
  INLINE_REPLY_ORIGIN,
  isReattributableReply,
  isSeededGreetingRow,
  legacyNotionalCostSamples,
  MESSAGE_ASSET_ORIGINS,
  MESSAGE_MACRO_BUDGET_OP_CODE,
  MESSAGE_TEXT_MAX_CHARS,
  MESSAGE_TOO_LONG_OP_CODE,
  macroFreezeRecordSchema,
  messageViewSchema,
  mintToolCallId,
  parseVariantMetadata,
  REATTRIBUTE_MESSAGES_MAX,
  reattributeScopeSchema,
  standaloneVariableDeltasSchema,
  TOOL_CALL_EDIT_ACTIONS,
  toolCallIdSchema,
  toolCallRecordSchema,
  userMacroDrawsSchema,
  VARIANT_METADATA_REASONING_MS_KEY,
  VARIANT_METADATA_SYSTEM_FINGERPRINT_KEY,
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
  GUIDED_STEER_INPUT_MAX,
  groupConfigInputSchema,
  groupConfigSchema,
  guidedSteerSchema,
  humansYetToWrite,
  MEMBER_CARD_VISIBILITY_LEVELS,
  narratorPolicyOf,
  openingPolicySchema,
  resolveCharactersCanReact,
  resolveHostDisplayScripts,
  resolveOfferChoices,
  resolveReactionsEnabled,
  roomOverridesSchema,
  SMART_PICKER_LABELS,
  SMART_UTILITY_SWITCH_LABEL,
  storedGroupConfigSchema,
} from "./metadata.ts";
export type { NextTurnConnectionView, RoomSendAvailability, RoomUnavailableCause } from "./next-turn-connection.ts";
export { nextTurnConnectionViewSchema, roomSendAvailabilitySchema } from "./next-turn-connection.ts";
export type {
  CallerInChatOp,
  ChatLivePublish,
  ChatScopedParams,
  IsMemoryEnabledOp,
  MemoryDigestInput,
  PresentCharacterSeat,
  ReadChatUserMacrosOp,
  RegisterPromptTransformOp,
  RequestTurnOp,
  RequestTurnParams,
  RequireHostOp,
  RequireParticipantOp,
  ResolveCharacterTagsOp,
  ResolveChatHostOp,
  ResolveRegexSources,
  ResolveRoomRunAsOp,
  ResolveSeatDecoOp,
  ResolveSeatDecosOp,
  ResolveViewerVisibility,
  RoomTierForMemberOp,
  SignupMinterCheckOp,
  StoreSegmentParams,
  TurnRetrievalEvents,
  UnregisterPromptTransformOp,
  ViewerVisibility,
} from "./owner-ops.ts";
export type { MessageKind, ParticipantKind, SpeakerRef } from "./participants.ts";
// The narrator-voice predicate — the server's segment-anchor validation and the client picker must gate the
// plain-label span grammar identically.
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
  PROMPT_KINDS,
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
// The app-tier slot table — `#prose` imports it to compose `PROSE_SLOTS`.
export { CHAT_PROSE_SLOTS, CHAT_REACT_TOOL_DESCRIPTION } from "./prose.ts";
// The message-reaction vocabulary + the grouped read projection, plus the segment anchor, the `react` tool
// name and the attribution caps.
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
  RegexDisplayEntry,
  RegexDisplaySource,
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
  REGEX_VIEWER_SOURCE,
  regexDisplayEntrySchema,
  regexDisplayInputSchema,
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
  NarratorRenderPolicy,
  ParticipantView,
  PendingJoinConfirmRequest,
  PendingJoinErrorCode,
  PreviewInviteInput,
  RedeemInviteInput,
  RenderPolicy,
  RenderPolicyOverride,
  RenderPolicySource,
  SeatKnobs,
  SignedOutInvitePreview,
  SignupErrorCode,
  SignupPreviewRequest,
  SignupRequest,
} from "./roster.ts";
export {
  acceptInviteSchema,
  cardScriptsNeedViewerConsent,
  carriedAppearanceFromParticipants,
  characterMemberSpecSchema,
  createInviteResultSchema,
  createInviteSchema,
  HTML_TRUST_STEPS,
  handoffOfferSchema,
  historyFloor,
  INVITE_STATUSES,
  INVITE_TARGET_UNKNOWN_CODE,
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
  resolveCardMediaVerdict,
  resolveCardScriptVerdict,
  resolveCarriedBackground,
  resolveCarriedBackgroundForAppearance,
  resolveCarriedTheme,
  resolveNarratorRenderPolicy,
  resolveRenderPolicy,
  resolveSeatRenderPolicy,
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
export type {
  ChatRpgGameBirthPlan,
  ClaimChatOp,
  ForkGameArgs,
  ForkGameOp,
  ForkGameResult,
  GameBirthCommittedOp,
  GatherTurnContextArgs,
  GatherTurnContextOp,
  GetMembership,
  GetPendingUserText,
  HandoffHealStatementsOp,
  HandoffRekeyActorsOp,
  HandoffWouldCopyGmPresetOp,
  MarkDicePreRollEligibleOp,
  PlanGameBirthOp,
  ResolveCanonWindow,
  ResolveChatProseOp,
  ResolveGmSeatHolderKindOp,
  ResolvePresetOverrideOp,
  ResolveReasoningHostOnlyOp,
  ResolveRpgCardCorpus,
  ResolveRpgParticipants,
  RoomAdmission,
  RoomClaim,
  RpgCardCorpus,
  RpgGatherWithTools,
  RpgTurnAbortedOp,
  RpgTurnCompletedOp,
  RpgTurnCompletedParams,
  RpgTurnRuntime,
  RpgTurnTranscriptMessage,
  RpgUserCommitOp,
  SetRpgPointer,
  TurnKind,
} from "./rpg-ops.ts";
export type {
  AddCharacterToChatOp,
  AddCharacterToChatParams,
  ParticipantData,
  SetGroupConfigOp,
  SetGroupConfigParams,
  SetSeatKnobsOp,
  SetSeatKnobsParams,
} from "./seat-ops.ts";
export type { StartChatInput } from "./start.ts";
export { startChatSchema } from "./start.ts";
export type { TeachingCollection, TeachingContext, TeachingContribution, TeachingIdentity, TeachingKnobs } from "./teaching.ts";
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
