// data/ PURE-LOGIC front door (#1243, Arm A-prime — the fork ledger for #1228's residual). Same shape
// as state/pure.ts (that file's header carries the full ARM/enforcer rationale). This surface is
// data/index.ts's content MINUS every `.tsx` component export and MINUS the four files whose own code
// (or import chain) is DOM-coupled — a mechanical filter over data/index.ts, not a hand-picked symbol
// list, so it stays complete as index.ts grows.
//
// EXCLUDED, DOM-coupled directly: auth-bootstrap.ts (`globalThis.location.assign`), stale-session.ts
// (`globalThis.location`), query-boundary.tsx (a component).
// EXCLUDED, DOM-coupled via import chain: auth-config.ts (imports `#state`'s deployment-boot-hint.ts →
// appearance-boot-hint.ts, which touches `document`/`window` directly), use-session-recovery.ts.
// EXCLUDED, `.tsx` component files: query-error-state.tsx, query-inline-states.tsx, skeleton-rows.tsx.

export type { BusRoomHandlers, ChatBusDeps, RoomSubscriber, RoomTransport, RpgBusDeps, UserBusDeps } from "./bus/index.ts";
export {
  applyChatBusEvent,
  createRoomRegistry,
  markTurnStopping,
  recoverTurnAfterStopFailure,
  useBusRoom,
  useChatBus,
  useChatBusDeps,
  useOrbSocket,
  useRpgBus,
  useUserBus,
} from "./bus/index.ts";
export type {
  CollectionSelection,
  CollectionSurface,
  CollectionSurfaceConfig,
} from "./create-collection-surface.ts";
export { createCollectionSurface } from "./create-collection-surface.ts";
export type { EntityMutationConfig, EntityMutationResult } from "./create-entity-mutation.ts";
export { createEntityMutation } from "./create-entity-mutation.ts";
export { fetchPluginUiSource } from "./fetch-plugin-ui-source.ts";
export { throwHttpError } from "./http-error.ts";
export type { BundleImportStarted } from "./import-bundle.ts";
export { importBundle } from "./import-bundle.ts";
export type { CardImportResult } from "./import-characters.ts";
export { importCharacters } from "./import-characters.ts";
export type { ChatImportResult } from "./import-chats.ts";
export { importChats } from "./import-chats.ts";
export type { TreeImportStarted } from "./import-tree.ts";
export { importTree, relativePathOf } from "./import-tree.ts";
export type { InvalidateFilter, Invalidation } from "./invalidation.ts";
export { createInvalidation } from "./invalidation.ts";
export { applyCanonView } from "./invalidation-carrier.ts";
export { peekQueryData } from "./peek-query.ts";
export type { AppMeta } from "./query-client.ts";
export { createAppQueryClient } from "./query-client.ts";
export { __resetSessionFreshness, markSessionFresh, sessionFreshnessAgeMs, startSessionFreshness } from "./session-freshness.ts";
export type { SessionResumeSnapshot } from "./session-resume.ts";
export { takeSessionResume, writeSessionResume } from "./session-resume.ts";
export { skeletonRowCountFor } from "./skeleton-row-metrics.ts";
export type { Trpc, TrpcReadError } from "./trpc.ts";
export { createTrpcClient, createTrpcProxy, TRPCProvider, useTRPC, useTRPCClient } from "./trpc.ts";
export { uploadAsset } from "./upload-asset.ts";
export type { UploadDocumentResult } from "./upload-document.ts";
export { uploadDocument } from "./upload-document.ts";
export type { CardFrameRequest } from "./use-card-frame.ts";
export { cardFrameMintBody, mintCardFrame, useCardFrameSrc } from "./use-card-frame.ts";
export { useCarriedAppearance } from "./use-carried-appearance.ts";
export { useColorQuotedSpeech } from "./use-color-quoted-speech.ts";
export { useDisplayScripts, usePrefetchDisplayScripts } from "./use-display-scripts.ts";
export { useGatedQuery } from "./use-gated-query.ts";
export { useHuskReaper } from "./use-husk-reaper.ts";
export { useInvalidation } from "./use-invalidation.ts";
export { useOnlineStatus } from "./use-online-status.ts";
export type { UseOpenRefineryResult } from "./use-open-refinery.ts";
export { useOpenRefinery } from "./use-open-refinery.ts";
export type { PluginDisplayRow } from "./use-plugin-display-text.ts";
export { usePluginDisplayText } from "./use-plugin-display-text.ts";
export type { PluginFrameRequest } from "./use-plugin-frame.ts";
export { mintPluginFrame, pluginFrameMintBody, usePluginFrameSrc } from "./use-plugin-frame.ts";
export { usePromptMacroSuggestions } from "./use-prompt-macro-suggestions.ts";
export { useSettingsViewerView } from "./use-settings-viewer-view.ts";
export type { UseStartChatResult } from "./use-start-chat.ts";
export { useStartChat } from "./use-start-chat.ts";
export { useUploadAsset } from "./use-upload-asset.ts";
