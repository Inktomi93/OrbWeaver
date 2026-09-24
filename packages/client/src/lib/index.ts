// lib/ front door — the cross-cutting display/util seams. Deliberately NOT exported here (dev-only
// modules never ride a shared barrel): ./dev-tools (main.tsx lazy-mounts it), ./long-task-tracer
// (main.tsx dynamic-imports it).

// `cn` and the item-action name grammars are @orb/ui's: a `@orb/ui` primitive spells `Remove <x>`
// (combobox chips), `Select <x>` (table rows) and `Copy <x>` (copy-button), and `ui` cannot import `client` (the cake, §2), so the
// grammar homes at the lowest package that spells it and rides this barrel for client callers + tests.
export { cn, copyActionName, removeActionName, selectActionName } from "@orb/ui/lib";
export type { AppFailureKind, AppFailureSurfaceProps } from "./app-failure-surface.tsx";
export { AppFailureSurface } from "./app-failure-surface.tsx";
export type {
  AppearanceCarrierKey,
  AppearanceCarrierPlane,
  AppearanceConsumerBinding,
  AppearanceEditorOwner,
  AppearanceLifecycle,
  AppearancePortalObligation,
} from "./appearance-carrier-manifest.ts";
export {
  APPEARANCE_CARRIER_MANIFEST,
  APPEARANCE_CARRIER_PLANES,
  APPEARANCE_EDITOR_OWNERS,
  APPEARANCE_OWNER_KEYS,
  appearanceCarrierRowsFor,
  THEME_CARRIER_OBSERVABLES,
} from "./appearance-carrier-manifest.ts";
export { setBootReadPending } from "./boot-reads.ts";
export { __resetBusDupBursts, busDupCheck, busInvalidate, busSubscribe, busUnsubscribe } from "./bus-devlog.ts";
export { deriveChatTitle, UNTITLED_CHAT_TITLE } from "./chat-title.ts";
export type { ClientErrorPayload } from "./client-error-report.ts";
export { buildClientErrorPayload } from "./client-error-report.ts";
export type {
  CollectionContext,
  CollectionContribution,
  CollectionCount,
  CollectionDetailView,
  CollectionInsight,
  CollectionListView,
  CollectionMemberView,
} from "./collection-contracts.ts";
export { COLLECTION_LARGE_GROUP } from "./collection-contracts.ts";
export type { ConfigQueryToken, ParsedConfigQuery } from "./config-search-tokens.ts";
export { applyConfigToken, CONFIG_QUERY_TOKENS, findHighlightRanges, parseConfigQuery, partialConfigToken } from "./config-search-tokens.ts";
export type {
  CharacterDetailAnchor,
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
  ChatSettingsSectionAnchor,
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
  ToolRenderer,
  ToolRendererMatch,
} from "./contribution-contracts.ts";
export {
  CHARACTER_DETAIL_ANCHORS,
  CHAT_CONTROL_KINDS,
  CHAT_CONTROL_MODES,
  CHAT_SETTINGS_SECTION_ANCHORS,
  CHAT_SURFACE_ANCHORS,
  SLASH_COMMAND_GROUP_LABELS,
  SLASH_COMMAND_GROUPS,
  TOOL_RENDERER_MATCHES,
} from "./contribution-contracts.ts";
export { copyWithNotice } from "./copy-with-notice.ts";
export type { RegistryContext } from "./create-registry-context.tsx";
export { createRegistryContext } from "./create-registry-context.tsx";
export { IS_DEV } from "./dev-flag.ts";
export { downloadJson, downloadTextFile, downloadUrl, slugifyFilename } from "./download-json.ts";
export type { EditSession } from "./edit-session.ts";
export { resolveCommit } from "./edit-session.ts";
export type { AppErrorBoundaryProps } from "./error-boundary.tsx";
export { AppErrorBoundary } from "./error-boundary.tsx";
export {
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
  NEEDS_CONTINUATION,
  OFFER_CHOICES_ONE_SHOT,
  REGENERATE_PLAIN_HELPER,
  RESPONSE_SPEAKER_CUE,
  STEER_CUE_CONTINUE,
  STEER_CUE_IMPERSONATE,
  STEER_CUE_RESPONSE,
  STEER_CUE_SWIPE,
  SWIPE_NEEDS_REPLY,
  sendUnavailableReason,
} from "./injection-copy.ts";
export { LIST_PANE_TITLE_ID } from "./list-pane-title-id.ts";
export { logClock } from "./log-clock.ts";
export { messageBubbleClass } from "./message-bubble-class.ts";
export type { MessageRenderContext } from "./message-render.ts";
export { isDisplayRegexTooComplex, renderMessageForDisplay } from "./message-render.ts";
export { MESSAGE_ROLE_ITEMS, MESSAGE_ROLE_LABELS } from "./message-role-labels.ts";
export type { Notify, NotifyAction, NotifyInput, NotifyNotice } from "./notify.ts";
export { bindNotify, notify, toNotice } from "./notify.ts";
export { perfMark, perfMeasure } from "./perf-marks.ts";
// The Tier-C plugin guest's main-thread ↔ worker wire — a contract between two
// EXECUTION CONTEXTS, which is why it is a client-wide lib shape rather than a feature-private one.
export type {
  UiGuestBootMessage,
  UiGuestEventMessage,
  UiGuestHostCallMessage,
  UiGuestHostResultMessage,
  UiGuestInbound,
  UiGuestLogMessage,
  UiGuestOutbound,
  UiGuestReadyMessage,
  UiGuestRenderMessage,
  UiGuestSettledMessage,
} from "./plugin-ui-guest-protocol.ts";
export { UI_GUEST_BOOT_WALL_MS, UI_GUEST_BUDGETS, UI_GUEST_WALL_MS } from "./plugin-ui-guest-protocol.ts";
export { isProbeMode } from "./probe-mode.ts";
export { withUserMacros } from "./prompt-macros.ts";
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
  AnalyticsContextState,
  CharacterChatsProjectionView,
  CharacterContextState,
  ChatContextState,
  ChatContextTabId,
  CommittedChatContext,
  ConfigContextState,
  ConfigRosterEntry,
  ConfigTeachDoor,
  ConfigTeacherTabId,
  ConfigTeachValue,
  ConfigTeachView,
  ContextDefinition,
  ContextEmptyArm,
  ContextRegionDef,
  ContextRegionView,
  ContextTabDef,
  ContextTabStrip,
  ContextTabsSpec,
  RefineryContextState,
  ResolvedContextTab,
  ResolvedContextTabs,
} from "./registry-contracts.ts";
export {
  CHAT_CONTEXT_TAB_IDS,
  CONFIG_TEACHER_TAB_IDS,
  defineContextRegion,
  defineContextTabs,
  GAME_STRIP_LABEL,
  resolveContextTabs,
  VOID_STATE,
} from "./registry-contracts.ts";
export { RenderProfiler } from "./render-profiler.tsx";
export type { ResolveRowRenderPolicyInput, RowRenderPolicy } from "./render-trust.ts";
export { DEPLOYMENT_FLOOR, resolveRowRenderPolicy, SAFE_FLOOR } from "./render-trust.ts";
export {
  BASE_PALETTE_COLOR_SCHEME,
  BASE_PALETTE_VARS,
  dataThemeOf,
  isSeedThemeName,
  type ResolvedThemeScope,
  resolveThemeScopeTokens,
  type SeedThemeName,
} from "./resolve-theme-scope-tokens.ts";
export { chatWithActionName, duplicateActionName, renameActionName, rowActionSubject, rowActionsName, rowQualifiers } from "./row-qualifiers.ts";
export type { SessionMessage, SingleFlightOutcome } from "./session-channel.ts";
export { onSessionMessage, postSessionMessage, runSessionRecoverySingleFlight } from "./session-channel.ts";
export type { SessionDocumentHost } from "./session-document-host.ts";
export { bindSessionDocumentHost, sessionDocument } from "./session-document-host.ts";
export { settingGloss } from "./setting-gloss.ts";
export { settingsValueAtPath, settingsValueDiffers } from "./settings-path.ts";
export type { UnreadableConfigCause, UnreadableConfigCopy } from "./stored-config-unreadable-copy.ts";
export { PRESET_UNREADABLE_COPY, SETTINGS_UNREADABLE_COPY, unreadableConfigCause } from "./stored-config-unreadable-copy.ts";
export type { ActiveTagFilterState, TagFilterEntry, TagFilterState } from "./tag-filter-state.ts";
export { cycleTagFilterEntries, NEXT_TAG_FILTER_STATE, TAG_FILTER_STATES, tagFilterStateOf } from "./tag-filter-state.ts";
export type { SortableTag, TagSortMode } from "./tag-sort.ts";
export { DEFAULT_TAG_SORT_MODE, sortTagsBy, TAG_SORT_MODES } from "./tag-sort.ts";
export { talkativenessAccessibleName, talkativenessLevel } from "./talkativeness.ts";
export { TEST_IDS, testId } from "./test-ids.ts";
export { DENSITY_ITEMS } from "./theme-appearance-items.ts";
export type { ThemeColorFields } from "./theme-override-form.ts";
export { assignThemeColorFields } from "./theme-override-form.ts";
export { timeLib } from "./time.ts";
export { createToastNotify } from "./toast-notify.ts";
export type { TrpcOpLogEntry } from "./trpc-devlog.ts";
export { formatTrpcOp } from "./trpc-devlog.ts";
export { trpcErrorReason } from "./trpc-error-reason.ts";
export { isSilencedTurnAbort, TURN_LOCKED_COPY, TURN_STALE_ABORT_COPY, turnAbortNotice, turnMutationToast } from "./turn-abort-notice.ts";
export { oversizeUploadMessage } from "./upload-cap-check.ts";
export { useDebouncedValue } from "./use-debounced-value.ts";
export { useFocusOnMount, useFocusOnSwap } from "./use-focus-on-mount.ts";
export { motionIsReduced } from "./view-transition.ts";
