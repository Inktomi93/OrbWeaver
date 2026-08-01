// home/ front door (UI-Arch §2.1) — the ONLY entry into the home slice (dep-cruiser
// client-feature-front-door). Home owns its SECTION (the factory the door calls with the `home-tiles`
// registry) plus the home-owned TILES: the section-jump grid (shell-derived content with no other owner)
// and the DORMANT doorways for features that are not in the tree yet (home-section-spec §3.5, H8 —
// home-owned until the owning feature exists, because an empty `features/buddy/` dir is G23-RED).
//
// Every OTHER tile is exported by the feature that owns its data + intent; home imports none of them.

export { makeHomeSection } from "./lib/home-section";
export { orderHomeTiles } from "./lib/order-home-tiles";
export { sectionJumpTile } from "./lib/section-jump-tile";
export type { HomeSurfaceProps } from "./surfaces/home-surface";
export { HomeSurface } from "./surfaces/home-surface";
