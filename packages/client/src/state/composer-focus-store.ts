// The composer FOCUS-REQUEST store (D70 client commons) — a room-scoped focus signal, sibling to the
// composer-draft store. A non-composer surface (a CYOA choice click in `compose` mode) needs to focus the
// room's composer textarea, but the composer lives DOWN a sibling branch of the room tree (the choice-send
// provider wraps the thread; the composer is a later sibling), so there is no ref to hand across. The
// signal is a per-scope monotonically-increasing NONCE: a caller bumps it (`requestComposerFocus`), the
// composer subscribes to its scope's nonce and focuses its textarea on every change. Keyed by the same
// stable per-room SCOPE KEY as the draft store (a committed `ChatId` or a draft `draftKey`); an unseen
// scope reads 0 (no focus ever requested). Ephemeral, never persisted.

import { createGatedStore } from "./create-gated-store.ts";

interface ComposerFocusState {
  /** Per-room focus nonce (`scopeKey → count`); an absent scope reads 0. Each bump is one focus request. */
  readonly nonces: Readonly<Record<string, number>>;
}

const useComposerFocusStore = createGatedStore<ComposerFocusState>("composer-focus", (): ComposerFocusState => ({ nonces: {} }));

/** Request focus on a room's composer textarea (bumps the scope's nonce; the composer focuses on change). */
export function requestComposerFocus(scopeKey: string): void {
  const { nonces } = useComposerFocusStore.getState();
  useComposerFocusStore.setState({ nonces: { ...nonces, [scopeKey]: (nonces[scopeKey] ?? 0) + 1 } }, false, "composerFocus/request");
}

/** Reactive: a room's current focus nonce (0 when none requested). A change is the composer's focus cue. */
export function useComposerFocusRequest(scopeKey: string): number {
  return useComposerFocusStore((s) => s.nonces[scopeKey] ?? 0);
}
