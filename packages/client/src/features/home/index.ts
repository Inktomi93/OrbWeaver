// home/ front door (UI-Arch §2.1) — the ONLY entry into the home slice (dep-cruiser
// client-feature-front-door). Home owns its SECTION (the factory the door calls with the `home-tiles`
// registry) plus the home-owned TILES: the section-jump grid (shell-derived content with no other owner)
// and the DORMANT doorways for features that are not in the tree yet (home-owned until the owning feature exists, because an empty `features/buddy/` dir is G23-RED). Since
// #834 those doorways are buddy PLUS the roadmap tuple (`lib/roadmap.ts`), which mirrors the FUTURE +
// PARTIAL rows of `docs/architecture/proposed/INDEX.md` under a disk-reading parity test.
//
// Every OTHER tile is exported by the feature that owns its data + intent; home imports none of them.
// (The automation dormant doorway was retired with B3 — its own contract said it stays "until B3", and
// automation now owns a live surface, so its home-owned placeholder is gone.)

export { buddyDormantTile } from "./lib/buddy-tile.tsx";
export { makeHomeSection } from "./lib/home-section.tsx";
export { orderHomeTiles } from "./lib/order-home-tiles.ts";
export { homeRoadmapTiles } from "./lib/roadmap.ts";
export { makeSectionJumpTile } from "./lib/section-jump-tile.tsx";
export type { HomeSurfaceProps } from "./surfaces/home-surface.tsx";
export { HomeSurface } from "./surfaces/home-surface.tsx";
