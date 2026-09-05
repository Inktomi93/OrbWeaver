// domain/rpg/substrate/hidden-spans — THE HIDDEN-SPAN BELT AS A PROPERTY OF A PAYLOAD, not a field list.
// Zero-I/O, principal-free, one home for the walk (`substrate/` is the domain's pure slot; the CALLERS own
// their authority gate, this owns only the transform).
//
// WHY IT IS A WALK. `<lie …/>`/`<ofilter …/>` spans are GM-plane secrets (parity-plus §3.6): the host reads
// canon verbatim through the reveal eye, every other present role reads the stripped bytes. rpg's free text
// is spread across a dozen JSON planes that grow — ambient `location`, an actor's mood/thoughts/status and
// every inventory item's name/description, quest name/description/objectives, the plot rail, a journal
// title/content, a checkpoint label — so a per-field strip list is the wrong shape at a trust boundary: the
// NEXT free-text field defaults to LEAKED. Walking the values means a new column, or a new field inside an
// existing JSON plane, inherits the belt the day it lands.
//
// SCOPE, stated so it can be checked: VALUES ONLY — object KEYS are never rewritten (`fieldLocks` is a
// path-keyed record whose keys are ADDRESSES, and a mangled path would silently unlock a hand-locked field).
// Non-strings pass through untouched, and `stripHiddenSpans` is identity for a string carrying no span, so
// ids, enum tokens and numbers are unchanged by construction.
//
// TWO CALLER CLASSES, both threading the verdict as DATA (D106-F1 — a consumer never re-derives
// `role === "host"`):
//   • the member-facing READS (`getTrackerView`, `listJournal`, `listCheckpoints`), which pass the
//     `readsHidden` half of chat's ONE `resolveViewerVisibility` verdict;
//   • the member→host FORK (`chat-ops/fork-game.ts`, #1398), which passes the forker's source-room posture.
// The read side is the SOURCE of the bytes and the fork is the SINK; before #1528 only the sink was belted,
// so the same human read the secret in the panel a moment before the fork carefully refused to copy it.

import { stripHiddenSpans } from "@orb/kit/content";

/** Every string reachable in `value`, at any depth, with its hidden spans removed. Returns a fresh structure;
 *  the input is never mutated (a cloned row's values and a live snapshot read both rely on that). */
export function stripHiddenDeep<T>(value: T): T {
  if (typeof value === "string") {
    return stripHiddenSpans(value).content as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry: unknown) => stripHiddenDeep(entry)) as T;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, stripHiddenDeep(entry)] as const);
    return Object.fromEntries(entries) as T;
  }
  return value;
}

/** {@link stripHiddenDeep}, gated on the viewer's resolved read posture: a viewer who READS HIDDEN (the room
 *  host, per chat's `viewerReadsHidden`) gets the payload byte-identical — identity, not a walk. */
export function stripHiddenForViewer<T>(value: T, readsHidden: boolean): T {
  return readsHidden ? value : stripHiddenDeep(value);
}
