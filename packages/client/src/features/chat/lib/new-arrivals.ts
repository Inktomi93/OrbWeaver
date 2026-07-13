// New-arrival detection for the windowed chat transcript. Rows mount/unmount on every scroll, so
// arrival is decided in item space (id-keyed), never mount space, or scrollback would replay the enter
// transition. A key counts as new only when it's unseen, sits after the last previously-seen key (an
// append, never a history-page prepend), and isn't model output the ghost row already streamed in (both
// orderings occur live: canon can land while the ghost is still present, or after it leaves — the
// awaitingSettle latch covers the second case deterministically). Exit is deliberately not animated: a
// deleted message vanishes in the same render the mutation reconciles, so there's no unmount phase to
// attach a transition to.

export interface ArrivalDiff {
  readonly seen: ReadonlySet<string>;
  readonly fresh: ReadonlySet<string>;
  /** Armed when the ghost leaves the list; mutes the next model-output arrival(s). */
  readonly awaitingSettle: boolean;
}

export interface ArrivalEntry {
  readonly key: string;
  /** True for a committed assistant row whose content a live turn's ghost already streamed. */
  readonly modelOutput: boolean;
}

/** Stable identity so "no arrivals" never invalidates a memo. */
export const NO_ARRIVALS: ReadonlySet<string> = new Set();

/** The whole transcript is pre-seen on first render — opening a chat is navigation, not N arrivals. */
export function initialArrivals(keys: readonly string[]): ArrivalDiff {
  return { seen: new Set(keys), fresh: NO_ARRIVALS, awaitingSettle: false };
}

// The ghost key is ignored when finding the append boundary: it's a synthetic tail, so a message
// committed during a live turn lands before it — counting the ghost as "last seen" would misclassify
// that arrival as a backfill.
function appendedArrivals(
  seen: ReadonlySet<string>,
  keys: readonly string[],
  ghostKey: string,
): Set<string> {
  let lastSeenIndex = -1;
  for (const [index, key] of keys.entries()) {
    if (seen.has(key) && key !== ghostKey) {
      lastSeenIndex = index;
    }
  }
  const fresh = new Set<string>();
  for (const [index, key] of keys.entries()) {
    if (!seen.has(key) && index > lastSeenIndex) {
      fresh.add(key);
    }
  }
  return fresh;
}

/** Drops model-output arrivals from `fresh` in place; true when anything was muted. */
function muteModelOutputArrivals(
  fresh: Set<string>,
  entries: readonly ArrivalEntry[],
  ghostKey: string,
): boolean {
  let muted = false;
  for (const entry of entries) {
    if (entry.modelOutput && entry.key !== ghostKey && fresh.delete(entry.key)) {
      muted = true;
    }
  }
  return muted;
}

/** One diff step: the next tracking state, or null when nothing arrived/ended (caller keeps previous). */
export function nextArrivals(
  prev: ArrivalDiff,
  entries: readonly ArrivalEntry[],
  ghostKey: string,
): ArrivalDiff | null {
  const keys = entries.map((entry) => entry.key);
  const newKeys = keys.filter((key) => !prev.seen.has(key));
  const ghostPresent = keys.includes(ghostKey);
  const ghostEnded = !ghostPresent && prev.seen.has(ghostKey);
  if (newKeys.length === 0 && !ghostEnded) {
    return null;
  }
  const seen = new Set(prev.seen);
  for (const key of newKeys) {
    seen.add(key);
  }
  if (!ghostPresent) {
    // Forget the ghost key so the next turn's ghost counts as an arrival again.
    seen.delete(ghostKey);
  }
  const fresh = appendedArrivals(prev.seen, keys, ghostKey);
  const mutedModelOutput =
    ghostPresent || ghostEnded || prev.awaitingSettle
      ? muteModelOutputArrivals(fresh, entries, ghostKey)
      : false;
  // Arms when the ghost leaves without its canon row in the same diff; disarms once a model-output
  // arrival lands or a new turn's ghost enters.
  const awaitingSettle = ghostPresent
    ? false
    : (ghostEnded || prev.awaitingSettle) && !mutedModelOutput;
  return { seen, fresh: fresh.size === 0 ? NO_ARRIVALS : fresh, awaitingSettle };
}
