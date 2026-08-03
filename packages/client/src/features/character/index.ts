// character/ front door — the only entry into the character slice. The library keystone: the containment
// anchor + the browse surface it wraps, plus the leaf card. CONTENT shows `CharacterEditorSurface` when a
// character is selected, else `CharacterLibraryWelcome`.

export type { CharacterLibraryAnchorProps } from "./anchors/character-library-anchor.tsx";
export { CharacterLibraryAnchor } from "./anchors/character-library-anchor.tsx";
export type { CharacterActionsMenuProps } from "./components/character-actions-menu.tsx";
export { CharacterActionsMenu } from "./components/character-actions-menu.tsx";
export type { CharacterAppearanceTabProps } from "./components/character-appearance-tab.tsx";
export { CharacterAppearanceTab } from "./components/character-appearance-tab.tsx";
export type { CharacterBulkBarProps } from "./components/character-bulk-bar.tsx";
export { CharacterBulkBar } from "./components/character-bulk-bar.tsx";
export type { CharacterCardItem, CharacterCardTileProps } from "./components/character-card.tsx";
export { CharacterCardTile } from "./components/character-card.tsx";
export type { CharacterFacetEditorProps } from "./components/character-facet-editor.tsx";
export { CharacterFacetEditor } from "./components/character-facet-editor.tsx";
export type { CharacterFacetInspectorProps } from "./components/character-facet-inspector.tsx";
export { CharacterFacetInspector } from "./components/character-facet-inspector.tsx";
export type { CharacterHeroBandProps, CharacterHeroDetail } from "./components/character-hero-band.tsx";
export { CharacterHeroBand } from "./components/character-hero-band.tsx";
export { CharacterLibraryWelcome } from "./components/character-library-welcome.tsx";
export type { CharacterOptionsTabProps } from "./components/character-options-tab.tsx";
export { CharacterOptionsTab } from "./components/character-options-tab.tsx";
export type { CharacterRelationsTabProps } from "./components/character-relations-tab.tsx";
export { CharacterRelationsTab } from "./components/character-relations-tab.tsx";
export type {
  FilterableRow,
  LibraryFilters,
  ResumableChat,
  RowTag,
  TagGroup,
} from "./lib/character-list-view.ts";
export { filterByChips, groupByTag, resumeTargets } from "./lib/character-list-view.ts";
export { characterSlashCommands } from "./lib/character-slash-commands.ts";
export { makeCharactersSection } from "./lib/characters-section.tsx";
export { librarySettingsSection } from "./lib/library-settings-section.tsx";
export type { CharacterEditorSurfaceProps } from "./surfaces/character-editor-surface.tsx";
export { CharacterEditorSurface } from "./surfaces/character-editor-surface.tsx";
export type { CharacterLibrarySurfaceProps } from "./surfaces/character-library-surface.tsx";
export { CharacterLibrarySurface } from "./surfaces/character-library-surface.tsx";
