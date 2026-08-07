// The corpus-SELECTION store: which character the Corpus section has drilled into — the route reads it to
// render the character DOSSIER in CONTENT (else the corpus overview home). Separate from the Characters
// section's own selection by design (the Corpus navigator opens a dossier, never the Characters editor),
// remembered independently. A primary-only `createDrillSelectionStore` (UI-Arch §4.2; not persisted — a
// hard reload landing back on the corpus overview is fine).

import type { CharacterId } from "@orb/kit/ids";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";

const corpusSelection = createDrillSelectionStore<CharacterId>("corpus-selection");

/** Drill into a character's dossier (a search hit / browse row / neighbour click) — CONTENT swaps to it. */
export const selectCorpusCharacter = corpusSelection.select;
/** Clear the dossier selection (back to the corpus overview home). */
export const clearCorpusSelection = corpusSelection.clear;
/** Reactive: the currently-drilled corpus character id (`null` = the overview home). A primitive selector. */
export const useSelectedCorpusCharacterId = corpusSelection.usePrimaryId;
/** The section-registry SEAM (`SectionSelection`) — what the SHELL reads for the mobile ONE-SHELL rule. */
export const corpusSectionSelection = corpusSelection.selection;
