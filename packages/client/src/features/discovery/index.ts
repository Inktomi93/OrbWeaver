// discovery/ front door — the client feature for the DISCOVERY server domain, presented as the "Corpus"
// rail section (the folder mirrors the domain per the client-structure gate; the user-facing surfaces are
// named Corpus*). The section is the D271 workbench: discovery owns Explore (search omnibox + catalog browse,
// overview / dossier, the Whole corpus analysis tabs) and hosts the Insights and Labels modes the door hands
// `makeCorpusSection`.
export {} from "./anchors/corpus-list-anchor.tsx";

export {} from "./components/corpus-archetypes-tab.tsx";
export {} from "./components/corpus-compare-tab.tsx";
export {} from "./components/corpus-content.tsx";
export {} from "./components/corpus-context-header.tsx";
export {} from "./components/corpus-map-tab.tsx";
export {} from "./components/corpus-similarity-tab.tsx";
export {} from "./components/corpus-understanding-invitation.tsx";
export {} from "./components/corpus-visuals-tab.tsx";
export {} from "./hooks/use-corpus-list-header.tsx";
export { corpusModePaletteSource } from "./lib/corpus-palette-source.ts";
export { makeCorpusSection } from "./lib/corpus-section.tsx";
export {} from "./surfaces/corpus-dossier-surface.tsx";
export {} from "./surfaces/corpus-home-surface.tsx";
export {} from "./surfaces/corpus-list-surface.tsx";
