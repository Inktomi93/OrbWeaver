// app-shell front door. The route composes <AppShell sections={…}> with feature panes in the section
// slots — the one cross-boundary seam (route→feature is legal; the shell stays domain-agnostic).

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
export type { RailSectionEntry } from "./lib/rail-slots";
export { RAIL_SECTIONS } from "./lib/rail-slots";
export type { AppShellProps, SectionSlot } from "./surfaces/app-shell";
export { AppShell } from "./surfaces/app-shell";
