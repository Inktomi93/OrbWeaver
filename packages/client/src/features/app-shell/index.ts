// app-shell front door (UI-Arch §2.1 — consumers enter a feature through its index). The route
// (home-page.tsx) composes <AppShell sections={…}> with the chat pane in the `chats` CONTENT slot —
// the ONE cross-boundary seam (route→feature is legal; the shell stays domain-agnostic).

// The mobile "You" bottom-sheet body (L6/J12). Shell-tier + domain-agnostic (only `#state` writers), so
// it lives in app-shell; the ROUTE composes it over the `you` modal slot (`modals={{ you }}`) — the same
// seam settings/theme use, keeping the modal-slots lib import-free of browser components (test:types
// boundary — see modal-slots.tsx).
export { YouSheet } from "./components/you-sheet";
export type { RailSectionEntry } from "./lib/rail-slots";
// RAIL_SECTIONS is the rail's section registry (id · label · icon · group). Exposed on the front door so
// the ROUTE can bridge it to the chat-feature ⌘K palette's "Go to" section (the §5.1 composition seam —
// user-facing section labels keep ONE home; the palette receives {id,label} as a prop, never re-homing it).
export { RAIL_SECTIONS } from "./lib/rail-slots";
export type { AppShellProps, SectionSlot } from "./surfaces/app-shell";
export { AppShell } from "./surfaces/app-shell";
