// The Corpus rail section as ONE co-located definition (client-architecture-lockdown.md §6a): the Variant A
// workbench (D271) with Explore, Insights and Labels modes over one LIST / CONTENT / CONTEXT anatomy.
// `makeCorpusSection` is a factory because Insights and Labels are other features' surfaces: the door
// imports stats and tag and hands them in, so discovery imports neither (§6c).

import { Library } from "@orb/ui/icons";
import type { ContextTabDef, ContributorRegistry, CorpusContextState } from "#lib";
import { defineContextTabs } from "#lib";
import type { SectionDefinition } from "#state";
import { corpusSectionSelection, useCorpusMode } from "#state";
import { CorpusArchetypesTab } from "../components/corpus-archetypes-tab.tsx";
import { CorpusCompareTab } from "../components/corpus-compare-tab.tsx";
import { CorpusContextHeader } from "../components/corpus-context-header.tsx";
import { CorpusMapTab } from "../components/corpus-map-tab.tsx";
import { CorpusSimilarityTab } from "../components/corpus-similarity-tab.tsx";
import { CorpusVisualsTab } from "../components/corpus-visuals-tab.tsx";
import type { CorpusModes } from "../components/corpus-workspace.tsx";
import { CorpusWorkspaceContent, CorpusWorkspaceList, CorpusWorkspaceListHeader } from "../components/corpus-workspace.tsx";
import { CORPUS_SECTION_LABEL } from "./corpus-section-label.ts";
import { useCorpusSelectionTitle } from "./corpus-selection-title.ts";

/** What the door hands the factory: the two contributed modes, and their CONTEXT tabs as one registry. */
export interface CorpusSectionContributions extends CorpusModes {
  readonly contextTabs: ContributorRegistry<ContextTabDef<CorpusContextState>>;
}

/** Every tab, own or contributed, is gated on the active mode (a module-level named hook, §6b). */
function useCorpusContextState(): CorpusContextState {
  return { mode: useCorpusMode() };
}

/** Every mode's title hook runs on every render, so the hook order never depends on the mode. */
function useCorpusWorkspaceTitle(modes: CorpusModes): string | null {
  const mode = useCorpusMode();
  const titles = {
    explore: useCorpusSelectionTitle(mode === "explore"),
    insights: modes.insights.useSelectionTitle(mode === "insights"),
    labels: modes.labels.useSelectionTitle(mode === "labels"),
  };
  return titles[mode];
}

const isExplore = (state: CorpusContextState): boolean => state.mode === "explore";

export function makeCorpusSection(contributions: CorpusSectionContributions): SectionDefinition {
  const modes: CorpusModes = { insights: contributions.insights, labels: contributions.labels };
  return {
    id: "corpus",
    // D271: the phone bar is Home · Chats · Characters · You, and Corpus enters through the You sheet.
    rail: { label: CORPUS_SECTION_LABEL, icon: Library, group: "primary", mobile: "sheet" },
    panelDefaults: { list: "docked", context: "collapsed" },
    placeholder: {
      title: "Corpus",
      description: "Search, read, understand and label your whole library in one place.",
    },
    list: () => <CorpusWorkspaceList modes={modes} />,
    listHeader: () => <CorpusWorkspaceListHeader modes={modes} />,
    // The shell's "is a subject open?" and Back, answered for the ACTIVE mode, plus the per-mode phone landing.
    selection: corpusSectionSelection,
    useSelectionTitle: (): string | null => useCorpusWorkspaceTitle(modes),
    content: () => <CorpusWorkspaceContent modes={modes} />,
    context: defineContextTabs<CorpusContextState>({
      useContextState: useCorpusContextState,
      header: (state) => (state.mode === "explore" ? <CorpusContextHeader /> : modes[state.mode].contextHeader()),
      // Explore's five owner-wide analysis tabs, labelled `Whole corpus` in the band.
      tabs: [
        { id: "archetypes", label: "Archetypes", when: isExplore, body: () => <CorpusArchetypesTab /> },
        { id: "visuals", label: "Visuals", when: isExplore, body: () => <CorpusVisualsTab /> },
        { id: "map", label: "Map", when: isExplore, body: () => <CorpusMapTab /> },
        { id: "similarity", label: "Similarity", when: isExplore, body: () => <CorpusSimilarityTab /> },
        { id: "compare", label: "Compare", when: isExplore, body: () => <CorpusCompareTab /> },
      ],
      contributors: contributions.contextTabs,
    }),
  };
}
