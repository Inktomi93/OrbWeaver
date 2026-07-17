// The Corpus rail section as ONE co-located definition (client-architecture-lockdown.md §6a) — the
// section's rail identity, panel defaults, placeholder copy, list, content, and CONTEXT model in one
// place. CONTEXT is minted via `defineContextTabs<void>` (§6b) — Corpus has no shared context state, so
// `useContextState` returns the `VOID_STATE` sentinel (always-present, unconditionally called). The
// composition root assembles this into the section registry (main.tsx); AppShell consumes it via
// `useSectionRegistry`.

import { Library } from "@orb/ui/icons";
import { defineContextTabs, VOID_STATE } from "#lib";
import type { SectionDefinition } from "#state";
import { CorpusListAnchor } from "../anchors/corpus-list-anchor";
import { CorpusArchetypesTab } from "../components/corpus-archetypes-tab";
import { CorpusCompareTab } from "../components/corpus-compare-tab";
import { CorpusContent } from "../components/corpus-content";
import { CorpusContextHeader } from "../components/corpus-context-header";
import { CorpusListHeader } from "../components/corpus-list-header";
import { CorpusMapTab } from "../components/corpus-map-tab";
import { CorpusSimilarityTab } from "../components/corpus-similarity-tab";
import { CorpusVisualsTab } from "../components/corpus-visuals-tab";
import { CorpusListSurface } from "../surfaces/corpus-list-surface";

export const corpusSection: SectionDefinition = {
  id: "corpus",
  rail: { label: "Corpus", icon: Library, group: "primary", mobile: "tab" },
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
  // The LIST chrome-band content (§4 N1/N2): "CORPUS" title + distilled count. No create action —
  // corpus is browse-shaped (§2), so the band carries title + count only (P2 trivially met).
  listHeader: () => <CorpusListHeader />,
  content: () => <CorpusContent />,
  // Five owner-scoped analytics tabs, always available: Archetypes / Visuals / Map / Similarity / Compare.
  context: defineContextTabs<void>({
    useContextState: () => VOID_STATE,
    // The CONTEXT-panel BAND identity (N4/P4) — the corpus subject + count. Owner-wide analytics, so the
    // band names the SECTION (not the dossier character the tabs never rescope to — see the component).
    header: () => <CorpusContextHeader />,
    tabs: [
      { id: "archetypes", label: "Archetypes", body: () => <CorpusArchetypesTab /> },
      { id: "visuals", label: "Visuals", body: () => <CorpusVisualsTab /> },
      { id: "map", label: "Map", body: () => <CorpusMapTab /> },
      { id: "similarity", label: "Similarity", body: () => <CorpusSimilarityTab /> },
      { id: "compare", label: "Compare", body: () => <CorpusCompareTab /> },
    ],
  }),
};
