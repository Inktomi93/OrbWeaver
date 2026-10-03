// home/ front door (UI-Arch §2.1) — the ONLY entry into the home slice (dep-cruiser
// client-feature-front-door). Home owns its SECTION (the factory the door calls with the `home-tiles`
// registry) plus the one home-owned tile: the section-jump grid (shell-derived content with no other owner).
// Every OTHER tile is exported by the feature that owns its data + intent; home imports none of them.

export { makeHomeSection } from "./lib/home-section.tsx";
export { orderHomeTiles } from "./lib/order-home-tiles.ts";
export { makeSectionJumpTile } from "./lib/section-jump-tile.tsx";
export type { HomeSurfaceProps } from "./surfaces/home-surface.tsx";
export { HomeSurface } from "./surfaces/home-surface.tsx";
