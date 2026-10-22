// Assert lifecycle ordering over the actual durable events a composed test captures.

import type { ChatBusEvent } from "@orb/contracts/chat";

import { expect } from "vitest";

/** Options for {@link assertEventSequence}. `exact` ⇒ the event types must equal `expected` verbatim (no
 *  interleaving allowed); default is ORDERED-SUBSEQUENCE (the named lifecycle events appear in order, with
 *  `delta`/`warning`/… allowed between them — the shape the durable bus actually emits). */
export interface EventSequenceOptions {
  readonly exact?: boolean;
}

/** How many of `expected` appear, in order, as a subsequence of `actual` (== `expected.length` ⇒ all present). */
function orderedSubsequenceCount(actual: readonly string[], expected: readonly string[]): number {
  let cursor = 0;
  for (const type of actual) {
    if (type === expected[cursor]) {
      cursor += 1;
    }
  }
  return cursor;
}

/**
 * The BUS-ORDERING invariant: the named lifecycle events appear in the expected ORDER (e.g.
 * `["turnStarted", "messageCommitted", "turnCompleted"]`). Orb proves durability/monotonicity but never the
 * sequence itself — a reordered emit passes silently today; this pins it. Default matches the ordered
 * subsequence (deltas interleave); `{ exact: true }` demands the full type list verbatim.
 */
export function assertEventSequence(events: readonly ChatBusEvent[], expected: readonly ChatBusEvent["type"][], options: EventSequenceOptions = {}): void {
  const types = events.map((e) => e.type);
  const actual = options.exact === true ? types : orderedSubsequenceCount(types, expected);
  const want = options.exact === true ? [...expected] : expected.length;
  // biome-ignore lint/suspicious/noMisplacedAssertion: named assertion helper — asserts for the calling test (satisfies requireAssertions).
  expect(actual, `event order [${expected.join(", ")}] not satisfied by [${types.join(", ")}]`).toEqual(want);
}
