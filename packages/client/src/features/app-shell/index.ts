// app-shell front door. AppShell consumes the section + chrome registries (runtime context values) — it
// stays domain-agnostic and gains no #features import. `ContextTabsPanel` is NOT exported here — only
// `SectionContextHost` (app-shell-internal) consumes it now (client-architecture-lockdown.md §6b).
// app-shell registers its OWN topbar.trail chrome (fullscreen + context toggle) through the same door as
// any other feature (shell-chrome-unification.md §A) — no self-privilege.

export { YouSheet } from "./components/you-sheet.tsx";
export type { ShellLayout } from "./hooks/use-shell-layout.ts";
export { useShellLayout } from "./hooks/use-shell-layout.ts";
// The four app-shell-owned appearance SECTIONS (SET-SEAMS stage 1): app-shell reads these knobs (the shell
// scope tokens, the content-width clamp, `data-elevation`/`data-reduced-motion`, the reading scope, the
// glass/texture effects, the painted background), and §6's rule is that a section is owned by its reader.
export { appearanceBackgroundSection } from "./lib/appearance-background-section.tsx";
export { appearanceEffectsSection } from "./lib/appearance-effects-section.tsx";
export { appearanceReadingSection } from "./lib/appearance-reading-section.tsx";
export { appearanceSizingSection } from "./lib/appearance-sizing-section.tsx";
export { contextToggleChrome } from "./lib/context-toggle-chrome.tsx";
export { fullscreenChrome } from "./lib/fullscreen-chrome.tsx";
export { youModal } from "./lib/you-modal.tsx";
export { AppShell } from "./surfaces/app-shell.tsx";
