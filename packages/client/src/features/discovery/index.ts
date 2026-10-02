// discovery/ front door — the client feature for the DISCOVERY server domain, presented as the "Corpus"
// rail section (the folder mirrors the domain per the client-structure gate; the user-facing surfaces are
// named Corpus*). The section is the D271 workbench: discovery owns Explore (search omnibox + catalog browse,
// overview / dossier, the Whole corpus analysis tabs) and hosts the Insights and Labels modes the door hands
// `makeCorpusSection`.

export type { CorpusListAnchorProps } from "./anchors/corpus-list-anchor.tsx";
export { CorpusListAnchor } from "./anchors/corpus-list-anchor.tsx";
export { CorpusArchetypesTab } from "./components/corpus-archetypes-tab.tsx";
export { CorpusCompareTab } from "./components/corpus-compare-tab.tsx";
export { CorpusContent } from "./components/corpus-content.tsx";
export { CorpusContextHeader } from "./components/corpus-context-header.tsx";
export { CorpusMapTab } from "./components/corpus-map-tab.tsx";
export { CorpusSimilarityTab } from "./components/corpus-similarity-tab.tsx";
export { CorpusUnderstandingInvitation } from "./components/corpus-understanding-invitation.tsx";
export { CorpusVisualsTab } from "./components/corpus-visuals-tab.tsx";
export { useCorpusListHeader } from "./hooks/use-corpus-list-header.tsx";
export { corpusModePaletteSource } from "./lib/corpus-palette-source.ts";
export { makeCorpusSection } from "./lib/corpus-section.tsx";
export type { CorpusDossierSurfaceProps } from "./surfaces/corpus-dossier-surface.tsx";
export { CorpusDossierSurface } from "./surfaces/corpus-dossier-surface.tsx";
export { CorpusHomeSurface } from "./surfaces/corpus-home-surface.tsx";
export { CorpusListSurface } from "./surfaces/corpus-list-surface.tsx";
