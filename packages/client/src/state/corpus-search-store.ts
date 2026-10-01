// The corpus OMNIBOX store: what the Corpus LIST pane is searching — the query text and the active target
// axis id. A sibling of `corpus-selection-store.ts` (which owns the drilled dossier), split out because a
// search is not a selection and the drill store is minted by the sealed `createDrillSelectionStore` factory
// (G27 `selection-store-via-factory`: a `*-selection-store.ts` may not call `createGatedStore` itself).
//
// WHY IT IS A STORE AND NOT `useState` (side-eye corpus re-pass 2026-08-19, U1). The omnibox held both
// values in component state on `CorpusListSurface`, which the shell UNMOUNTS on a rail switch — so
// searching "forest" in Memories, opening a hit's room, and coming back to Corpus landed on an empty box
// with the target reset to Characters, while the DOSSIER selection beside it survived the identical bounce
// because it is a store. UI-Architecture-and-Layout.md §"per-section selection is REMEMBERED" says the
// section restores exactly; the retrieval is the best thing on this surface and the pane was throwing it
// away between every result.
//
// SESSION-SCOPED, NOT PERSISTED — `createGatedStore`, like `chat-list-filter-store`/`corpus-selection-store`.
// A rail bounce restores the search; a hard RELOAD lands on the rest state. A query is a moment's intent,
// and rehydrating yesterday's words into a box that then re-runs an embedding search on mount would be a
// stale question asked in the user's name.

import { createGatedStore } from "./create-gated-store.ts";

interface CorpusSearchState {
  readonly scrollTop: number;
  /** The omnibox text (`""` = the rest state). */
  readonly query: string;
  /** The active target axis id. `""` = "whatever the axis calls its default" — the feature's own
   *  `resolveSearchTarget` maps an unknown/absent id to the first target, so the default lives in the ONE
   *  place that owns the axis instead of being re-spelled here (state cannot import a feature lib). */
  readonly targetId: string;
}

const useCorpusSearchStore = createGatedStore<CorpusSearchState>("corpus-search", (): CorpusSearchState => ({ query: "", targetId: "", scrollTop: 0 }));

/** Write the omnibox text (every keystroke / a picked suggestion). */
export function setCorpusSearchQuery(query: string): void {
  useCorpusSearchStore.setState({ query, scrollTop: 0 }, false, "corpus-search/query");
}

/** Write the active target axis id (a target-picker click). */
export function setCorpusSearchTarget(targetId: string): void {
  useCorpusSearchStore.setState({ targetId, scrollTop: 0 }, false, "corpus-search/target");
}

/** Reactive: the omnibox text (`""` = the rest state). A single-field primitive selector. */
export function useCorpusSearchQuery(): string {
  return useCorpusSearchStore((s) => s.query);
}

/** Reactive: the raw active target id — resolve it through the feature's `resolveSearchTarget`, which owns
 *  the axis and its default. A single-field primitive selector. */
export function useCorpusSearchTargetId(): string {
  return useCorpusSearchStore((s) => s.targetId);
}

export function readCorpusResultScroll(): number {
  return useCorpusSearchStore.getState().scrollTop;
}
export function setCorpusResultScroll(scrollTop: number): void {
  useCorpusSearchStore.setState({ scrollTop }, false, "corpus-search/scroll");
}
