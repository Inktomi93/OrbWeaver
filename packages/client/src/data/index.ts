// data/ front door — the Query/tRPC layer (UI-Arch §2.1): the typed client + options proxy, the
// pinned QueryClient, the central invalidation seam, the bus reducer + adapter, and the three
// factories every surface builds on (§13.2: a surface not using its primitive is the review flag).

export type { AuthConfig } from "./auth-config";
export { AUTH_CONFIG_KEY, fetchAuthConfig, useAuthConfig } from "./auth-config";
export type { ChatBusDeps, UserBusDeps } from "./bus/index";
export { applyChatBusEvent, useChatBus, useUserBus } from "./bus/index";
export type {
  CollectionSelection,
  CollectionSurface,
  CollectionSurfaceConfig,
} from "./create-collection-surface";
export { createCollectionSurface } from "./create-collection-surface";
export type { EntityMutationConfig, EntityMutationResult } from "./create-entity-mutation";
export { createEntityMutation } from "./create-entity-mutation";
export { throwHttpError } from "./http-error";
export type { BundleImportStarted } from "./import-bundle";
export { importBundle } from "./import-bundle";
export type { CardImportResult } from "./import-characters";
export { importCharacters } from "./import-characters";
export type { TreeImportStarted } from "./import-tree";
export { importTree, relativePathOf } from "./import-tree";
export type { InvalidateFilter, Invalidation } from "./invalidation";
export { createInvalidation } from "./invalidation";
export type { QueryBoundaryProps } from "./query-boundary";
export { QueryBoundary } from "./query-boundary";
export type { AppMeta } from "./query-client";
export { createAppQueryClient } from "./query-client";
export type { QueryErrorStateProps } from "./query-error-state";
export { QueryErrorState } from "./query-error-state";
export type { SkeletonRowShape, SkeletonRowsProps } from "./skeleton-rows";
export { SkeletonRows } from "./skeleton-rows";
export type { Trpc } from "./trpc";
export { createTrpcClient, createTrpcProxy, TRPCProvider, useTRPC, useTRPCClient } from "./trpc";
export { uploadAsset } from "./upload-asset";
export { useGatedQuery } from "./use-gated-query";
export { useInvalidation } from "./use-invalidation";
export type { Viewer, ViewerPersona } from "./use-viewer";
export { useViewer } from "./use-viewer";
