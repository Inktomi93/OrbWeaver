// The Corpus workspace selection (D271): the Explore dossier drill, the mode switch, and the ONE section
// seam the shell reads. Each mode keeps its own drill store, so switching modes and back restores that
// mode's subject; the seam answers for whichever mode is active. Nothing here is persisted.

import type { CharacterId } from "@orb/kit/ids";
import type { CorpusMode } from "#lib";
import { CORPUS_MODES } from "#lib";
import { analyticsDrillSelection } from "./analytics-selection-store.ts";
import { getCorpusMode, subscribeCorpusMode, writeCorpusMode } from "./corpus-mode-store.ts";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";
import { labelDrillSelection } from "./label-selection-store.ts";
import { CORPUS_PHONE_LANDING } from "./panel-resolve.ts";
import type { SectionSelection } from "./section-registry.ts";
import { setOpenOverlayPanel, withContentSwap } from "./shell-store.ts";

const exploreSelection = createDrillSelectionStore<CharacterId>("corpus-selection");

/** Drill into a character's dossier (a search hit / browse row / neighbour click) — CONTENT swaps to it. */
export const selectCorpusCharacter = exploreSelection.select;
/** Clear the dossier selection (back to the corpus overview home). */
export const clearCorpusSelection = exploreSelection.clear;
/** Reactive: the currently-drilled corpus character id (`null` = the overview home). A primitive selector. */
export const useSelectedCorpusCharacterId = exploreSelection.usePrimaryId;

const MODE_SELECTION: Readonly<Record<CorpusMode, SectionSelection>> = {
  explore: exploreSelection.selection,
  insights: analyticsDrillSelection,
  labels: labelDrillSelection,
};

/** Switch the Corpus mode — the mode switch, ⌘K and `__orb.nav` all land here. It swaps CONTENT, so it
 *  rides the content-swap door, and it releases any slide-over request so the new mode's own phone landing
 *  applies instead of the last mode's. */
export function setCorpusMode(mode: CorpusMode): void {
  withContentSwap(() => {
    writeCorpusMode(mode);
    setOpenOverlayPanel(null);
  });
}

/** The section-registry SEAM (`SectionSelection`): "is a subject open?", Back, and the phone landing, all
 *  for the ACTIVE mode. One subscription covers the mode and every mode's drill. */
export const corpusSectionSelection: SectionSelection = {
  subscribe: (onStoreChange: () => void): (() => void) => {
    const unsubscribers = [subscribeCorpusMode(onStoreChange), ...CORPUS_MODES.map((mode) => MODE_SELECTION[mode].subscribe(onStoreChange))];
    return (): void => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  },
  hasSelection: (): boolean => MODE_SELECTION[getCorpusMode()].hasSelection(),
  clear: (): void => MODE_SELECTION[getCorpusMode()].clear(),
  phoneLanding: () => CORPUS_PHONE_LANDING[getCorpusMode()],
};
