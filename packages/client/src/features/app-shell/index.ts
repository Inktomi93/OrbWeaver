// app-shell front door. AppShell consumes the section + chrome registries (runtime context values) — it
// stays domain-agnostic and gains no #features import. `ContextTabsPanel` is NOT exported here — only
// `SectionContextHost` (app-shell-internal) consumes it now (client-architecture-lockdown.md §6b).
// app-shell registers its OWN topbar.trail chrome (fullscreen + context toggle) through the same door as
// any other feature (shell-chrome-unification.md §A) — no self-privilege.

export { YouSheet } from "./components/you-sheet";
export { useIsMobileViewport } from "./hooks/use-is-mobile-viewport";
export type { ShellLayout } from "./hooks/use-shell-layout";
export { useShellLayout } from "./hooks/use-shell-layout";
export { contextToggleChrome } from "./lib/context-toggle-chrome";
export { fullscreenChrome } from "./lib/fullscreen-chrome";
export { youModal } from "./lib/you-modal";
export type { AppShellProps } from "./surfaces/app-shell";
export { AppShell } from "./surfaces/app-shell";
