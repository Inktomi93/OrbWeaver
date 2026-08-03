// @orb/contracts/chat — the front-door for the chat wire contracts. The shapes are split across sibling
// modules by concern (D15's directory-module law: internals flat, this index re-exports, consumer-invisible):
//   • participants.ts   — participant kinds + drive/identity axes + the AI-speaker ref + `messageRoleSchema`
//   • assemble.ts       — the ASSEMBLE family (slim projections, `AssembleContext`, traces, injections)
//   • messages.ts       — the D26 message/variant wire (`messageSlotSchema`, `MessageView`, tool/var records)
//   • producers.ts      — the member-gated id→name / id→avatar producer maps
//   • bus.ts            — the stream delta, the `ChatBusEvent` union, warning codes, turn origin, D50 transform
//   • metadata.ts       — the `chats.metadata` sub-blobs (roomOverrides/group/opening/visibility/steer)
//   • roster.ts         — the unified-roster wire (D16/D22/D80): roster/seat/invite/render-policy/history-floor
//   • content-blocks.ts — the D44 §12.4 render blocks + `contentSpansToBlocks`
//   • content-classes.ts — the parity-plus §3 content-class visibility registry (`CONTENT_CLASS_POLICY`)
//   • bulk-import.ts    — the chat-owned bulk-import op shapes (D34)
//   • prose.ts          — the PROSE-1 app-tier slot table (the side-generation prompts' shipped defaults)
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
  AssemblySource,
  ChatInjection,
  ChatInjectionInput,
  ChatInjectionOrigin,
  ContextFitPreview,
  SectionPreview,
  SentPrompt,
  ShapeBreakpointDecision,
  ShapeTrace,
  VariantWireView,
} from "./assemble";
export {
  ASSEMBLY_SOURCES,
  CHAT_INJECTION_ORIGINS,
  CHAT_INJECTION_POSITIONS,
  chatInjectionInputSchema,
  SHAPE_BREAKPOINT_DECISIONS,
  sentPromptSchema,
} from "./assemble";
// The two corpus-sweep workload results chat OWNS (the junk-drawer exit: a workload's result shape is
// authored by the OWNING domain) — `memory-backfill` + `group-character-backfill`.
export type { BackfillPassResult, MemoryBackfillResult } from "./backfill";
export type {
  BulkImportChatInput,
  BulkImportChatsResult,
  BulkImportMessageInput,
  BulkImportVariantInput,
} from "./bulk-import";
export type {
  ChatBusEvent,
  ChatContentPart,
  ChatDeltaEvent,
  ChatWarningCode,
  PromptTransform,
  PromptTransformEnv,
  PromptTransformPoint,
  TurnAbortedOpCode,
  TurnAbortReason,
  TurnInitiator,
  TurnIntent,
  TurnOrigin,
} from "./bus";
export {
  AUTOMATION_DEPTH_HARD_CAP,
  CHAT_BUS_EVENT_TYPES,
  CHAT_WARNING_CODES,
  isChatBusEventType,
  PROMPT_TRANSFORM_POINTS,
  TURN_ABORT_REASONS,
  TURN_ABORTED_OP_CODE,
  TURN_INITIATORS,
  TURN_INTENTS,
} from "./bus";
export type { CardTrust, ContentSpansToBlocksOptions, MessageContentBlock, MessageMediaKind, MessageMediaSrc } from "./content-blocks";
export {
  cardTrustSchema,
  contentSpansToBlocks,
  messageContentBlockSchema,
  messageMediaKindSchema,
  messageMediaSrcSchema,
} from "./content-blocks";
export type { ContentClassPolicy } from "./content-classes";
export { CONTENT_CLASS_POLICY } from "./content-classes";
export type {
  MessageSlot,
  MessageView,
  ReattributeScope,
  StandaloneVariableDelta,
  ToolCallRecord,
  UserMacroDraws,
} from "./messages";
export {
  isStateAnchorSlot,
  lastVisibleAssistant,
  lastVisibleRow,
  messageSlotSchema,
  reattributeScopeSchema,
  standaloneVariableDeltaSchema,
  standaloneVariableDeltasSchema,
  toolCallRecordSchema,
  userMacroDrawsSchema,
  variableDeltaSchema,
  varOpSchema,
} from "./messages";
export type {
  ChatMetadata,
  GroupConfig,
  GroupConfigInput,
  GroupPolicy,
  GuidedSteer,
  MemberCardVisibility,
  OpeningPolicy,
  RoomOverrides,
} from "./metadata";
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
  roomOverridesSchema,
} from "./metadata";
export type { ParticipantKind, SpeakerRef } from "./participants";
export {
  AI_DRIVEN_KINDS,
  isAiDriven,
  isUserBacked,
  messageRoleSchema,
  PARTICIPANT_KINDS,
  participantKindSchema,
  speakerKey,
  USER_BACKED_KINDS,
} from "./participants";
export type {
  CharacterAvatarEntry,
  CharacterNameEntry,
  ChatMacroNameProducer,
  PersonaAvatarEntry,
  PersonaNameEntry,
} from "./producers";
export {
  buildCharacterAvatarMap,
  buildCharacterNameMap,
  buildPersonaAvatarMap,
  buildPersonaNameMap,
} from "./producers";
// The PROSE-1 app-tier slot table (census 74-81) — `#prose` imports it to compose `PROSE_SLOTS`.
export { CHAT_PROSE_SLOTS } from "./prose";
export type {
  AcceptInviteInput,
  CarriedBackground,
  CharacterMemberSpec,
  CreateInviteInput,
  HandoffOffer,
  HistoryFloorSeq,
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
  RosterMemberSpec,
  SeatKnobs,
} from "./roster";
export {
  acceptInviteSchema,
  characterMemberSpecSchema,
  createInviteSchema,
  handoffOfferSchema,
  historyFloor,
  INVITE_STATUSES,
  inviteStatusSchema,
  isSingleHumanRoom,
  JOIN_HISTORY_VISIBILITIES,
  joinHistoryVisibilitySchema,
  NO_HANDOFF_OFFER,
  participantRoleSchema,
  previewInviteSchema,
  redeemInviteSchema,
  resolveCarriedBackground,
  resolveRenderPolicy,
  rosterMemberSpecSchema,
  seatKnobsSchema,
  soleTrueSoloCharacter,
  TALKATIVENESS_DEFAULT,
  talkativenessSchema,
} from "./roster";
