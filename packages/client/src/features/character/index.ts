// character/ front door (UI-Arch §2.1) — the ONLY entry into the character slice (dep-cruiser
// client-feature-front-door). The library keystone: the containment anchor + the browse surface it
// wraps, plus the leaf card. The composition root (routes/home-page.tsx) mounts
// `<CharacterLibraryAnchor><CharacterLibrarySurface/></CharacterLibraryAnchor>` in the shell's
// `characters` LIST slot (UI-Arch §4.1: LIST = the section's collection + search + new). CONTENT shows the
// §6 `CharacterEditorSurface` when a character is selected, else the `CharacterLibraryWelcome` §5 teaching
// hero (the create/import next step — never a dead end).

export type { CharacterLibraryAnchorProps } from "./anchors/character-library-anchor";
export { CharacterLibraryAnchor } from "./anchors/character-library-anchor";
// The CONTEXT surfaces — the ROUTE composes these into the `characters` context via the CONTEXT_SLOTS
// registry (`<ContextTabsPanel>` bodies + the Actions menu slot; home-page.tsx). No feature→feature import.
// The character-editor redesign's 3 CONTEXT tabs: Field = `CharacterFacetInspector`; Links =
// `CharacterRelationsTab` (books + personas); Options = `CharacterOptionsTab` (appearance + history).
export type { CharacterActionsMenuProps } from "./components/character-actions-menu";
export { CharacterActionsMenu } from "./components/character-actions-menu";
// Front-door-exported so the §8.1 theme-cluster CT (`CharacterAppearanceTabStory`) drives it directly.
export type { CharacterAppearanceTabProps } from "./components/character-appearance-tab";
export { CharacterAppearanceTab } from "./components/character-appearance-tab";
// Front-door-exported so its narrow-width CT (the ~337px Delete-clip regression) drives it directly.
export type { CharacterBulkBarProps } from "./components/character-bulk-bar";
export { CharacterBulkBar } from "./components/character-bulk-bar";
export type { CharacterCardItem, CharacterCardTileProps } from "./components/character-card";
export { CharacterCardTile } from "./components/character-card";
// The CONTENT drill-in — front-door-exported so the editor CT drives a facet body directly.
export type { CharacterFacetEditorProps } from "./components/character-facet-editor";
export { CharacterFacetEditor } from "./components/character-facet-editor";
export type { CharacterFacetInspectorProps } from "./components/character-facet-inspector";
export { CharacterFacetInspector } from "./components/character-facet-inspector";
// §6.1 hero band — front-door-exported so its geometry/a11y CT drives it directly.
export type { CharacterHeroBandProps, CharacterHeroDetail } from "./components/character-hero-band";
export { CharacterHeroBand } from "./components/character-hero-band";
export { CharacterLibraryWelcome } from "./components/character-library-welcome";
export type { CharacterOptionsTabProps } from "./components/character-options-tab";
export { CharacterOptionsTab } from "./components/character-options-tab";
export type { CharacterRelationsTabProps } from "./components/character-relations-tab";
export { CharacterRelationsTab } from "./components/character-relations-tab";
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
export type { CharacterEditorSurfaceProps } from "./surfaces/character-editor-surface";
export { CharacterEditorSurface } from "./surfaces/character-editor-surface";
export type { CharacterLibrarySurfaceProps } from "./surfaces/character-library-surface";
export { CharacterLibrarySurface } from "./surfaces/character-library-surface";
