// data/ front door — the Query/tRPC layer (UI-Arch §2.1): the typed client + options proxy, the
// pinned QueryClient, the central invalidation seam, the bus reducer + adapter, and the three
// factories every surface builds on (§13.2: a surface not using its primitive is the review flag).

export type { AuthConfig } from "@orb/contracts/auth-config";
export {
  confirmPendingJoin,
  fetchAuthMe,
  firstRunSetup,
  login,
  signOut,
  signUpWithInvite,
  useAuthMe,
  usePendingJoinPreview,
  useSignupInvitePreview,
} from "./auth-bootstrap.ts";
export {
  fetchLiveShare,
  useAuthConfig,
  useExternalMediaBlocked,
  useInteractiveCardsAllowed,
  useLiveShare,
  useMultiHumanCapable,
  useRenderPolicyFloor,
  useUploadCaps,
} from "./auth-config.ts";
export type { ChatBusDeps } from "./bus/index.ts";
export {
  markTurnStopping,
  recoverTurnAfterStopFailure,
  useBusRoom,
  useChatBus,
  useChatBusDeps,
  useOrbSocket,
  useRpgBus,
  useUserBus,
} from "./bus/index.ts";
export type { ClientRuntime } from "./client-runtime-contract.ts";
export type { CollectionSurface } from "./create-collection-surface.ts";
export { createCollectionSurface } from "./create-collection-surface.ts";
export { createEntityMutation } from "./create-entity-mutation.ts";
export { readAutomationFires } from "./fetch-automation-fires.ts";
export { fetchPluginUiSource } from "./fetch-plugin-ui-source.ts";
export { readFresh } from "./fresh-read.ts";
export {} from "./http-error.ts";
export { importBundle } from "./import-bundle.ts";
export type { CardImportResult } from "./import-characters.ts";
export { importCharacters } from "./import-characters.ts";
export type { ChatImportResult } from "./import-chats.ts";
export { importChats } from "./import-chats.ts";
export { importTree, relativePathOf } from "./import-tree.ts";
export type { TreeImportCaps, TreeImportPlan } from "./import-tree-plan.ts";
export { skippedByReason } from "./import-tree-plan.ts";
export { planServedFolderImport } from "./import-tree-served.ts";
export type { InvalidateFilter, Invalidation } from "./invalidation.ts";
export {} from "./invalidation.ts";
export {} from "./invalidation-carrier.ts";
export { connectionWriteReads, personaWriteReads } from "./invalidation-reads.ts";
export { consumeInboundJoinToken, peekInboundJoinToken, stashInboundJoinToken } from "./join-token.ts";
export { usePresenceRead, useSendAvailabilityRead } from "./live-fact-reads.ts";
export { notifyNewRoomPersona } from "./new-room-persona-notice.ts";
export { peekQueryData } from "./peek-query.ts";
export { postBugReport } from "./post-bug-report.ts";
export { createAppQueryClient, trpcErrorCode } from "./query-client.ts";
export { QueryErrorState } from "./query-error-state.tsx";
export { QueryInlineStates } from "./query-inline-states.tsx";
export { restoreCardLorebook } from "./restore-card-lorebook.ts";
export {} from "./session-freshness.ts";
export { clearJoinStash, peekJoinStash } from "./session-resume.ts";
export { skeletonRowCountFor } from "./skeleton-row-metrics.ts";
export { SkeletonRows } from "./skeleton-rows.tsx";
export { completeReauth } from "./stale-session.ts";
export type { Trpc, TrpcClient, TrpcReadError } from "./trpc.ts";
export { createTrpcClient, createTrpcProxy, TRPCProvider, useTRPC, useTRPCClient } from "./trpc.ts";
export { UploadRefusedError } from "./upload-asset.ts";
export { uploadDocument } from "./upload-document.ts";
export { useCardFrameSrc } from "./use-card-frame.ts";
export { useCarriedAppearance } from "./use-carried-appearance.ts";
export { useColorQuotedSpeech } from "./use-color-quoted-speech.ts";
export { DISPLAY_PLACEMENT, useDisplayScripts, usePrefetchDisplayScripts } from "./use-display-scripts.ts";
export { useDecisionQuery, useGatedQuery } from "./use-gated-query.ts";
export { useHuskReaper } from "./use-husk-reaper.ts";
export { IdsContext, useIds } from "./use-ids.ts";
export { useInvalidation } from "./use-invalidation.ts";
export {} from "./use-online-status.ts";
export { useOpenRefinery } from "./use-open-refinery.ts";
export type { PluginDisplayRow } from "./use-plugin-display-text.ts";
export { usePluginDisplayText } from "./use-plugin-display-text.ts";
export { usePluginFrameSrc } from "./use-plugin-frame.ts";
export { usePromptMacroSuggestions } from "./use-prompt-macro-suggestions.ts";
export { useReattributePersona } from "./use-reattribute-persona.ts";
export type { SessionRecoveryState } from "./use-session-recovery.ts";
export { useSessionRecovery } from "./use-session-recovery.ts";
export { useSettingsViewerView } from "./use-settings-viewer-view.ts";
export { useStartChat } from "./use-start-chat.ts";
export { useUploadAsset } from "./use-upload-asset.ts";
