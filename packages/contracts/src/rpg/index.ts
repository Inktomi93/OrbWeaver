// @orb/contracts/rpg — the front-door for the RPG lite substrate wire contracts (rpg-design/05 §4.1). The
// shapes are split across sibling modules by concern (D15's directory-module law: internals flat, this
// index re-exports, consumer-invisible):
//   • enums.ts    — the string-union tuples (mode/status/quest/journal/checkpoint/widget), CHECK-derived in db
//   • mode.ts     — the `MODE_POLICY` exhaustive record + the mode capability axis (§2.2)
//   • profile.ts  — `statProfile` as data + the three packaged profiles (§2.3)
//   • sheet.ts    — the per-actor identity sheet (§4.3)
//   • actor.ts    — THE actor: ref + `actorRefKey` + the cast SLUG + the identity half + the volatile half
//                   (wallet/inventory first-class, §2.6; the R2 one-row reshape)
//   • ambient.ts  — clock/weather/time-of-day, engine-shaped, born nullable (§2.7)
//   • snapshot.ts — quest/objective/plot/presence + the swipe-volatile snapshot state (§2.4-2.5)
//   • tracker.ts  — THE unified tracked-field def + value + carrier resolution + the R6 write surface
//                   (`docs/design/tracked-field-unification.md`; replaces pools/cast-fields/orbs/widgets)
//   • config.ts   — the `rpg_games.config` blob (statProfile + lite dials, §4.1)
//   • pointer.ts  — the opaque `chats.metadata.rpg` sync pointer, mode-free `{gameId}` (§2.1)
//   • views.ts    — the CP read-view projections (getGame/getTrackerView/getConfigView, §4.8)
//   • inputs.ts   — the transport WIRE input schemas for the `rpg.*` verb procs (W2 — derived, chatId-scoped)
//   • tools.ts    — the 7 cheap-mode D48 tool ARG schemas (projection-clean, §4.5)
//   • extraction.ts — the structured-output extraction schema, DERIVED from the tool args (§4.6)
//   • extraction-prompt.ts — the per-plane PROMPT-FRAGMENT REGISTRY both system prompts compose from (§1.6)
//   • bus.ts      — the feature-root rpg bus event union + its `RPG_BUS_EVENT_TYPES` coverage belt (§4.9)
//
// LAWS honored across these modules:
//   • No `ownerId` (D23): every rpg shape is authority-derived through the chat FK chain; no wire shape
//     stamps an rpg owner.
//   • One home per axis (§5.5): every string union is a tuple here; the db CHECK derives from it, no re-spell.
//   • Tool args are PROJECTION-CLEAN (tools.ts): no `.transform()`/branded ids (z.toJSONSchema throws on them).
//   • KISS/YAGNI SUSPENDED: the full-mode shape ships as DATA from day one so full grafts add siblings, never
//     re-spell (the graft-map invariant, §C).

export type {
  RpgActorEntry,
  RpgActorIdentity,
  RpgActorIdentityTextField,
  RpgActorOp,
  RpgActorOpField,
  RpgActorRef,
  RpgActorVolatile,
  RpgCastGuideField,
  RpgCastRef,
  RpgInventoryItem,
  RpgRelationship,
} from "./actor.ts";
export {
  actorRefKey,
  RPG_ACTOR_IDENTITY_TEXT_FIELDS,
  RPG_ACTOR_OP_FIELDS,
  RPG_CAST_GUIDE_FIELDS,
  rpgActorEntrySchema,
  rpgActorIdentitySchema,
  rpgActorOpSchema,
  rpgActorRefSchema,
  rpgActorVolatileSchema,
  rpgCastRefSchema,
  rpgCastSlug,
  rpgInventoryItemSchema,
  rpgPromotedCardDescription,
  rpgRelationshipSchema,
} from "./actor.ts";
export type { RpgClockTime, RpgWeather, RpgWeatherType, TimeOfDay } from "./ambient.ts";
export {
  clockTimeOfDay,
  RPG_WEATHER_TYPES,
  rpgClockTimeSchema,
  rpgWeatherLabelSchema,
  rpgWeatherSchema,
  rpgWeatherText,
  rpgWeatherTypeSchema,
  TIME_OF_DAY,
  TIME_OF_DAY_HOURS,
  TIME_OF_DAY_RANGES,
  timeOfDayAtHour,
} from "./ambient.ts";
export type { EmitRpgEvent, RpgBusEvent, RpgBusEventType } from "./bus.ts";
export { RPG_BUS_EVENT_TYPES } from "./bus.ts";
export type { RpgDateMode, RpgDeliveryPath, RpgExtractionContext, RpgExtractionMode, RpgFoldFallbackReason, RpgGameConfig, RpgGameFeatures } from "./config.ts";
export {
  isDeceptionActive,
  RPG_CARD_KEEP_LAST_DEFAULT,
  RPG_DATE_MODES,
  RPG_DELIVERY_PATHS,
  RPG_EXTRACTION_CONTEXTS,
  RPG_EXTRACTION_MODES,
  RPG_EXTRACTION_WINDOW_TOKENS_DEFAULT,
  RPG_EXTRACTION_WINDOW_TOKENS_MAX,
  RPG_EXTRACTION_WINDOW_TOKENS_MIN,
  RPG_FOLD_FALLBACK_REASONS,
  RPG_RECENT_BEATS_KEEP_DEFAULT,
  RPG_RECONCILE_EVERY_BEATS_DEFAULT,
  RPG_RECONCILE_EVERY_BEATS_MAX,
  RPG_STEERING_NOTE_MAX,
  rpgGameConfigSchema,
  rpgGameFeaturesSchema,
} from "./config.ts";
export type {
  RpgCheckpointTrigger,
  RpgCyoaChoiceBehavior,
  RpgGameMode,
  RpgGameStatus,
  RpgJournalType,
  RpgQuestStatus,
  RpgRelationshipKind,
  RpgTrackerCarrierClass,
  RpgTrackerShape,
  RpgTrackerSubject,
  RpgTrackerWrite,
} from "./enums.ts";
export {
  RPG_CHECKPOINT_TRIGGERS,
  RPG_CYOA_CHOICE_BEHAVIORS,
  RPG_GAME_MODES,
  RPG_GAME_STATUSES,
  RPG_JOURNAL_TYPES,
  RPG_QUEST_STATUSES,
  RPG_RELATIONSHIP_KINDS,
  RPG_TRACKER_CARRIER_CLASSES,
  RPG_TRACKER_SHAPES,
  RPG_TRACKER_SUBJECTS,
  RPG_TRACKER_WRITES,
  rpgCheckpointTriggerSchema,
  rpgCyoaChoiceBehaviorSchema,
  rpgGameModeSchema,
  rpgGameStatusSchema,
  rpgJournalTypeSchema,
  rpgQuestStatusSchema,
  rpgRelationshipKindSchema,
  rpgTrackerCarrierClassSchema,
  rpgTrackerShapeSchema,
  rpgTrackerSubjectSchema,
  rpgTrackerWriteSchema,
} from "./enums.ts";
export type {
  ExtractionRefs,
  RpgExtraction,
  RpgExtractionDrop,
  RpgExtractionDropPlane,
  RpgExtractionSalvage,
  RpgMalformedToolCall,
  RpgPopulate,
  RpgPopulateSalvage,
  RpgPopulateSheet,
  RpgRecordedToolCall,
  RpgToolCall,
  RpgToolCallVerdict,
  RpgToolRoundToolName,
} from "./extraction.ts";
export {
  cacheStableExtractionRefs,
  constrainExtractionSchema,
  constrainPopulateSchema,
  healedJournalTypes,
  malformedToolCallDetails,
  malformedToolCalls,
  RPG_NO_CHANGES_TOOL,
  RPG_TOOL_CALL_VERDICTS,
  RPG_TOOL_ROUND_TOOL_NAMES,
  recordToolCalls,
  rpgExtractionSchema,
  rpgPopulateSchema,
  rpgPopulateSheetSchema,
  salvagedToolCallFields,
  salvageExtraction,
  salvagePopulate,
  strippedToolCallKeys,
  toolCallsToExtraction,
} from "./extraction.ts";
export type { ExtractionPlanePrompt, ExtractionPromptContext } from "./extraction-prompt.ts";
export {
  buildRpgToolDescriptions,
  composePlaneTeaching,
  composePopulateTeaching,
  EXTRACTION_PLANE_PROMPTS,
  RPG_BASELINE_TOOL_DESCRIPTIONS,
  RPG_STATE_TRACKING_GUIDE,
} from "./extraction-prompt.ts";
export {
  rpgAddJournalEntryInputSchema,
  rpgCreateCheckpointInputSchema,
  rpgCreateGameInputSchema,
  rpgDeleteJournalEntryInputSchema,
  rpgDeleteQuestInputSchema,
  rpgDismissActorInputSchema,
  rpgEditJournalEntryInputSchema,
  rpgEditSnapshotInputSchema,
  rpgListJournalInputSchema,
  rpgListTurnToolCallsInputSchema,
  rpgPatchActorInputSchema,
  rpgPatchSheetInputSchema,
  rpgPopulateFromCharacterInputSchema,
  rpgPromoteActorInputSchema,
  rpgReadGameInputSchema,
  rpgRestoreCheckpointInputSchema,
  rpgRollDiceInputSchema,
  rpgUpdateConfigInputSchema,
  rpgUpsertQuestInputSchema,
} from "./inputs.ts";
export type { RpgModeCapabilityAxis, RpgModePolicy } from "./mode.ts";
export { MODE_POLICY } from "./mode.ts";
export type { ChatRpgPointer } from "./pointer.ts";
export { chatRpgPointerSchema, isRpgEngaged } from "./pointer.ts";
export type { RpgPackagedProfileKey, RpgStatAttributeDef, RpgStatProfile, RpgStatResolution } from "./profile.ts";
export {
  attributeGloss,
  attributeReading,
  RPG_PACKAGED_PROFILE_BY_KEY,
  RPG_PACKAGED_PROFILES,
  RPG_PROFILE_D20,
  RPG_PROFILE_FREEFORM,
  RPG_PROFILE_MAX_ATTRIBUTES,
  RPG_PROFILE_SPECIAL,
  RPG_SEED_HP_MAX,
  rpgSeedTrackers,
  rpgStatAttributeDefSchema,
  rpgStatProfileSchema,
  rpgStatResolutionSchema,
} from "./profile.ts";
export { RPG_PROSE_SLOTS } from "./prose.ts";
export type { RpgSheet } from "./sheet.ts";
export { rpgSheetSchema } from "./sheet.ts";
export type { RpgFieldLocks, RpgPlot, RpgPlotAct, RpgQuest, RpgQuestObjective, RpgSnapshotState } from "./snapshot.ts";
export {
  RPG_HAND_PATCH_PLANES,
  RPG_OP_SHAPED_PLANES,
  RPG_SNAPSHOT_STATE_PLANES,
  rpgActorIdentityLockBase,
  rpgActorLockBase,
  rpgActorVolatileLockBase,
  rpgFieldLocksSchema,
  rpgPlotActSchema,
  rpgPlotSchema,
  rpgQuestObjectiveSchema,
  rpgQuestSchema,
  rpgSnapshotStateSchema,
} from "./snapshot.ts";
export type {
  AddJournalEntryArgs,
  RollDiceArgs,
  RpgQuestAction,
  RpgToolName,
  SetTrackerArgs,
  UpdateInventoryArgs,
  UpdatePartyArgs,
  UpdateSceneArgs,
  UpsertQuestArgs,
} from "./tools.ts";
export {
  addJournalEntryArgsSchema,
  journalTitleFor,
  journalTypeFor,
  RPG_JOURNAL_TYPE_FALLBACK,
  RPG_LITE_TOOL_NAMES,
  RPG_QUEST_ACTIONS,
  rollDiceArgsSchema,
  setTrackerArgsSchema,
  updateInventoryArgsSchema,
  updatePartyArgsSchema,
  updateSceneArgsSchema,
  upsertQuestArgsSchema,
} from "./tools.ts";
export type {
  RpgTrackerAppliesTo,
  RpgTrackerCarrier,
  RpgTrackerCarrierKind,
  RpgTrackerDef,
  RpgTrackerValue,
  RpgTrackerValues,
  RpgTrackerWriteGroup,
} from "./tracker.ts";
export {
  actorTrackerWriteKeys,
  buildTrackerWriteGroups,
  carriesTracker,
  gameTrackers,
  gameTrackerWriteKeys,
  RPG_HINT_MAX,
  RPG_TRACKER_COLOR_RE,
  RPG_TRACKER_VALUE_EMPTY,
  resolveTrackerCarriers,
  resolveTrackerMaxOverride,
  rpgTrackerAppliesToSchema,
  rpgTrackerDefSchema,
  rpgTrackerValueSchema,
  rpgTrackerValuesSchema,
  sortTrackers,
  trackerAppliesToCarrier,
  trackerCeiling,
  trackerGloss,
  trackerNumber,
  trackerReading,
  trackersForCarrier,
  trackerVocabulary,
} from "./tracker.ts";
export type {
  RpgActorView,
  RpgConfigView,
  RpgEffectiveDelivery,
  RpgGameView,
  RpgJournalEntryView,
  RpgQuestView,
  RpgRevealedMessage,
  RpgRevealedSpan,
  RpgRevealView,
  RpgStandingLie,
  RpgTrackerEntry,
  RpgTrackerOrb,
  RpgTrackerView,
  RpgTurnToolCallsView,
} from "./views.ts";
