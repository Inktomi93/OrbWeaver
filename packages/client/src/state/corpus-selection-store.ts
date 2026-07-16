// The corpus-SELECTION store: which character the Corpus section has drilled into — the route reads it
// to render the character DOSSIER in CONTENT (else the corpus overview home). Separate from the Characters
// section's own selection store by design: the Corpus navigator is its own per-section concern (a search
// hit or a browse row opens a dossier here, never the Characters editor), remembered independently.
// createGatedStore (not persisted): a hard reload landing back on the corpus overview is fine.

import type { CharacterId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store";

interface CorpusSelectionState {
  /** The character whose dossier the Corpus CONTENT shows — `null` = the corpus overview home. */
  readonly selectedCharacterId: CharacterId | null;
}

const useCorpusSelectionStore = createGatedStore<CorpusSelectionState>("corpus-selection", (): CorpusSelectionState => ({ selectedCharacterId: null }));

/** Drill into a character's dossier (a search hit / browse row / neighbour click) — CONTENT swaps to it. */
export function selectCorpusCharacter(id: CharacterId): void {
  useCorpusSelectionStore.setState({ selectedCharacterId: id }, false, "corpus-selection/select");
}

/** Clear the dossier selection (back to the corpus overview home). */
export function clearCorpusSelection(): void {
  useCorpusSelectionStore.setState({ selectedCharacterId: null }, false, "corpus-selection/clear");
}

/** Reactive: the currently-drilled corpus character id (`null` = the overview home). A primitive selector. */
export function useSelectedCorpusCharacterId(): CharacterId | null {
  return useCorpusSelectionStore((s) => s.selectedCharacterId);
}
