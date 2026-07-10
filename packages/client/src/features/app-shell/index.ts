// app-shell front door (UI-Arch §2.1 — consumers enter a feature through its index). The route
// (home-page.tsx) composes <AppShell sections={…}> with the chat pane in the `chats` CONTENT slot —
// the ONE cross-boundary seam (route→feature is legal; the shell stays domain-agnostic).

// The CONTEXT_SLOTS registry + its generic renderer (UI-Arch §4.1). The ROUTE reads the registry-driven
// tab strip and injects the per-tab bodies (FINAL-Character §7 — the founding consumer); the shell stays
// domain-agnostic (it forwards ReactNode slots, never importing a feature — the modals seam).
export type { ContextTabsPanelProps } from "./components/context-tabs-panel";
export { ContextTabsPanel } from "./components/context-tabs-panel";
// The mobile "You" bottom-sheet body (L6/J12). Shell-tier + domain-agnostic (only `#state` writers), so
// it lives in app-shell; the ROUTE composes it over the `you` modal slot (`modals={{ you }}`) — the same
// seam settings/theme use, keeping the modal-slots lib import-free of browser components (test:types
// boundary — see modal-slots.tsx).
export { YouSheet } from "./components/you-sheet";
// useShellLayout — the resolved shell view-model (active section · RESOLVED panel modes · immersive).
// Exposed for the ROUTE (the composition root) to lay CONTENT out against the panels — e.g. the Chats
// landing drops its "Recent chats" when the LIST is docked (already the recents finder, §4.3 rule 5). A
// FEATURE still cannot import it (dep-cruiser client-features-no-cross); only routes + app-shell may.
export type { ShellLayout } from "./hooks/use-shell-layout";
export { useShellLayout } from "./hooks/use-shell-layout";
// The CONTEXT_SLOTS registry data (per-section context tab strip) — exposed so the ROUTE can read the
// entry order/labels when composing bodies; a FEATURE cannot import it (dep-cruiser), only routes.
export type { ContextTabEntry } from "./lib/context-slots";
export { CONTEXT_SLOTS } from "./lib/context-slots";
export type { RailSectionEntry } from "./lib/rail-slots";
// RAIL_SECTIONS is the rail's section registry (id · label · icon · group). Exposed on the front door so
// the ROUTE can bridge it to the chat-feature ⌘K palette's "Go to" section (the §5.1 composition seam —
// user-facing section labels keep ONE home; the palette receives {id,label} as a prop, never re-homing it).
export { RAIL_SECTIONS } from "./lib/rail-slots";
export type { AppShellProps, SectionSlot } from "./surfaces/app-shell";
export { AppShell } from "./surfaces/app-shell";
