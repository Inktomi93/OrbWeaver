// lib/ front door — the cross-cutting display/util seams. Dev-only modules never ride this barrel.

// `cn` is @orb/ui's, re-exported here for client callers (docs/law/UI-Architecture-and-Layout.md, lib/ entry).
export { cn } from "@orb/ui/lib";
export { ACCOUNT_HANDLE_FIELD_NAME, ACCOUNT_PASSWORD_FIELD_NAME } from "./account-field-names.ts";
export { AppFailureSurface } from "./app-failure-surface.tsx";
export { APP_READY_ATTR } from "./app-ready-attribute.ts";
export {
  APPEARANCE_ATTRIBUTE_PREFIX,
  APPEARANCE_CHANNEL_ROWS,
  APPEARANCE_OWNER_KEYS,
  clearAppearanceChannel,
  writeAppearanceChannel,
} from "./appearance-carrier-manifest.ts";
export {
  AVATAR_CONTROL_NAME,
  AVATAR_DROP_A_FILE,
  AVATAR_NOT_A_PICTURE,
  AVATAR_ONE_AT_A_TIME,
  AVATAR_REPLACE_HINT,
  AVATAR_UPLOADING_NAME,
  AVATAR_WRITE_REFUSED,
  avatarUploadFailedLine,
} from "./avatar-upload-copy.ts";
export type { BackgroundJob } from "./background-jobs.ts";
export { BACKGROUND_JOB_LOGS } from "./background-jobs.ts";
export { setBootReadPending } from "./boot-reads.ts";
export type { BugReportServerFacts, PublicBrowserFacts, PublicBugReport } from "./bug-report-public.ts";
export { buildPublicBugReport, publicBugReportIssueUrl } from "./bug-report-public.ts";
export { busDupCheck, busInvalidate, busSubscribe, busUnsubscribe } from "./bus-devlog.ts";
export { cardImportFailedDetail, cardImportPartialLine, cardImportRefusalLine } from "./card-import-copy.ts";
export type { ScreenTitle } from "./census-title.ts";
export { censusSuffix, censusTitle } from "./census-title.ts";
export {
  BLANK_CHAT_NAME,
  NEW_CHAT_DIALOG_TITLE,
  NO_CHAT_SELECTED_TITLE,
  START_NEW_CHAT_NAME,
  START_TEMP_CHAT_NAME,
  TEMPORARY_CHAT_BADGE,
} from "./chat-launch-names.ts";
export {
  CHAT_NAME_FIELD_NAME,
  CHAT_TITLE_FIELD_NAME,
  chatTitleButtonName,
  chatTitleWhole,
  RENAME_CHAT_NAME,
  renameChatButtonName,
} from "./chat-rename-names.ts";
export { authoredChatName, chatRoomTitle, deriveChatTitle } from "./chat-title.ts";
export { buildClientErrorPayload } from "./client-error-report.ts";
export type {
  CollectionContribution,
  CollectionCount,
  CollectionInsight,
  CollectionListView,
  CollectionMemberView,
  DrillBack,
} from "./collection-contracts.ts";
export { COLLECTION_LARGE_GROUP } from "./collection-contracts.ts";
export type { ConfigQueryToken, ParsedConfigQuery } from "./config-search-tokens.ts";
export {
  applyConfigToken,
  CONFIG_PLUGIN_TOKEN,
  CONFIG_QUERY_TOKENS,
  findHighlightRanges,
  parseConfigQuery,
  partialConfigToken,
  partialValueToken,
} from "./config-search-tokens.ts";
export type { RoleConnectionFacts, RoleRequirementVerdict, RoleRow } from "./connection-roles.ts";
export {
  ADD_CONNECTION_DOOR,
  ALLOW_BACKGROUND_SETTING,
  allowBackgroundSwitchName,
  backgroundRepairs,
  bindRefusal,
  CHAT_ROLE_DOOR,
  CONNECTION_ROLE_LABELS,
  CONNECTIONS_LIST_ADDRESS,
  connectionHost,
  connectionSummary,
  MEMORY_COST_SENTENCE,
  MODEL_ROLES_SUBCATEGORY_ID,
  openConnectionName,
  RERANK_ROLE_DOOR,
  ROLE_ROWS_ORDERED,
  ROLE_STATUS_LABELS,
  roleReadout,
  roleRequirementVerdicts,
  roleStatus,
  SMART_POLICY_COST_SENTENCE,
  UTILITY_ROLE_DOOR,
  utilityReadsImages,
} from "./connection-roles.ts";
export { CONSOLE_STYLES } from "./console-styles.ts";
export {
  CONTEXT_SHEET_BACK_NAME,
  contextPaneLabel,
  DETAILS_PANEL_NOUN,
  LIST_PANEL_NOUN,
  listPaneLabel,
  PANEL_CLOSE_FALLBACK_NAME,
  POPUP_LAYER_NAME,
  panelCloseName,
  panelEdgeName,
  screenListDoorName,
  screenOverviewDoorName,
  sectionBackName,
} from "./context-pane-names.ts";
export { contextToggleLabel } from "./context-toggle-label.ts";
export type {
  CharacterDetailContribution,
  CharacterDetailState,
  ChatControl,
  ChatControlAction,
  ChatControlKind,
  ChatControlMode,
  ChatControlSource,
  ChatControlSourceMountProps,
  ChatMessageSurfaceState,
  ChatRoomSurfaceState,
  ChatSettingsSectionContribution,
  ChatSettingsSectionState,
  ChatSurfaceAnchor,
  ChatSurfaceContribution,
  CommandPaletteSource,
  MessageToolsRenderer,
  PaletteCommandRow,
  SlashArgCompleter,
  SlashArgOffer,
  SlashCommandContext,
  SlashCommandContribution,
  SlashCommandGroup,
  SlashCommandMountProps,
  SlashCommandRunner,
  SlashCommandUnavailableFor,
  ToolRenderer,
} from "./contribution-contracts.ts";
export {
  CHAT_CONTROL_KINDS,
  SLASH_COMMAND_GROUP_LABELS,
  SLASH_COMMAND_GROUPS,
} from "./contribution-contracts.ts";
export { copyHeldText, copyWithNotice } from "./copy-with-notice.ts";
export type { CorpusDestination } from "./corpus-destination.ts";
export { corpusDestinationIdentity } from "./corpus-destination.ts";
export type { CorpusMode, CorpusModeContribution } from "./corpus-modes.ts";
export { CORPUS_MODE_LABELS, CORPUS_MODES, CORPUS_WHOLE_LABEL, isCorpusMode } from "./corpus-modes.ts";
export { createRegistryContext } from "./create-registry-context.tsx";
export { IS_DEV } from "./dev-flag.ts";
export { DIALOG_PENDING_VERBS, DIALOG_VERBS } from "./dialog-verbs.ts";
export { downloadJson, downloadTextFile, downloadUrl, slugifyFilename } from "./download-json.ts";
export type { EditSession } from "./edit-session.ts";
export { resolveCommit } from "./edit-session.ts";
export {
  EMBED_REFUSAL_SLOTS,
  EMBED_REFUSAL_TOAST_TITLE,
  embedderCheckingText,
  embedderRebuildState,
  embedRefusalOf,
  embedRefusalRowText,
  embedRefusalText,
  REBUILD_JOBS_LABEL,
  REBUILD_STATUS_COPY,
  REINDEX_CONFIRM_COPY,
  reindexConfirmDescription,
  reindexNeedsConfirm,
  SEARCH_PAUSED_COPY,
  VECTOR_ROLES,
} from "./embedder-rebuild.ts";
export { AppErrorBoundary } from "./error-boundary.tsx";
export { filteredCensus } from "./filtered-census.ts";
export { MESSAGE_TOOLS_LABEL, SIDECAR_PANELS_LABEL, SIDECAR_PANELS_NOUN } from "./flank-names.ts";
export { publishFlankHost, publishInlineFlankFit, setFlankSheetOpen, useFlankHost, useFlankSheetOpen, useInlineFlankFits } from "./flank-placement.ts";
export { holdFlipInPhase } from "./flip-phase.ts";
export {
  IMAGE_MODE_LABELS,
  IMAGE_NEGATIVE_PROMPT_FIELD_NAME,
  IMAGE_NEGATIVE_PROMPT_NOUN,
  IMAGE_SIZE_FIELD_NAME,
  IMAGE_SIZE_LABELS,
  IMAGE_SIZE_MODE_DEFAULT,
} from "./image-size-copy.ts";
export type { SendRefusalKey } from "./injection-copy.ts";
export {
  ADD_CONNECTION_PATH,
  ASSISTANT_PREFILL_WARNING,
  CHOICE_NEEDS_LIVE_CHAT,
  CHOICE_WAIT_FOR_TURN,
  CONTROL_ACTION_RUNNING,
  CONTROL_CHIPS_COLLAPSE,
  CONTROL_MODE_CONSEQUENCE,
  CONTROL_MODE_WORD,
  controlOverflowNotice,
  controlStripNotice,
  GENERATION_FAILED_DETAIL,
  IMAGE_GEN_NEEDS_TEXT,
  IMAGE_GEN_SPENDS_NOW,
  IMAGINE_DOOR_HELPER,
  IMPERSONATE_FAILED_LEAD,
  IMPERSONATE_IN_FLIGHT,
  IMPERSONATE_STOP_LABEL,
  IMPERSONATE_WAIT_FOR_TURN,
  MODEL_ROLES_PATH,
  MODEL_ROLES_PATH_TEXT,
  NEEDS_CONTINUATION,
  OFFER_CHOICES_ONE_SHOT,
  REGENERATE_PLAIN_HELPER,
  RESPONSE_SPEAKER_CUE,
  ROOM_PICTURES_NOTE,
  STEER_CUE_CONTINUE,
  STEER_CUE_IMPERSONATE,
  STEER_CUE_RESPONSE,
  STEER_CUE_SWIPE,
  SWIPE_NEEDS_REPLY,
  sendUnavailableReason,
} from "./injection-copy.ts";
export { DEAD_INVITE_SENTENCE, inviteRoomSentence } from "./invite-copy.ts";
export {
  ITEM_ATTACH_SETTING,
  ITEM_ENABLED_SETTING,
  itemSwitchName,
  PROMPT_CACHE_AUTOMATIC_SETTING,
  PROMPT_CACHE_DISABLE_IMPLICIT_SETTING,
  PROMPT_CACHE_REQUEST_SETTING,
  PROMPT_CACHE_SYSTEM_SETTING,
} from "./item-switch-names.ts";
export { BAND_NEW_LABEL } from "./list-band-names.ts";
export type { ListPaneHeaderProps, ListPaneHeaderView } from "./list-pane-header-view.ts";
export { LIST_PANE_TITLE_ID } from "./list-pane-title-id.ts";
export {} from "./log-clock.ts";
export type { MessageRenderContext } from "./message-render.ts";
export { renderMessageForDisplay } from "./message-render.ts";
export { MESSAGE_ROLE_ITEMS, MESSAGE_ROLE_LABELS } from "./message-role-labels.ts";
export type { NotifyAction, NotifyNotice } from "./notify.ts";
export { bindNotify, leaseNotify, notify } from "./notify.ts";
export { createOpenRequestChannel, useOpenRequests } from "./open-request-channel.ts";
export { OS_PREFERENCE_LABELS } from "./os-preference-labels.ts";
export type { OverflowMenuForm, OverflowMenuItem } from "./overflow-menu-form.ts";
export { BAND_OVERFLOW_LABEL, TRAIL_OVERFLOW_LABEL } from "./overflow-names.ts";
export { perfMark, perfMeasure } from "./perf-marks.ts";
export { pluginCommandAuditAttributes, pluginMenuAuditAttributes, pluginSurfaceAuditAttributes } from "./plugin-ui-audit-attributes.ts";
// The Tier-C plugin guest's main-thread ↔ worker wire — a contract between two
// EXECUTION CONTEXTS, which is why it is a client-wide lib shape rather than a feature-private one.
export type {
  UiGuestInbound,
  UiGuestOutbound,
  UiGuestReadyMessage,
  UiGuestSettledMessage,
  UiGuestUnavailableMessage,
} from "./plugin-ui-guest-protocol.ts";
export { UI_GUEST_BOOT_WALL_MS, UI_GUEST_WALL_MS } from "./plugin-ui-guest-protocol.ts";
export {} from "./probe-mode.ts";
export type { CatalogMacro, MacroCatalog, MacroPlane } from "./prompt-macros.ts";
export { BUILTIN_MACRO_SUGGESTIONS, MACRO_CATEGORY_WORDS, macroCatalog, macroSourceLabel, pluginMacroPlanes, presetNamesPlane } from "./prompt-macros.ts";
export { PRIMARY_NAV_NAME, YOU_TAB_LABEL } from "./rail-names.ts";
export {
  REGEX_PLACEMENT_GLYPHS,
  REGEX_PLACEMENT_ITEMS,
  REGEX_PLACEMENT_LABELS,
  regexPlacementStages,
  regexPlacementStep,
  regexRowScent,
  regexScriptScent,
  regexScriptTitle,
} from "./regex-placement-labels.ts";
export type { ContributorRegistry, Registry } from "./registry.ts";
export { createContributorRegistry, createRegistry } from "./registry.ts";
export type {
  CharacterChatsProjectionView,
  CharacterContextState,
  ChatContextTabId,
  CommittedChatContext,
  ConfigContextState,
  ConfigRosterEntry,
  ConfigTeachDoor,
  ConfigTeacherTabId,
  ConfigTeachValue,
  ConfigTeachView,
  ContextDefinition,
  ContextRegionDef,
  ContextRegionView,
  ContextTabDef,
  CorpusContextState,
  RefineryContextState,
  ResolvedContextTab,
  ResolvedContextTabs,
} from "./registry-contracts.ts";
export { CHAT_PLUGINS_TAB_LABEL, CONFIG_TEACHER_TAB_IDS, defineContextRegion, defineContextTabs, GAME_STRIP_LABEL } from "./registry-contracts.ts";
export { RenderProfiler } from "./render-profiler.tsx";
export type { RowRenderPolicy } from "./render-trust.ts";
export { DEPLOYMENT_FLOOR, resolveRowRenderPolicy } from "./render-trust.ts";
export { dataThemeOf, isSeedThemeName, resolveThemeScopeTokens, type SeedThemeName } from "./resolve-theme-scope-tokens.ts";
export { RETRY_NAME } from "./retry-names.ts";
export { ESTIMATED_ROW_PX } from "./row-estimates.ts";
export { deleteConfirmTitle, ROW_DELETE_NAME, ROW_DUPLICATE_NAME, ROW_EXPORT_NAME, ROW_RENAME_NAME, rowStarToggleName } from "./row-menu-names.ts";
export {
  chatWithActionName,
  collidingNameQualifiers,
  duplicateActionName,
  groupOrdinalQualifiers,
  positionQualifier,
  renameActionName,
  rowActionSubject,
  rowActionsName,
  rowQualifiers,
  viewImageActionName,
} from "./row-qualifiers.ts";
export type { SafeErrorRingRead } from "./safe-error-ring.ts";
export { installSafeErrorRing, safeErrorRing } from "./safe-error-ring.ts";
export { CLEAR_FILTER_NAME, CLEAR_SEARCH_NAME, NO_MATCHES_TITLE } from "./search-empty-names.ts";
export { onSessionMessage, postSessionMessage, runSessionRecoverySingleFlight } from "./session-channel.ts";
export type { SessionDocumentHost } from "./session-document-host.ts";
export { bindSessionDocumentHost, leaseSessionDocumentHost, sessionDocument } from "./session-document-host.ts";
export { settingGloss } from "./setting-gloss.ts";
export { settingsValueAtPath, settingsValueDiffers } from "./settings-path.ts";
export type { UnreadableConfigCopy } from "./stored-config-unreadable-copy.ts";
export { PRESET_UNREADABLE_COPY, PRESET_UNREADABLE_ROW_MARKER, SETTINGS_UNREADABLE_COPY, unreadableConfigCause } from "./stored-config-unreadable-copy.ts";
export type { ActiveTagFilterState, TagFilterEntry, TagFilterState } from "./tag-filter-state.ts";
export { cycleTagFilterEntries, tagFilterStateOf } from "./tag-filter-state.ts";
export {
  LABELS_BLURB,
  LABELS_EMPTY,
  LABELS_NONE,
  NEW_LABEL_NAME,
  pruneConfirmLabel,
  tagSortItems,
  tagTargetTitle,
  tagUsageLabel,
  USAGE_KIND_TITLES,
  unusedTagsLabel,
  usageBreakdown,
} from "./tag-model.ts";
export type { TagSortMode } from "./tag-sort.ts";
export { DEFAULT_TAG_SORT_MODE, sortTagsBy, TAG_SORT_MODES } from "./tag-sort.ts";
export { talkativenessAccessibleName, talkativenessControlName, talkativenessPercent, talkativenessReadout } from "./talkativeness.ts";
export { testId } from "./test-ids.ts";
export { DENSITY_ITEMS } from "./theme-appearance-items.ts";
export { recordInputBorderFallback, recordToneFallback } from "./theme-fallback-ring.ts";
export type { ThemeColorFields } from "./theme-override-form.ts";
export { assignThemeColorFields } from "./theme-override-form.ts";
export { THEME_RADIUS_LABELS } from "./theme-radius-labels.ts";
export { timeLib, viewerTimeZone } from "./time.ts";
export { createToastNotify } from "./toast-notify.ts";
export { formatTrpcOp } from "./trpc-devlog.ts";
export { trpcErrorCode, trpcErrorReason } from "./trpc-error-reason.ts";
export { isSilencedTurnAbort, turnAbortNotice, turnMutationToast } from "./turn-abort-notice.ts";
export { oversizeUploadMessage } from "./upload-cap-check.ts";
export { withoutUrlSearchParam } from "./url-search.ts";
export { SEARCH_DEBOUNCE_MS, useDebouncedValue } from "./use-debounced-value.ts";
export { useElapsedSeconds } from "./use-elapsed-seconds.ts";
export { holdArrivalWhilePending, useFocusListArrival, useFocusOnMount, useFocusOnSwap } from "./use-focus-on-mount.ts";
export { useRouterUrlReplace } from "./use-router-url-replace.ts";
export { motionIsReduced, runAfterViewTransition, surfaceDeferredFailure } from "./view-transition.ts";
