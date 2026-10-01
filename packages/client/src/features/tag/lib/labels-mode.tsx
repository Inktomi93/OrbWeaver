// The Corpus Labels mode (D271): the tag library as its finder, the library facts and the autosaving tag
// editor as its CONTENT, and one CONTEXT tab. The door hands these to `makeCorpusSection`, so discovery never
// imports tag, and the Configuration workspace no longer carries a tag door.

import { Hash } from "@orb/ui/icons";
import type { ContextTabDef, CorpusContextState, CorpusModeContribution } from "#lib";
import { LabelsContent, LabelsContextHeader, LabelsContextTab, LabelsListHeader } from "../components/labels-panes.tsx";
import { LabelsListSurface } from "../surfaces/labels-list-surface.tsx";
import { useLabelsSelectionTitle } from "./labels-selection-title.ts";

export const labelsCorpusMode: CorpusModeContribution = {
  list: () => <LabelsListSurface />,
  listHeader: () => <LabelsListHeader />,
  content: () => <LabelsContent />,
  contextHeader: () => <LabelsContextHeader />,
  useSelectionTitle: useLabelsSelectionTitle,
};

/** The one Labels inspector: what a label is on the landing, the open tag's reach once one is open. */
export const labelsContextTabs: readonly ContextTabDef<CorpusContextState>[] = [
  { id: "label-reach", label: "Usage", icon: Hash, when: (state): boolean => state.mode === "labels", body: () => <LabelsContextTab /> },
];
