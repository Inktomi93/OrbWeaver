// discovery/ front door — the client feature for the DISCOVERY server domain, presented as the "Corpus"
// rail section (the folder mirrors the domain per the client-structure gate; the user-facing surfaces are
// named Corpus*). The section's three regions: the LIST navigator (search omnibox + catalog browse), the
// CONTENT overview / character dossier, and the CONTEXT analytics tabs (Archetypes / Visuals / Map /
// Similarity / Compare) — the route wires the CONTEXT tab bodies into the shell's ContextTabsPanel.

export type { CorpusListAnchorProps } from "./anchors/corpus-list-anchor.tsx";
export { CorpusListAnchor } from "./anchors/corpus-list-anchor.tsx";
export { CorpusArchetypesTab } from "./components/corpus-archetypes-tab.tsx";
export { CorpusCompareTab } from "./components/corpus-compare-tab.tsx";
export { CorpusContextHeader } from "./components/corpus-context-header.tsx";
export { CorpusListHeader } from "./components/corpus-list-header.tsx";
export { CorpusMapTab } from "./components/corpus-map-tab.tsx";
export { CorpusSimilarityTab } from "./components/corpus-similarity-tab.tsx";
export { CorpusVisualsTab } from "./components/corpus-visuals-tab.tsx";
export { corpusSection } from "./lib/corpus-section.tsx";
export type { CorpusDossierSurfaceProps } from "./surfaces/corpus-dossier-surface.tsx";
export { CorpusDossierSurface } from "./surfaces/corpus-dossier-surface.tsx";
export { CorpusHomeSurface } from "./surfaces/corpus-home-surface.tsx";
export { CorpusListSurface } from "./surfaces/corpus-list-surface.tsx";
