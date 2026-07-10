// character/ front door (UI-Arch §2.1) — the ONLY entry into the character slice (dep-cruiser
// client-feature-front-door). The library keystone: the containment anchor + the browse surface it
// wraps, plus the leaf card. The composition root (routes/home-page.tsx) mounts
// `<CharacterLibraryAnchor><CharacterLibrarySurface/></CharacterLibraryAnchor>` in the shell's
// `characters` LIST slot (UI-Arch §4.1: LIST = the section's collection + search + new), and the
// stub-free `CharacterLibraryWelcome` teaching empty-state in the CONTENT slot (no per-character
// detail surface exists yet — this is deliberately NOT a fabricated one).

export type { CharacterLibraryAnchorProps } from "./anchors/character-library-anchor";
export { CharacterLibraryAnchor } from "./anchors/character-library-anchor";
// Front-door-exported so its narrow-width CT (the ~337px Delete-clip regression) drives it directly.
export type { CharacterBulkBarProps } from "./components/character-bulk-bar";
export { CharacterBulkBar } from "./components/character-bulk-bar";
export type { CharacterCardItem, CharacterCardTileProps } from "./components/character-card";
export { CharacterCardTile } from "./components/character-card";
export type {
  CharacterDetailCardProps,
  CharacterDetailItem,
} from "./components/character-detail-card";
export { CharacterDetailCard } from "./components/character-detail-card";
export { CharacterLibraryWelcome } from "./components/character-library-welcome";
// The pure LIST view helpers (§4.3/§4.4/§4.5) — front-door-exported so their browser-free unit test drives
// them directly (the CharacterCardTile props precedent), never a deep import into the slice internals.
export type {
  FilterableRow,
  LibraryFilters,
  ResumableChat,
  RowTag,
  TagGroup,
} from "./lib/character-list-view";
export { filterByChips, groupByTag, resumeTargets } from "./lib/character-list-view";
export type { CharacterDetailSurfaceProps } from "./surfaces/character-detail-surface";
export { CharacterDetailSurface } from "./surfaces/character-detail-surface";
export type { CharacterLibrarySurfaceProps } from "./surfaces/character-library-surface";
export { CharacterLibrarySurface } from "./surfaces/character-library-surface";
