// Each Corpus mode retains its subject through the section selection seam.
// Explore stores complete artifact snapshots; Insights and Labels retain their own drills.

import type { CharacterId } from "@orb/kit/ids";
import type { CorpusDestination, CorpusMode } from "#lib";
import { CORPUS_MODES } from "#lib";
import { analyticsDrillSelection } from "./analytics-selection-store.ts";
import { getCorpusMode, subscribeCorpusMode, writeCorpusMode } from "./corpus-mode-store.ts";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";
import { labelDrillSelection } from "./label-selection-store.ts";
import { CORPUS_PHONE_LANDING } from "./panel-resolve.ts";
import type { SectionSelection } from "./section-registry.ts";
import { setOpenOverlayPanel, withContentSwap } from "./shell-store.ts";

const exploreSelection = createDrillSelectionStore<CorpusDestination>("corpus-selection");

/** Drill into a character's dossier (a search hit / browse row / neighbour click) — CONTENT swaps to it. */
export function selectCorpusCharacter(characterId: CharacterId): void {
  selectCorpusArtifact({ kind: "character", characterId });
}

export function selectCorpusArtifact(destination: CorpusDestination): void {
  withContentSwap(() => exploreSelection.selectFromList(destination));
}
export const useSelectedCorpusDestination = exploreSelection.usePrimaryId;
/** Clear the dossier selection (back to the corpus overview home). */
export function clearCorpusSelection(): void {
  withContentSwap(exploreSelection.clear);
}
/** Reactive: the currently-drilled corpus character id (`null` = the overview home). A primitive selector. */
export function useSelectedCorpusCharacterId(): CharacterId | null {
  const destination = exploreSelection.usePrimaryId();
  return destination?.kind === "character" || destination?.kind === "distill" ? destination.characterId : null;
}

const MODE_SELECTION: Readonly<Record<CorpusMode, SectionSelection>> = {
  explore: { ...exploreSelection.selection, clear: clearCorpusSelection },
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
