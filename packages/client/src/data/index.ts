// data/ front door — the Query/tRPC layer (UI-Arch §2.1): the typed client + options proxy, the
// pinned QueryClient, the central invalidation seam, the bus reducer + adapter, and the three
// factories every surface builds on (§13.2: a surface not using its primitive is the review flag).

export type { AuthMe } from "./auth-bootstrap.ts";
export { AUTH_ME_KEY, fetchAuthMe, login, logout } from "./auth-bootstrap.ts";
export type { AuthConfig } from "./auth-config.ts";
export { AUTH_CONFIG_KEY, fetchAuthConfig, useAuthConfig, useExternalMediaBlocked, useUploadCaps } from "./auth-config.ts";
export type { BusRoomHandlers, ChatBusDeps, RoomSubscriber, RoomTransport, RpgBusDeps, UserBusDeps } from "./bus/index.ts";
export {
  applyChatBusEvent,
  createRoomRegistry,
  markTurnStopping,
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
export { peekMatchingQueryData, peekQueryData } from "./peek-query.ts";
export type { QueryBoundaryProps } from "./query-boundary.tsx";
export { QueryBoundary } from "./query-boundary.tsx";
export type { AppMeta } from "./query-client.ts";
export { createAppQueryClient } from "./query-client.ts";
export type { QueryErrorStateProps } from "./query-error-state.tsx";
export { QueryErrorState } from "./query-error-state.tsx";
export type { QueryInlineStatesProps } from "./query-inline-states.tsx";
export { QueryInlineStates } from "./query-inline-states.tsx";
export { skeletonRowCountFor } from "./skeleton-row-metrics.ts";
export type { SkeletonRowShape, SkeletonRowsProps } from "./skeleton-rows.tsx";
export { SkeletonRows } from "./skeleton-rows.tsx";
export type { Trpc, TrpcReadError } from "./trpc.ts";
export { createTrpcClient, createTrpcProxy, TRPCProvider, useTRPC, useTRPCClient } from "./trpc.ts";
export { uploadAsset } from "./upload-asset.ts";
export type { UploadDocumentResult } from "./upload-document.ts";
export { uploadDocument } from "./upload-document.ts";
export type { CardFrameRequest } from "./use-card-frame.ts";
export { cardFrameMintBody, mintCardFrame, useCardFrameSrc } from "./use-card-frame.ts";
export { useCarriedAppearanceCast } from "./use-carried-appearance.ts";
export { useColorQuotedSpeech } from "./use-color-quoted-speech.ts";
export { useDisplayScripts } from "./use-display-scripts.ts";
export type { DraftCastCard } from "./use-draft-cast-cards.ts";
export { useDraftCastCards } from "./use-draft-cast-cards.ts";
export { useGatedQuery } from "./use-gated-query.ts";
export { useInvalidation } from "./use-invalidation.ts";
export { useOnlineStatus } from "./use-online-status.ts";
export { usePromptMacroSuggestions } from "./use-prompt-macro-suggestions.ts";
export { useSettingsViewerView } from "./use-settings-viewer-view.ts";
export { useUploadAsset } from "./use-upload-asset.ts";
export type { Viewer, ViewerPersona } from "./use-viewer.ts";
export { useViewer } from "./use-viewer.ts";
