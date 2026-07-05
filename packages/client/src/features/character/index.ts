// character/ front door (UI-Arch §2.1) — the ONLY entry into the character slice (dep-cruiser
// client-feature-front-door). The library keystone: the containment anchor + the browse surface it
// wraps, plus the leaf card. The composition root (routes/home-page.tsx) mounts
// `<CharacterLibraryAnchor><CharacterLibrarySurface/></CharacterLibraryAnchor>` in the shell's
// `characters` CONTENT slot.

export type { CharacterLibraryAnchorProps } from "./anchors/character-library-anchor";
export { CharacterLibraryAnchor } from "./anchors/character-library-anchor";
export type { CharacterCardItem, CharacterCardProps } from "./components/character-card";
export { CharacterCard } from "./components/character-card";
export type { CharacterLibrarySurfaceProps } from "./surfaces/character-library-surface";
export { CharacterLibrarySurface } from "./surfaces/character-library-surface";
