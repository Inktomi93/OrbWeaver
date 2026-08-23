// The corpus COMPARE PAIR: which two characters the Corpus CONTEXT panel's Compare tab is diffing.
//
// WHY IT IS A STORE AND NOT `useState` (side-eye populated arm 2026-08-23, #554). The Similarity tab is a
// LIST OF PAIRS — 1,782 of them on the audited library — and every one of them was inert text: the tab's
// entire `--map` was two comboboxes, `clickablePairs: 0`. The one thing a reader wants from "Ayami ↔ Ayami
// · 100%" is to look at both, and the app already has the surface that does it one tab away. But the
// Compare tab held its pair in component state, so a sibling tab could not seed it, and the shell UNMOUNTS
// a CONTEXT tab body when you switch tabs — component state would be discarded at the exact moment the
// hand-off happens. A pair that two surfaces write and read is a store, by the same reasoning
// `corpus-search-store.ts` records for the omnibox.
//
// SESSION-SCOPED, NOT PERSISTED — `createGatedStore`, like `corpus-search-store`/`corpus-selection-store`.
// A tab switch or a rail bounce keeps the pair; a hard reload lands on the tab's own rest state, because a
// rehydrated comparison is a question the user asked yesterday.
//
// IT IS A PAIR, NOT A SELECTION. `createDrillSelectionStore` models "which ONE row is open" and the corpus
// already uses it for the dossier (`corpus-selection-store.ts`); two ordered slots with an empty rest state
// is a different shape, and pretending otherwise would put the dossier's `clear`/`usePrimaryId` vocabulary
// on something that has no primary. The ids are held as raw strings for the same reason the omnibox holds
// its target id as one: `state/` sits below the features and does not own the axis — the Compare tab casts
// at its own edge, which is where the ids are handed to a typed query.
//
// EACH SLOT CARRIES ITS NAME (issue #563). The pickers are Base UI Selects, which resolve the trigger's
// display text by finding the value in the `items` they were handed — and this tab's items are ONE page of
// `browseCharacters` (200 of 313 on the audited library). A pair seeded from the Similarity tab therefore
// landed as two raw ULIDs in the triggers ("character_01m0n6e2…") over a body that named the same two
// characters legibly one inch below: the same two entities named twice in one frame, once as database keys.
// Paging the picker would not fix it either — the seeded pair can always be off whatever page is loaded.
// The writer always HAS the name (a pair row renders it; a picker's own item carries it as its label), so
// the name travels with the id and the tab can name a selection it has never listed.

import { createGatedStore } from "./create-gated-store.ts";

interface CorpusCompareState {
  /** The FIRST slot's character id (`""` = unpicked). */
  readonly a: string;
  /** The FIRST slot's display name (`""` = unpicked / unknown — the id is then all the picker can say). */
  readonly aName: string;
  /** The SECOND slot's character id (`""` = unpicked). */
  readonly b: string;
  /** The SECOND slot's display name (`""` = unpicked / unknown). */
  readonly bName: string;
}

const EMPTY_PAIR: CorpusCompareState = { a: "", aName: "", b: "", bName: "" };

const useCorpusCompareStore = createGatedStore<CorpusCompareState>("corpus-compare", (): CorpusCompareState => EMPTY_PAIR);

/** Seed BOTH slots at once — a pair row's click on the Similarity tab, which has both ids AND both names in
 *  hand. Written as one transition so the Compare tab never renders a half-filled pair and fires a diff
 *  for it. */
export function compareCorpusPair(a: { readonly id: string; readonly name: string }, b: { readonly id: string; readonly name: string }): void {
  useCorpusCompareStore.setState({ a: a.id, aName: a.name, b: b.id, bName: b.name }, false, "corpus-compare/pair");
}

/** Write the FIRST slot (the tab's own picker, which knows the item's label). */
export function setCorpusCompareA(id: string, name: string): void {
  useCorpusCompareStore.setState({ a: id, aName: name }, false, "corpus-compare/a");
}

/** Write the SECOND slot (the tab's own picker, which knows the item's label). */
export function setCorpusCompareB(id: string, name: string): void {
  useCorpusCompareStore.setState({ b: id, bName: name }, false, "corpus-compare/b");
}

/** Reactive: the first slot's id (`""` = unpicked). A single-field primitive selector. */
export function useCorpusCompareA(): string {
  return useCorpusCompareStore((s) => s.a);
}

/** Reactive: the first slot's display name (`""` = unknown). */
export function useCorpusCompareAName(): string {
  return useCorpusCompareStore((s) => s.aName);
}

/** Reactive: the second slot's id (`""` = unpicked). A single-field primitive selector. */
export function useCorpusCompareB(): string {
  return useCorpusCompareStore((s) => s.b);
}

/** Reactive: the second slot's display name (`""` = unknown). */
export function useCorpusCompareBName(): string {
  return useCorpusCompareStore((s) => s.bName);
}
