// @orb/contracts/chat — the front-door for the chat wire contracts. The shapes are split across sibling
// modules by concern (D15's directory-module law: internals flat, this index re-exports, consumer-invisible):
//   • participants.ts   — participant kinds + drive/identity axes + the AI-speaker ref + `messageRoleSchema`
//                         + the MESSAGE-KIND axis (`MESSAGE_KINDS` / `MESSAGE_KIND_POLICY` — row PURPOSE)
//   • assemble.ts       — the ASSEMBLE family (slim projections, `AssembleContext`, traces, injections)
//   • messages.ts       — the D26 message/variant wire (`messageSlotSchema`, `MessageView`, tool/var records)
//   • producers.ts      — the member-gated kind-polymorphic CHAT IDENTITY producer (D137) + its two projections
//   • bus.ts            — the stream delta, the `ChatBusEvent` union, warning codes, turn origin, D50 transform
//   • metadata.ts       — the `chats.metadata` sub-blobs (roomOverrides/group/opening/visibility/steer)
//   • roster.ts         — the unified-roster wire (D16/D22/D80): roster/seat/invite/render-policy/history-floor
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

export type {
  AssembleCharacter,
  AssembleContext,
  AssembleDepthNote,
  AssembledPrompt,
  AssemblePersona,
  AssembleTrace,
  AssembleWorldEntry,
  AssemblyBudgetPart,
  AssemblyBudgetPreview,
  AssemblyBudgetSlice,
  AssemblySectionCost,
  AssemblySectionRow,
  AssemblySource,
  ChatInjection,
  ChatInjectionInput,
  ChatInjectionOrigin,
  ContextFitPreview,
  MemoryRecallCandidate,
  MemoryRecallSlice,
  MemoryRecallVerdict,
  SectionPreview,
  SentPrompt,
  ShapeBreakpointDecision,
  ShapeRowSource,
  ShapeTrace,
  ShapeTraceRow,
  VariantWireView,
} from "./assemble.ts";
export {
  ASSEMBLY_SOURCES,
  CHAT_INJECTION_ORIGINS,
  CHAT_INJECTION_POSITIONS,
  chatInjectionInputSchema,
  MEMORY_RECALL_REJECTS_SHOWN,
  MEMORY_RECALL_VERDICTS,
  SHAPE_BREAKPOINT_DECISIONS,
  SHAPE_ROW_SOURCES,
  sentPromptSchema,
} from "./assemble.ts";
// The two corpus-sweep workload results chat OWNS (the junk-drawer exit: a workload's result shape is
// authored by the OWNING domain) — `memory-backfill` + `group-character-backfill`.
export type { BackfillPassResult, MemoryBackfillResult } from "./backfill.ts";
export type {
  BulkImportChatInput,
  BulkImportChatsResult,
  BulkImportInjectionInput,
  BulkImportMessageInput,
  BulkImportSeatKnobs,
  BulkImportVariantInput,
  ImportedChatIdentity,
} from "./bulk-import.ts";
export type {
  AdjustedKnob,
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
  PromptTransformAbort,
  PromptTransformEnv,
  PromptTransformOutcome,
  PromptTransformPoint,
  PromptTransformResult,
  ProviderAdjustmentKind,
  RoomEntityKind,
  TurnAbortedOpCode,
  TurnAbortReason,
  TurnInitiator,
  TurnIntent,
  TurnLockedOpCode,
  TurnOrigin,
  UserMacroUnknownPickOpCode,
} from "./bus.ts";
export {
  ADJUSTED_KNOBS,
  AUTOMATION_DEPTH_HARD_CAP,
  CHAT_BUS_EVENT_TYPES,
  CHAT_WARNING_CODES,
  isChatBusEventType,
  LIVE_ONLY_CHAT_EVENT_TYPES,
  MEMORY_RECALL_PHASES,
  PLAIN_CHAT_WARNING_CODES,
  PROMPT_TRANSFORM_ABORT_REASON_MAX,
  PROMPT_TRANSFORM_POINTS,
  PROVIDER_ADJUSTMENT_KINDS,
  ROOM_ENTITY_KINDS,
  TURN_ABORT_REASONS,
  TURN_ABORTED_OP_CODE,
  TURN_INITIATORS,
  TURN_INTENTS,
  TURN_LOCKED_OP_CODE,
  USER_MACRO_UNKNOWN_PICK_OP_CODE,
} from "./bus.ts";
export type { CardFrameMintRequest, CardFrameMintResponse } from "./card-frame.ts";
export { CARD_FRAME_MINT_BODY_MAX_BYTES, CARD_FRAME_ROUTE, cardFrameMintRequestSchema, cardFrameMintResponseSchema, cardFrameUrl } from "./card-frame.ts";
export type { CardTrust, ContentSpansToBlocksOptions, MessageContentBlock } from "./content-blocks.ts";
export {
  cardTrustSchema,
  contentSpansToBlocks,
  messageContentBlockSchema,
  messageMediaKindSchema,
  messageMediaSrcSchema,
} from "./content-blocks.ts";
export type { ContentClassPolicy } from "./content-classes.ts";
export { CONTENT_CLASS_POLICY } from "./content-classes.ts";
export type { ChatListCursor } from "./listing.ts";
export { CHAT_LIST_MAX_LIMIT, chatListCursorSchema } from "./listing.ts";
// `MacroFreeze` (the single occurrence) is NOT re-exported here — kit owns that shape and consumers import it
// from `@orb/kit/macro`; contracts owns only the persisted/wire ARRAY (`MacroFreezeRecord`) + its parse seam.
export type {
  ChatReasoningPart,
  MacroFreezeRecord,
  MessageAssetOrigin,
  MessageSlot,
  MessageView,
  ReasoningPartMeta,
  ReattributeScope,
  StandaloneVariableDelta,
  TokenProvenance,
  ToolCallRecord,
  UserMacroDraws,
  VariablePrecondition,
  VariableWriteResult,
  VariantMetadata,
  VariantProviderMetadata,
} from "./messages.ts";
export {
  CHAT_MESSAGE_LIST_MAX_LIMIT,
  chatReasoningPartSchema,
  combineTokenProvenance,
  INLINE_REPLY_ORIGIN,
  MESSAGE_ASSET_ORIGINS,
  macroFreezeRecordSchema,
  macroFreezeSchema,
  messageSlotSchema,
  parseVariantMetadata,
  reattributeScopeSchema,
  standaloneVariableDeltaSchema,
  standaloneVariableDeltasSchema,
  TOKEN_PROVENANCES,
  tokenProvenanceSchema,
  toolCallRecordSchema,
  userMacroDrawsSchema,
  VARIANT_METADATA_REASONING_MS_KEY,
  VARIANT_METADATA_TOKEN_COUNT_KEY,
  variableDeltaSchema,
  variablePreconditionSchema,
  variablePreconditionsSchema,
  variantMetadataSchema,
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
  OpeningPolicy,
  RoomOverrides,
} from "./metadata.ts";
export {
  DEFAULT_GROUP_CONFIG,
  DEFAULT_ROOM_OVERRIDES,
  GROUP_POLICIES,
  GUIDED_STEER_INPUT_MAX,
  groupConfigSchema,
  groupPolicySchema,
  guidedSteerSchema,
  MEMBER_CARD_VISIBILITY_LEVELS,
  memberCardVisibilitySchema,
  openingPolicySchema,
  resolveCharactersCanReact,
  resolveOfferChoices,
  resolveReactionsEnabled,
  roomOverridesSchema,
  storedGroupConfigSchema,
} from "./metadata.ts";
export type { MessageKind, MessageKindPolicy, ParticipantKind, SpeakerRef } from "./participants.ts";
// B7 — the narrator-voice predicate, promoted from the client (the server's segment-anchor validation and
// the client picker must gate the plain-label span grammar identically).
export {
  AI_DRIVEN_KINDS,
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
  USER_BACKED_KINDS,
} from "./participants.ts";
export type {
  ChatCharacterIdentity,
  ChatIdentity,
  ChatIdentityKind,
  ChatIdentityKindPolicy,
  ChatPersonaIdentity,
} from "./producers.ts";
export {
  buildIdentityAvatarMaps,
  buildIdentityNameContext,
  CHAT_IDENTITY_KIND_POLICY,
  CHAT_IDENTITY_KINDS,
  identityKey,
} from "./producers.ts";
// The PROSE-1 app-tier slot table (census 74-81) — `#prose` imports it to compose `PROSE_SLOTS`.
export { CHAT_PROSE_SLOTS, CHAT_REACT_TOOL_DESCRIPTION } from "./prose.ts";
// B6/MR0 — the message-reaction vocabulary + the grouped read projection (MA-2); B7 adds the segment
// anchor, the `react` tool name and the attribution caps.
export type { ChatReactionsView, MessageReactionGroup, ReactionEmoji } from "./reactions.ts";
export {
  CHAT_REACT_TOOL_NAME,
  CHAT_REACTION_SLOT_WINDOW,
  REACTION_ATTRIBUTION_CONTENT_CAP,
  REACTION_ATTRIBUTION_MAX_PER_MESSAGE,
  REACTION_ATTRIBUTION_SLOT_WINDOW,
  REACTION_EMOJIS,
  REACTION_SEGMENT_SNIPPET_MAX,
  REACTION_SPEAKER_NAME_MAX,
  reactionEmojiSchema,
} from "./reactions.ts";
export type {
  CharacterRegexSlice,
  EffectiveRegexEntry,
  EffectiveRegexView,
  RegexTierAllow,
  RegexTierGroupView,
  RegexTierKey,
  RegexTierRowView,
} from "./regex-tiers.ts";
export {
  characterRegexTierKey,
  FIXED_REGEX_TIER_KEYS,
  isRegexEnabledInChat,
  isRegexTierAllowed,
  parseCharacterRegexTierKey,
  regexTierAllowSchema,
  regexTierKeySchema,
} from "./regex-tiers.ts";
export type {
  AcceptInviteInput,
  CarriedAppearance,
  CarriedAppearanceMember,
  CarriedBackground,
  CreateInviteInput,
  DeploymentRenderPolicy,
  HandoffOffer,
  HandoffOfferContents,
  HistoryFloorSeq,
  HtmlTrustStep,
  InvitePreview,
  InviteStatus,
  InviteView,
  JoinHistoryVisibility,
  MemberCardView,
  ParticipantView,
  PreviewInviteInput,
  RedeemInviteInput,
  RenderPolicy,
  RenderPolicyOverride,
  SeatKnobs,
} from "./roster.ts";
export {
  acceptInviteSchema,
  allowsInteractiveCards,
  carriedAppearanceFromParticipants,
  characterMemberSpecSchema,
  createInviteSchema,
  HTML_TRUST_STEPS,
  handoffOfferContentsSchema,
  handoffOfferSchema,
  historyFloor,
  INVITE_STATUSES,
  inviteStatusSchema,
  JOIN_HISTORY_VISIBILITIES,
  joinHistoryVisibilitySchema,
  NO_HANDOFF_OFFER,
  NO_HANDOFF_OFFER_CONTENTS,
  participantRoleSchema,
  previewInviteSchema,
  redeemInviteSchema,
  renderPolicyOverrideForStep,
  rendersTrustedHtml,
  resolveCarriedBackground,
  resolveCarriedBackgroundForAppearance,
  resolveCarriedTheme,
  resolveRenderPolicy,
  rosterMemberSpecSchema,
  seatKnobsSchema,
  stepFromRenderPolicyOverride,
  TALKATIVENESS_DEFAULT,
} from "./roster.ts";
export type {
  CompareAndSetImportedTokenUsage,
  ImportedTokenUsageCandidate,
  ImportedTokenUsageResolution,
  ListImportedTokenUsageCandidates,
} from "./token-usage-backfill.ts";
// The leak-safe reverse-room read (D18) — one shape + one op type for every library that keeps a chat-scope
// attachment junction (regex scripts · databank documents · the rpg GM preset).
export type { ResolveVisibleRoomsOp, VisibleRoomRef } from "./visible-rooms.ts";
