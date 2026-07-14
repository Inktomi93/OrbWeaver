// discovery/ front door — the client feature for the DISCOVERY server domain, presented as the "Corpus"
// rail section (the folder mirrors the domain per the client-structure gate; the user-facing surfaces are
// named Corpus*). The section's three regions: the LIST navigator (search omnibox + catalog browse), the
// CONTENT overview / character dossier, and the CONTEXT analytics tabs (Archetypes / Visuals / Map /
// Similarity / Compare) — the route wires the CONTEXT tab bodies into the shell's ContextTabsPanel.

export type { CorpusListAnchorProps } from "./anchors/corpus-list-anchor";
export { CorpusListAnchor } from "./anchors/corpus-list-anchor";
export { CorpusArchetypesTab } from "./components/corpus-archetypes-tab";
export { CorpusCompareTab } from "./components/corpus-compare-tab";
export { CorpusMapTab } from "./components/corpus-map-tab";
export { CorpusSimilarityTab } from "./components/corpus-similarity-tab";
export { CorpusVisualsTab } from "./components/corpus-visuals-tab";
export { corpusSection } from "./lib/corpus-section";
export type { CorpusDossierSurfaceProps } from "./surfaces/corpus-dossier-surface";
export { CorpusDossierSurface } from "./surfaces/corpus-dossier-surface";
export { CorpusHomeSurface } from "./surfaces/corpus-home-surface";
export { CorpusListSurface } from "./surfaces/corpus-list-surface";
