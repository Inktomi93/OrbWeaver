// The Corpus workspace's active mode (D271). Session-scoped like the corpus search and selection stores: a
// rail bounce keeps the mode, and a reload lands on Explore unless a retired section id heals into a mode.
// The user-facing switch is `setCorpusMode` in `corpus-selection-store.ts`; this file stays free of shell
// imports so `shell-store.ts` can heal a stored retired section through it without an import cycle.

import type { CorpusMode } from "#lib";
import { createGatedStore } from "./create-gated-store.ts";

interface CorpusModeState {
  readonly mode: CorpusMode;
}

const useCorpusModeStore = createGatedStore<CorpusModeState>("corpus-mode", (): CorpusModeState => ({ mode: "explore" }));

/** Retired rail sections whose workspace is now a Corpus mode — the mode half of `RETIRED_SECTION_HEAL`. */
const RETIRED_SECTION_CORPUS_MODE: Readonly<Record<string, CorpusMode>> = {
  analytics: "insights",
};

/** Write the mode with no shell side effect. Only the heal and `setCorpusMode` call this. */
export function writeCorpusMode(mode: CorpusMode): void {
  useCorpusModeStore.setState({ mode }, false, "corpus-mode/set");
}

/** Land a retired section id (a stored `activeSection` or a `/<segment>` deep link) on its Corpus mode. A
 *  live or unknown id is a no-op. */
export function healCorpusModeFrom(retiredId: string): void {
  const mode = RETIRED_SECTION_CORPUS_MODE[retiredId];
  if (mode !== undefined) {
    writeCorpusMode(mode);
  }
}

/** Reactive: the active Corpus mode. */
export function useCorpusMode(): CorpusMode {
  return useCorpusModeStore((s) => s.mode);
}

/** Non-reactive read, for the section's selection seam and the dev bridge. */
export function getCorpusMode(): CorpusMode {
  return useCorpusModeStore.getState().mode;
}

/** Subscribe to mode changes; returns the unsubscribe. */
export function subscribeCorpusMode(listener: () => void): () => void {
  return useCorpusModeStore.subscribe(listener);
}
