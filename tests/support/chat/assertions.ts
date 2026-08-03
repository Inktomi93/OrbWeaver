// tests/support/chat/assertions — the named turn-invariant assertions (neo's harness assertion helpers,
// re-derived for orb's surface — N4). Each is a THIN wrapper whose diff message beats a raw `toEqual` AND
// encodes a load-bearing chat invariant the int tests hand-roll repeatedly. They call `expect` internally so a
// test asserting ONLY through them still satisfies the root `expect.requireAssertions` floor — which is exactly
// why biome's `noMisplacedAssertion` (an assertion outside a lexical `test()`) is suppressed at each site: the
// assertion runs on behalf of the CALLING test, not this module.
//
// SCOPE (deliberately small — the custom-MATCHER cap of 5 is elsewhere; these are plain functions over
// harness-captured data): the KV-cache prefix-stability invariant, the token-accounting invariant, and the
// bus-event-ordering invariant — the three the steal list names, mapped onto orb's real shapes
// (`TurnRequest.prompt.static`, `StatsDelta`, `ChatBusEvent`).

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { StatsDelta } from "@orb/contracts/stats";
import { expect } from "vitest";
import type { TurnRequest } from "../../../packages/server/src/domain/chat/contract/results.ts";

/**
 * The KV-CACHE SAFETY invariant (steal-list §N1 "cache-safety"): the assembled STATIC system prefix
 * (`TurnRequest.prompt.static` — the cache-stable half) must be BYTE-IDENTICAL across every captured turn. A
 * drift here silently poisons the provider KV cache (a cache miss every turn — costs tokens, not pixels), so a
 * mismatch fails LOUD with every prefix in the diff (the drifting turn index is visible). Feed it a
 * `ChatScenario.requests` slice (≥2 turns).
 */
export function assertStaticPrefixStable(requests: readonly TurnRequest[]): void {
  if (requests.length < 2) {
    throw new Error("assertStaticPrefixStable needs ≥2 captured requests to compare");
  }
  const first = requests[0]?.prompt.static;
  const statics = requests.map((r) => r.prompt.static);
  // biome-ignore lint/suspicious/noMisplacedAssertion: named assertion helper — asserts for the calling test (satisfies requireAssertions).
  expect(statics, "static prompt prefix drifted across turns — the KV cache is poisoned").toEqual(statics.map(() => first));
}

/**
 * The TOKEN-ACCOUNTING invariant: the stats deltas the canon-mutators pushed must SUM to the expected wire
 * totals (the scripted economics, summed). Orb pins economics through `applyStatsDelta`; a runner/reducer
 * regression that drops or double-counts a turn's tokens is invisible to a per-turn assertion but shows here.
 * Only counts a delta that reported the field (an omitted increment is absent, never a fabricated zero).
 */
export function assertTokenTotalsConsistent(deltas: readonly StatsDelta[], expected: { readonly tokensIn: number; readonly tokensOut: number }): void {
  const sum = (pick: (d: StatsDelta) => number | undefined): number => deltas.reduce((acc, d) => acc + (pick(d) ?? 0), 0);
  // biome-ignore lint/suspicious/noMisplacedAssertion: named assertion helper — asserts for the calling test (satisfies requireAssertions).
  expect(
    { tokensIn: sum((d) => d.tokensIn), tokensOut: sum((d) => d.tokensOut) },
    "summed stats-delta token totals diverged from the scripted economics",
  ).toEqual(expected);
}

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
