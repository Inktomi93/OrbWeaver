// app-shell front door. AppShell consumes the section registry (a runtime context value) — it stays
// domain-agnostic and gains no #features import. app-root feeds only the temporary FLAG[lockdown-M3]
// CONTEXT bridge (context body + header) until M3 consumes each section's ContextDefinition.

export type { ContextTabsPanelProps } from "./components/context-tabs-panel";
export { ContextTabsPanel } from "./components/context-tabs-panel";
export type { SectionPlaceholderProps } from "./components/section-placeholder";
export { SectionPlaceholder } from "./components/section-placeholder";
export { YouSheet } from "./components/you-sheet";
export { useIsMobileViewport } from "./hooks/use-is-mobile-viewport";
export type { ShellLayout } from "./hooks/use-shell-layout";
export { useShellLayout } from "./hooks/use-shell-layout";
export type { ContextTabEntry } from "./lib/context-slots";
export { CONTEXT_SLOTS } from "./lib/context-slots";
export type { AppShellProps } from "./surfaces/app-shell";
export { AppShell } from "./surfaces/app-shell";
