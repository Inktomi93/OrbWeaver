// lib/ front door — the cross-cutting display/util seams (UI-Arch §2.1). One home each: time (the
// ONE Intl site), notify (the ONE toast seam), message-render (the ONE display pipeline),
// download-json (the ONE export-click helper), view-transition (the ONE hand-rolled VT wrapper),
// test-ids (the typed registry), dev-flag (the ONE dev/prod discriminant), log-clock + trpc-devlog
// (the [trpc] console channel — ships, its ERROR lines fire in prod), bus-devlog (the [bus] console
// channel — the SSE bus's peer to [trpc]; IS_DEV-gated, prod-inert), render-profiler (the [perf]
// commit half — prod-inert), probe-mode (the harness-determinism flag — ships, runtime-gated,
// features read it to freeze wall-clock-relative text under snap), error-boundary + client-error-report
// (PD-58: the app-level catch + its pure report-payload builder — both ship in prod; the tRPC wire call
// itself is wired at main.tsx, which is the one place already holding the client), list-seeded-
// backgrounds (D49 §3 — the bundled theme background-image catalog; both app-shell's render layer AND
// the settings theme-editor picker read it, so neither imports the other). `cn` re-exports from
// the ui seal so features import ONE lib module.
// DELIBERATELY NOT EXPORTED (dev-only modules never ride a shared barrel — the barrel-leak failure
// mode): ./dev-tools (main.tsx lazy-mounts it) · ./long-task-tracer (main.tsx dynamic-imports it).

export type { TimeLib, TimeLibConfig } from "@orb/kit/time";
export { createTimeLib } from "@orb/kit/time";
export { cn } from "@orb/ui/lib";
export { busDupCheck, busInvalidate, busSubscribe, busUnsubscribe } from "./bus-devlog";
export type { ClientErrorPayload } from "./client-error-report";
export { buildClientErrorPayload } from "./client-error-report";
export { IS_DEV } from "./dev-flag";
export { downloadJson, downloadUrl, slugifyFilename } from "./download-json";
export type { AppErrorBoundaryProps } from "./error-boundary";
export { AppErrorBoundary } from "./error-boundary";
export type { SeededBackground } from "./list-seeded-backgrounds";
export { listSeededBackgrounds, resolveSeededBackgroundUrl } from "./list-seeded-backgrounds";
export { logClock } from "./log-clock";
export type { MessageRenderContext } from "./message-render";
export { renderMessageForDisplay } from "./message-render";
export type { Notify } from "./notify";
export { bindNotify, notify } from "./notify";
export { isProbeMode } from "./probe-mode";
export { RenderProfiler } from "./render-profiler";
export type { TestIdKey } from "./test-ids";
export { TEST_IDS, testId } from "./test-ids";
export { timeLib } from "./time";
export type { TrpcOpLogEntry } from "./trpc-devlog";
export { formatTrpcOp } from "./trpc-devlog";
export * from "./use-focus-on-mount";
export { withViewTransition } from "./view-transition";
export type { WeaveGlyphProps } from "./weave-glyph";
export { WeaveGlyph } from "./weave-glyph";
