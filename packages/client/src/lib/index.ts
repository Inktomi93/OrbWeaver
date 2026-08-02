// lib/ front door — the cross-cutting display/util seams. Deliberately NOT exported here (dev-only
// modules never ride a shared barrel): ./dev-tools (main.tsx lazy-mounts it), ./long-task-tracer
// (main.tsx dynamic-imports it).

export { cn } from "@orb/ui/lib";
export { BACKGROUND_KIND_ITEMS, BACKGROUND_KIND_LABELS } from "./background-kind-items";
export { busDupCheck, busInvalidate, busSubscribe, busUnsubscribe } from "./bus-devlog";
export type { ChatWithCharacterSeats } from "./chats-with-character";
export { chatsWithCharacter } from "./chats-with-character";
export type { ClientErrorPayload } from "./client-error-report";
export { buildClientErrorPayload } from "./client-error-report";
export type { RegistryContext } from "./create-registry-context";
export { createRegistryContext } from "./create-registry-context";
export { IS_DEV } from "./dev-flag";
export { downloadJson, downloadUrl, slugifyFilename } from "./download-json";
export type { AppErrorBoundaryProps } from "./error-boundary";
export { AppErrorBoundary } from "./error-boundary";
export type { DormantDoorway, HomeTileContribution, HomeTileSpan } from "./home-tile-contracts";
export { HOME_TILE_SPANS } from "./home-tile-contracts";
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
  NEEDS_ASSISTANT_REPLY,
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
  WAND_NEEDS_TEXT,
} from "./injection-copy";
export type { SeededBackground } from "./list-seeded-backgrounds";
export { listSeededBackgrounds, resolveSeededBackgroundUrl } from "./list-seeded-backgrounds";
export { logClock } from "./log-clock";
export { messageBubbleClass } from "./message-bubble-class";
export type { MessageRenderContext } from "./message-render";
export { renderMessageForDisplay } from "./message-render";
export { MESSAGE_ROLE_ITEMS, MESSAGE_ROLE_LABELS } from "./message-role-labels";
export type { Notify } from "./notify";
export { bindNotify, notify } from "./notify";
export { perfMark, perfMeasure } from "./perf-marks";
export { isProbeMode } from "./probe-mode";
export { PROMPT_MACRO_SUGGESTIONS } from "./prompt-macros";
export { REGEX_PLACEMENT_ITEMS, REGEX_PLACEMENT_LABELS, regexPlacementStep } from "./regex-placement-labels";
export type { ContributorRegistry, Registry } from "./registry";
export { createContributorRegistry, createRegistry } from "./registry";
export * from "./registry-contracts";
export { RenderProfiler } from "./render-profiler";
export type { ResolveRowRenderPolicyInput, RowRenderPolicy } from "./render-trust";
export { resolveRowRenderPolicy } from "./render-trust";
export { rowQualifiers } from "./row-qualifiers";
export { TEST_IDS, testId } from "./test-ids";
export { CHAT_STYLE_ITEMS, DENSITY_ITEMS } from "./theme-appearance-items";
export type { ThemeColorFields } from "./theme-override-form";
export { assignThemeColorFields } from "./theme-override-form";
export { timeLib } from "./time";
export type { TrpcOpLogEntry } from "./trpc-devlog";
export { formatTrpcOp } from "./trpc-devlog";
export * from "./use-focus-on-mount";
export { withViewTransition } from "./view-transition";
export type { WeaveGlyphProps } from "./weave-glyph";
export { WeaveGlyph } from "./weave-glyph";
