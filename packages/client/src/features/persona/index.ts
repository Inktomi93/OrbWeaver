// persona/ front door (UI-Arch §2.1) — the ONLY entry into the persona slice (dep-cruiser
// client-feature-front-door). The Identity chrome widget (`personaChrome`)
// is registered at the main.tsx door; no feature imports this slice's internals, and this slice
// imports no other feature (cross-domain reads ride trpc.*).
//
// The Personas config GROUP is a `sections` skimmer: its three sections
// are the contributions below, assembled into the config-section registry at the door.

// `PersonaPanelRow` is front-door-exported so its CT (the side-eye item-13 stretched-overlay rework)
// drives it directly from a non-test story — the CharacterCardTile precedent.
export { FirstRunPersonaDialog } from "./anchors/first-run-persona-dialog.tsx";
export type { PersonaPanelRowProps } from "./components/persona-panel-row.tsx";
export { PersonaPanelRow } from "./components/persona-panel-row.tsx";
// The state the first-run gate stands down in; the /join landing waits for it (app-root).
export { useViewerCanSpeak } from "./hooks/use-viewer-can-speak.ts";
export { personaChrome } from "./lib/persona-chrome.tsx";
export { personaListSection } from "./lib/persona-list-section.tsx";
export { personaNotificationsSection } from "./lib/persona-notifications-section.tsx";
export { personaThisChatSection } from "./lib/persona-this-chat-section.tsx";
export { personasGroup } from "./lib/personas-group.tsx";
