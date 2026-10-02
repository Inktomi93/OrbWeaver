// The Compare pair is a session-scoped store because Similarity writes it while Compare reads it, and the
// shell unmounts Context tab bodies during handoff (#554). A tab switch preserves the pair; a hard reload
// clears yesterday's question.
//
// Two ordered slots are not the dossier's one-row selection shape. State holds raw ids below the feature
// axis; Compare casts at its typed query boundary. Each slot also carries its display name because a seed
// can be outside the picker's loaded browseCharacters page; the writer already knows the name, and paging
// cannot guarantee inclusion (#563).

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
