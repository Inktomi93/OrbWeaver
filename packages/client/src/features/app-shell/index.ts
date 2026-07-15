// app-shell front door. AppShell consumes the section registry (a runtime context value) — it stays
// domain-agnostic and gains no #features import. `ContextTabsPanel` is NOT exported here — only
// `SectionContextHost` (app-shell-internal) consumes it now (client-architecture-lockdown.md §6b).

export { YouSheet } from "./components/you-sheet";
export { useIsMobileViewport } from "./hooks/use-is-mobile-viewport";
export type { ShellLayout } from "./hooks/use-shell-layout";
export { useShellLayout } from "./hooks/use-shell-layout";
export { youModal } from "./lib/you-modal";
export type { AppShellProps } from "./surfaces/app-shell";
export { AppShell } from "./surfaces/app-shell";
