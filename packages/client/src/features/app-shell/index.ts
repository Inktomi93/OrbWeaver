// app-shell front door (UI-Arch §2.1 — consumers enter a feature through its index). The route
// (home-page.tsx) composes <AppShell sections={…}> with the chat pane in the `chats` CONTENT slot —
// the ONE cross-boundary seam (route→feature is legal; the shell stays domain-agnostic).
export type { AppShellProps, SectionSlot } from "./surfaces/app-shell";
export { AppShell } from "./surfaces/app-shell";
