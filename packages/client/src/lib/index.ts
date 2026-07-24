// lib/ front door — the cross-cutting display/util seams. Deliberately NOT exported here (dev-only
// modules never ride a shared barrel): ./dev-tools (main.tsx lazy-mounts it), ./long-task-tracer
// (main.tsx dynamic-imports it).

export { cn } from "@orb/ui/lib";
export { busDupCheck, busInvalidate, busSubscribe, busUnsubscribe } from "./bus-devlog";
export type { ClientErrorPayload } from "./client-error-report";
export { buildClientErrorPayload } from "./client-error-report";
export type { RegistryContext } from "./create-registry-context";
export { createRegistryContext } from "./create-registry-context";
export { IS_DEV } from "./dev-flag";
export { downloadJson, downloadUrl, slugifyFilename } from "./download-json";
export type { AppErrorBoundaryProps } from "./error-boundary";
export { AppErrorBoundary } from "./error-boundary";
export {
  ASSISTANT_PREFILL_WARNING,
  DRAFT_UNLOCK_AFTER_SEND,
  IMAGE_GEN_NEEDS_CHAT,
  IMAGE_GEN_NEEDS_TEXT,
  NEEDS_ASSISTANT_REPLY,
  WAND_NEEDS_TEXT,
} from "./injection-copy";
export type { SeededBackground } from "./list-seeded-backgrounds";
export { listSeededBackgrounds, resolveSeededBackgroundUrl } from "./list-seeded-backgrounds";
export { logClock } from "./log-clock";
export type { MessageRenderContext } from "./message-render";
export { renderMessageForDisplay } from "./message-render";
export { MESSAGE_ROLE_ITEMS, MESSAGE_ROLE_LABELS } from "./message-role-labels";
export type { Notify } from "./notify";
export { bindNotify, notify } from "./notify";
export { perfMark, perfMeasure } from "./perf-marks";
export { isProbeMode } from "./probe-mode";
export type { ContributorRegistry, Registry } from "./registry";
export { createContributorRegistry, createRegistry } from "./registry";
export * from "./registry-contracts";
export { RenderProfiler } from "./render-profiler";
export { TEST_IDS, testId } from "./test-ids";
export type { ThemeColorFields } from "./theme-override-form";
export { assignThemeColorFields } from "./theme-override-form";
export { timeLib } from "./time";
export type { TrpcOpLogEntry } from "./trpc-devlog";
export { formatTrpcOp } from "./trpc-devlog";
export * from "./use-focus-on-mount";
export { withViewTransition } from "./view-transition";
export type { WeaveGlyphProps } from "./weave-glyph";
export { WeaveGlyph } from "./weave-glyph";
