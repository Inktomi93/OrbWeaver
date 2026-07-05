// character/ front door (UI-Arch §2.1) — the ONLY entry into the character slice (dep-cruiser
// client-feature-front-door). The library keystone: the containment anchor + the browse surface it
// wraps, plus the leaf card. The composition root (routes/home-page.tsx) mounts
// `<CharacterLibraryAnchor><CharacterLibrarySurface/></CharacterLibraryAnchor>` in the shell's
// `characters` LIST slot (UI-Arch §4.1: LIST = the section's collection + search + new), and the
// stub-free `CharacterLibraryWelcome` teaching empty-state in the CONTENT slot (no per-character
// detail surface exists yet — this is deliberately NOT a fabricated one).

export type { CharacterLibraryAnchorProps } from "./anchors/character-library-anchor";
export { CharacterLibraryAnchor } from "./anchors/character-library-anchor";
export type { CharacterCardItem, CharacterCardProps } from "./components/character-card";
export { CharacterCard } from "./components/character-card";
export type {
  CharacterDetailCardProps,
  CharacterDetailItem,
} from "./components/character-detail-card";
export { CharacterDetailCard } from "./components/character-detail-card";
export { CharacterLibraryWelcome } from "./components/character-library-welcome";
export type { CharacterDetailSurfaceProps } from "./surfaces/character-detail-surface";
export { CharacterDetailSurface } from "./surfaces/character-detail-surface";
export type { CharacterLibrarySurfaceProps } from "./surfaces/character-library-surface";
export { CharacterLibrarySurface } from "./surfaces/character-library-surface";
