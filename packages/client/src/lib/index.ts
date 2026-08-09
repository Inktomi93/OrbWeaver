// lib/ front door — the cross-cutting display/util seams. Deliberately NOT exported here (dev-only
// modules never ride a shared barrel): ./dev-tools (main.tsx lazy-mounts it), ./long-task-tracer
// (main.tsx dynamic-imports it).

// The seeded-background catalog has ONE home in @orb/contracts/theme (the server's /autobg arm reads the
// same list); re-exported here so every client consumer keeps importing it from `#lib`.
export type { SeededBackground } from "@orb/contracts/theme";
export { listSeededBackgrounds, resolveSeededBackgroundUrl } from "@orb/contracts/theme";
export { cn } from "@orb/ui/lib";
export { BACKGROUND_KIND_ITEMS, BACKGROUND_KIND_LABELS } from "./background-kind-items.ts";
export { busDupCheck, busInvalidate, busSubscribe, busUnsubscribe } from "./bus-devlog.ts";
export { deriveChatTitle, UNTITLED_CHAT_TITLE } from "./chat-title.ts";
export type { ChatWithCharacterSeats } from "./chats-with-character.ts";
export { chatsWithCharacter } from "./chats-with-character.ts";
export type { ClientErrorPayload } from "./client-error-report.ts";
export { buildClientErrorPayload } from "./client-error-report.ts";
export type { CollectionContext, CollectionContribution, CollectionDetailView, CollectionListView } from "./collection-contracts.ts";
export { COLLECTION_LARGE_GROUP, COLLECTION_WINDOW_MAX_HEIGHT } from "./collection-contracts.ts";
export type {
  CharacterDetailAnchor,
  CharacterDetailContribution,
  CharacterDetailState,
  ChatMessageSurfaceState,
  ChatRoomSurfaceState,
  ChatSurfaceAnchor,
  ChatSurfaceContribution,
  MessageToolsRenderer,
  SlashCommandContext,
  SlashCommandContribution,
  SlashCommandGroup,
  SlashCommandMountProps,
  SlashCommandRunner,
  ToolRenderer,
} from "./contribution-contracts.ts";
export { CHARACTER_DETAIL_ANCHORS, CHAT_SURFACE_ANCHORS, SLASH_COMMAND_GROUP_LABELS, SLASH_COMMAND_GROUPS } from "./contribution-contracts.ts";
export type { RegistryContext } from "./create-registry-context.tsx";
export { createRegistryContext } from "./create-registry-context.tsx";
export { IS_DEV } from "./dev-flag.ts";
export { downloadJson, downloadTextFile, downloadUrl, slugifyFilename } from "./download-json.ts";
export type { AppErrorBoundaryProps } from "./error-boundary.tsx";
export { AppErrorBoundary } from "./error-boundary.tsx";
export {
  ASSISTANT_PREFILL_WARNING,
  CHOICE_NEEDS_LIVE_CHAT,
  CHOICE_WAIT_FOR_TURN,
  CONTINUE_NEEDS_REPLY,
  DRAFT_UNLOCK_AFTER_SEND,
  GENERATION_FAILED_DETAIL,
  IMAGE_GEN_NEEDS_CHAT,
  IMAGE_GEN_NEEDS_TEXT,
  IMPERSONATE_AFTER_COMMIT_FAILED_LEAD,
  IMPERSONATE_FAILED_LEAD,
  IMPERSONATE_IN_FLIGHT,
  IMPERSONATE_STOP_LABEL,
  IMPERSONATE_WAIT_FOR_TURN,
  NEEDS_CONTINUATION,
  OPENING_AFTER_COMMIT_FAILED_HINT,
  OPENING_AFTER_COMMIT_FAILED_LEAD,
  REGENERATE_PLAIN_HELPER,
  STEER_CUE_CONTINUE,
  STEER_CUE_IMPERSONATE,
  STEER_CUE_RESPONSE,
  STEER_CUE_SWIPE,
  SWIPE_NEEDS_REPLY,
  sendUnavailableReason,
} from "./injection-copy.ts";
export { logClock } from "./log-clock.ts";
export { messageBubbleClass } from "./message-bubble-class.ts";
export type { MessageRenderContext } from "./message-render.ts";
export { renderMessageForDisplay } from "./message-render.ts";
export { MESSAGE_ROLE_ITEMS, MESSAGE_ROLE_LABELS } from "./message-role-labels.ts";
export type { Notify, NotifyAction, NotifyInput, NotifyNotice } from "./notify.ts";
export { bindNotify, notify, toNotice } from "./notify.ts";
export { perfMark, perfMeasure } from "./perf-marks.ts";
export { isProbeMode } from "./probe-mode.ts";
export { withUserMacros } from "./prompt-macros.ts";
export { REGEX_PLACEMENT_ITEMS, REGEX_PLACEMENT_LABELS, regexPlacementStep, regexScriptScent, regexScriptTitle } from "./regex-placement-labels.ts";
export type { ContributorRegistry, Registry } from "./registry.ts";
export { createContributorRegistry, createRegistry } from "./registry.ts";
export type {
  AnalyticsContextState,
  CharacterChatsProjectionView,
  CharacterContextState,
  ChatContextState,
  ChatContextTabId,
  CommittedChatContext,
  ContextDefinition,
  ContextEmptyArm,
  ContextRegionDef,
  ContextRegionView,
  ContextTabDef,
  ContextTabStrip,
  ContextTabsSpec,
  DraftChatContext,
  RefineryContextState,
  ResolvedContextTab,
  ResolvedContextTabs,
} from "./registry-contracts.ts";
export { CHAT_CONTEXT_TAB_IDS, defineContextRegion, defineContextTabs, resolveContextTabs, VOID_STATE } from "./registry-contracts.ts";
export { RenderProfiler } from "./render-profiler.tsx";
export type { ResolveRowRenderPolicyInput, RowRenderPolicy } from "./render-trust.ts";
export { resolveRowRenderPolicy, SAFE_FLOOR } from "./render-trust.ts";
export { rowQualifiers } from "./row-qualifiers.ts";
export type { ActiveTagFilterState, TagFilterEntry, TagFilterState } from "./tag-filter-state.ts";
export { cycleTagFilterEntries, NEXT_TAG_FILTER_STATE, TAG_FILTER_STATES, tagFilterStateOf } from "./tag-filter-state.ts";
export type { SortableTag, TagSortMode } from "./tag-sort.ts";
export { DEFAULT_TAG_SORT_MODE, sortTagsBy, TAG_SORT_MODES } from "./tag-sort.ts";
export { TEST_IDS, testId } from "./test-ids.ts";
export { DENSITY_ITEMS } from "./theme-appearance-items.ts";
export type { ThemeColorFields } from "./theme-override-form.ts";
export { assignThemeColorFields } from "./theme-override-form.ts";
export { timeLib } from "./time.ts";
export { createToastNotify } from "./toast-notify.ts";
export type { TrpcOpLogEntry } from "./trpc-devlog.ts";
export { formatTrpcOp } from "./trpc-devlog.ts";
export { useFocusOnMount, useFocusOnSwap } from "./use-focus-on-mount.ts";
export { withViewTransition } from "./view-transition.ts";
export type { WeaveGlyphProps } from "./weave-glyph.tsx";
export { WeaveGlyph } from "./weave-glyph.tsx";
