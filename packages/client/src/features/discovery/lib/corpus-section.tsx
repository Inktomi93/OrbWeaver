// The Corpus rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — the
// section's rail identity, panel defaults, placeholder copy, list, content, and CONTEXT model in one
// place. A pure DATA object: no app-shell/auth hook (Corpus has no isMobile-branching intent). The
// composition root assembles this into the section registry (main.tsx); AppShell consumes it via
// `useSectionRegistry`. CONTEXT still rides the FLAG[lockdown-M3] bridge until M3.

import { Library } from "@orb/ui/icons";
import type { SectionDefinition } from "#state";
import { CorpusListAnchor } from "../anchors/corpus-list-anchor";
import { CorpusArchetypesTab } from "../components/corpus-archetypes-tab";
import { CorpusCompareTab } from "../components/corpus-compare-tab";
import { CorpusContent } from "../components/corpus-content";
import { CorpusMapTab } from "../components/corpus-map-tab";
import { CorpusSimilarityTab } from "../components/corpus-similarity-tab";
import { CorpusVisualsTab } from "../components/corpus-visuals-tab";
import { CorpusListSurface } from "../surfaces/corpus-list-surface";

export const corpusSection: SectionDefinition = {
  id: "corpus",
  rail: { label: "Corpus", icon: Library, group: "primary", mobilePrimary: true },
  panelDefaults: { list: "docked", context: "collapsed" },
  placeholder: {
    title: "Corpus",
    description: "Search across every thread, character, and scene — the web, searchable.",
  },
  list: () => (
    <CorpusListAnchor>
      <CorpusListSurface />
    </CorpusListAnchor>
  ),
  content: () => <CorpusContent />,
  // Five owner-scoped analytics tabs, always available: Archetypes / Visuals / Map / Similarity / Compare.
  context: {
    kind: "tabs",
    tabs: [
      { id: "archetypes", label: "Archetypes", body: () => <CorpusArchetypesTab /> },
      { id: "visuals", label: "Visuals", body: () => <CorpusVisualsTab /> },
      { id: "map", label: "Map", body: () => <CorpusMapTab /> },
      { id: "similarity", label: "Similarity", body: () => <CorpusSimilarityTab /> },
      { id: "compare", label: "Compare", body: () => <CorpusCompareTab /> },
    ],
  },
};
