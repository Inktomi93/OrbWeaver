// New-arrival detection for the chat transcript (motion guide §4.2 item 1, adapted for the
// virtualizer) — the PURE diff `useNewArrivalKeys` (hooks/use-message-items.ts) drives.
//
// The message list is WINDOWED (`@orb/ui/message-list`): rows mount/unmount every time the reader
// scrolls, so a mount-keyed enter animation (the guide's plain-`.map()` sketch) would replay on every
// scrollback — the exact "seen 100+ times daily" surface the guide's own §3.8 litmus says not to
// animate. Arrival is therefore decided in ITEM space (id-keyed, here), never in mount space (the
// row component). A key is a "new arrival" — worth an enter transition — only when ALL hold:
//   • it wasn't in the previous render's item list (`seen`);
//   • it sits AFTER the last previously-seen key (an append; a prepended history page must not
//     cascade enter transitions, even though no cursor pagination exists on listMessages today);
//   • it is NOT model output landing around a live turn: the ghost row already SHOWED that content
//     streaming in, so the committed assistant row must swap in with zero pop-in
//     (ghost-message-row.tsx header). Live-verified 2026-07-12, BOTH orderings occur: the canon row
//     can land while the ghost is still in the list (refetch beats the phase flip), or a
//     refetch-roundtrip AFTER the ghost left. So the rule is a deterministic latch, not a timing
//     window: a `modelOutput` key arriving while the ghost is present is muted, and when the ghost
//     leaves, `awaitingSettle` arms and mutes the NEXT model-output arrival(s), then disarms. (A
//     user's own send during a live turn still animates — it's genuinely new.)
// The ghost key itself IS an arrival (the turn starting is genuinely new content); it's dropped from
// `seen` once the turn ends so the next turn's ghost animates again.
//
// EXIT is deliberately NOT animated (the query-boundary.tsx:7-11 honesty bar — decided against, not
// forgotten). Rows are derived from canon: a deleted message vanishes from `items` in the same render
// the mutation reconciles, so there is no unmount phase to attach a transition to, and the seal's
// `keepMounted` can't help — it pins items still IN the list, not items that no longer exist. Faking
// it would need a tombstone (hold the deleted MessageView in surface state ~220ms and render a
// phantom row), a second source of truth over canon racing the bus reconcile. And even then the
// honest visual is a HEIGHT collapse — the rows below shift up by layout, which the compositor-only
// rule (guide §3.7) forbids animating — so the best achievable is fade-then-snap, worse than a clean
// cut. Deletion already closes its causality loop through the confirm dialog's own exit motion
// (message-actions-row.tsx). If a real presence primitive ever lands (guide §4.2's 3+ threshold),
// revisit; don't hand-roll it here.

export interface ArrivalDiff {
  /** Every item key already rendered for this chat (arrival = absent from here). */
  readonly seen: ReadonlySet<string>;
  /** The keys that arrived THIS diff — the only rows that get an enter transition. */
  readonly fresh: ReadonlySet<string>;
  /** Armed when the ghost leaves the list; mutes the next model-output arrival(s) — the settled
   *  turn's canon row, which can land a refetch-roundtrip AFTER the ghost is gone (header). */
  readonly awaitingSettle: boolean;
}

/** One item's arrival-relevant shape (derived from the surface's row items). */
export interface ArrivalEntry {
  readonly key: string;
  /** True for a committed assistant row — the content a live turn's ghost already streamed. Muted
   *  when it arrives around a live turn (see the header). The ghost's own key is exempt. */
  readonly modelOutput: boolean;
}

/** The shared empty set — stable identity so "no arrivals" never invalidates a memo. */
export const NO_ARRIVALS: ReadonlySet<string> = new Set();

/** The first render for a chat: the whole transcript is pre-seen — opening a chat is navigation
 *  (the view-transition owns that), not N simultaneous arrivals. */
export function initialArrivals(keys: readonly string[]): ArrivalDiff {
  return { seen: new Set(keys), fresh: NO_ARRIVALS, awaitingSettle: false };
}

/** Appended-only arrivals: new keys sitting AFTER the last previously-seen key. A new key before it
 *  is a prepend/backfill, never an enter transition. (An all-new list — the empty-chat first
 *  message — has no seen key, so everything appended counts.) The GHOST key is ignored when finding
 *  the append boundary: the ghost is a synthetic TAIL, so a message committed while a turn is live
 *  (the just-sent user message — live-verified 2026-07-12) lands BEFORE it in the list; counting the
 *  ghost as "last seen" would misclassify every such arrival as a backfill and mute it. */
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

/** Drops model-output arrivals from `fresh` (in place); true when anything was actually muted —
 *  the signal that the ended turn's canon row has landed (`awaitingSettle` disarms). */
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

/**
 * One diff step: the next tracking state for the current items, or `null` when nothing
 * arrived/ended (the caller keeps its previous state — no churn on ordinary re-renders).
 * `ghostKey` is the streaming ghost's synthetic item key (see the header for its three special
 * behaviors: re-arming on unmount, never being the append boundary, and muting `modelOutput`
 * arrivals around a live turn).
 */
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
    // The turn ended — forget the ghost key so the NEXT turn's ghost counts as an arrival again.
    seen.delete(ghostKey);
  }
  const fresh = appendedArrivals(prev.seen, keys, ghostKey);
  // The ghost→committed zero-pop contract (header): model output arriving while the turn's ghost is
  // in the list — or any time until the ended turn's canon row has landed (`awaitingSettle`) — is
  // content the reader already watched stream, never fresh.
  const mutedModelOutput =
    ghostPresent || ghostEnded || prev.awaitingSettle
      ? muteModelOutputArrivals(fresh, entries, ghostKey)
      : false;
  // The latch: arms when the ghost leaves without its canon row in the same diff; disarms once a
  // model-output arrival lands (the settle) or a new turn's ghost enters (the old settle is moot —
  // a cancelled turn commits nothing, and the present-ghost rule covers the new turn's own commit).
  const awaitingSettle = ghostPresent
    ? false
    : (ghostEnded || prev.awaitingSettle) && !mutedModelOutput;
  return { seen, fresh: fresh.size === 0 ? NO_ARRIVALS : fresh, awaitingSettle };
}
