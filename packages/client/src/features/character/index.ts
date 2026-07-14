// character/ front door — the only entry into the character slice. The library keystone: the containment
// anchor + the browse surface it wraps, plus the leaf card. CONTENT shows `CharacterEditorSurface` when a
// character is selected, else `CharacterLibraryWelcome`.

export type { CharacterLibraryAnchorProps } from "./anchors/character-library-anchor";
export { CharacterLibraryAnchor } from "./anchors/character-library-anchor";
export type { CharacterActionsMenuProps } from "./components/character-actions-menu";
export { CharacterActionsMenu } from "./components/character-actions-menu";
export type { CharacterAppearanceTabProps } from "./components/character-appearance-tab";
export { CharacterAppearanceTab } from "./components/character-appearance-tab";
export type { CharacterBulkBarProps } from "./components/character-bulk-bar";
export { CharacterBulkBar } from "./components/character-bulk-bar";
export type { CharacterCardItem, CharacterCardTileProps } from "./components/character-card";
export { CharacterCardTile } from "./components/character-card";
export type { CharacterFacetEditorProps } from "./components/character-facet-editor";
export { CharacterFacetEditor } from "./components/character-facet-editor";
export type { CharacterFacetInspectorProps } from "./components/character-facet-inspector";
export { CharacterFacetInspector } from "./components/character-facet-inspector";
export type { CharacterHeroBandProps, CharacterHeroDetail } from "./components/character-hero-band";
export { CharacterHeroBand } from "./components/character-hero-band";
export { CharacterLibraryWelcome } from "./components/character-library-welcome";
export type { CharacterOptionsTabProps } from "./components/character-options-tab";
export { CharacterOptionsTab } from "./components/character-options-tab";
export type { CharacterRelationsTabProps } from "./components/character-relations-tab";
export { CharacterRelationsTab } from "./components/character-relations-tab";
export type {
  FilterableRow,
  LibraryFilters,
  ResumableChat,
  RowTag,
  TagGroup,
} from "./lib/character-list-view";
export { filterByChips, groupByTag, resumeTargets } from "./lib/character-list-view";
export { charactersSection } from "./lib/characters-section";
export type { CharacterEditorSurfaceProps } from "./surfaces/character-editor-surface";
export { CharacterEditorSurface } from "./surfaces/character-editor-surface";
export type { CharacterLibrarySurfaceProps } from "./surfaces/character-library-surface";
export { CharacterLibrarySurface } from "./surfaces/character-library-surface";
