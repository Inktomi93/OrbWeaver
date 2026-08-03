// persona/ front door (UI-Arch §2.1) — the ONLY entry into the persona slice (dep-cruiser
// client-feature-front-door). The Identity chrome widget (`personaChrome`, shell-chrome-unification.md
// §B) is registered at the main.tsx door; no feature imports this slice's internals, and this slice
// imports no other feature (cross-domain reads ride trpc.*).

// `PersonaPanelRow` is front-door-exported so its CT (the side-eye item-13 stretched-overlay rework)
// drives it directly from a non-test story — the CharacterCardTile precedent.
export { FirstRunPersonaDialog } from "./anchors/first-run-persona-dialog.tsx";
export type { PersonaPanelRowProps } from "./components/persona-panel-row.tsx";
export { PersonaPanelRow } from "./components/persona-panel-row.tsx";
export { personaChrome } from "./lib/persona-chrome.tsx";
export { personasPane } from "./lib/personas-pane.tsx";
