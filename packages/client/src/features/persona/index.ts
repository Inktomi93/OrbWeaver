// persona/ front door (UI-Arch §2.1) — the ONLY entry into the persona slice (dep-cruiser
// client-feature-front-door). ONE route-composed surface: the rail-foot account + persona panel,
// injected into the app-shell rail-foot slot (home-page.tsx). A prop-free @container consumer; no
// feature imports this slice's internals, and this slice imports no other feature (cross-domain reads
// ride trpc.*).

// `PersonaPanelRow` is front-door-exported so its CT (the side-eye item-13 stretched-overlay rework)
// drives it directly from a non-test story — the CharacterCardTile precedent.
export { FirstRunPersonaDialog } from "./anchors/first-run-persona-dialog";
export type { PersonaPanelRowProps } from "./components/persona-panel-row";
export { PersonaPanelRow } from "./components/persona-panel-row";
export { personasPane } from "./lib/personas-pane";
export { PersonaPanelSurface } from "./surfaces/persona-panel-surface";
