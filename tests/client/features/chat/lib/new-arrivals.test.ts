// Unit: `new-arrivals` (features/chat/lib/new-arrivals) — the pure item-space arrival diff behind
// the message list's enter motion (motion guide §4.2 item 1). Pins the load-bearing calls the file
// header documents: append animates, scroll-in/prepend never does, model output around a live turn
// is muted (the ghost→committed zero-pop contract — BOTH the mid-turn commit and the settle render,
// the live-verified 2026-07-12 failure modes), and the ghost key re-arms between turns.

import type { ArrivalEntry } from "../../../../../packages/client/src/features/chat/lib/new-arrivals";
import { initialArrivals, NO_ARRIVALS, nextArrivals } from "../../../../../packages/client/src/features/chat/lib/new-arrivals";
import { expect, test } from "../../../../support/fixtures";

const GHOST = "__ghost__";

/** Entries for user/system rows (or the ghost — its key is exempt inside the diff anyway). */
function rows(...keys: readonly string[]): ArrivalEntry[] {
  return keys.map((key) => ({ key, modelOutput: false }));
}

/** One committed-assistant entry (the `modelOutput` mute candidate). */
function assistant(key: string): ArrivalEntry {
  return { key, modelOutput: true };
}

test("initialArrivals marks the whole transcript seen with nothing fresh (opening ≠ arriving)", () => {
  const diff = initialArrivals(["m1", "m2"]);
  expect(diff.fresh).toBe(NO_ARRIVALS);
  expect([...diff.seen].sort()).toEqual(["m1", "m2"]);
});

test("an unchanged key list diffs to null — ordinary re-renders cause zero state churn", () => {
  const diff = initialArrivals(["m1", "m2"]);
  expect(nextArrivals(diff, rows("m1", "m2"), GHOST)).toBeNull();
});

test("an appended key is fresh AND becomes seen (the next diff returns null)", () => {
  const diff = initialArrivals(["m1"]);
  const next = nextArrivals(diff, rows("m1", "m2"), GHOST);
  expect(next).not.toBeNull();
  expect([...(next?.fresh ?? [])]).toEqual(["m2"]);
  // The arrival is consumed: the same list diffs to null afterward — a scrolled-back row can never
  // re-qualify because its id stays in `seen`.
  expect(nextArrivals(next ?? diff, rows("m1", "m2"), GHOST)).toBeNull();
});

test("the first message of an empty chat is an arrival", () => {
  const next = nextArrivals(initialArrivals([]), rows("m1"), GHOST);
  expect([...(next?.fresh ?? [])]).toEqual(["m1"]);
});

test("an appended assistant row with NO turn live animates (another actor's arrival, restrained)", () => {
  const next = nextArrivals(initialArrivals(["m1"]), [...rows("m1"), assistant("m2")], GHOST);
  expect([...(next?.fresh ?? [])]).toEqual(["m2"]);
});

test("a PREPENDED key (older-history backfill) is seen but never fresh", () => {
  const diff = initialArrivals(["m5", "m6"]);
  const next = nextArrivals(diff, rows("m1", "m2", "m5", "m6"), GHOST);
  expect(next).not.toBeNull();
  expect(next?.fresh).toBe(NO_ARRIVALS);
  expect(next?.seen.has("m1")).toBe(true);
});

test("a prepend and an append in one diff: only the appended key is fresh", () => {
  const diff = initialArrivals(["m5"]);
  const next = nextArrivals(diff, rows("m1", "m5", "m9"), GHOST);
  expect([...(next?.fresh ?? [])]).toEqual(["m9"]);
});

test("the ghost appearing is an arrival (a turn starting is genuinely new content)", () => {
  const diff = initialArrivals(["m1"]);
  const next = nextArrivals(diff, rows("m1", GHOST), GHOST);
  expect([...(next?.fresh ?? [])]).toEqual([GHOST]);
});

test("a USER message committed while the ghost is live is an arrival despite the tail ghost", () => {
  // Live-verified (2026-07-12): send → phase flips synchronously → the ghost enters FIRST; the user
  // message's canon row lands a roundtrip later, BEFORE the ghost in list order. The ghost must not
  // count as the append boundary or every mid-turn commit reads as a backfill.
  const streaming = nextArrivals(initialArrivals(["m1"]), rows("m1", GHOST), GHOST);
  expect(streaming).not.toBeNull();
  if (streaming === null) {
    return;
  }
  const userCommitted = nextArrivals(streaming, rows("m1", "m2", GHOST), GHOST);
  expect([...(userCommitted?.fresh ?? [])]).toEqual(["m2"]);
});

test("an ASSISTANT row committing while the ghost is STILL live is muted (mid-turn zero-pop)", () => {
  // Live-verified (2026-07-12): canon commits BEFORE the phase flips to complete, so the committed
  // assistant row and the ghost coexist for a render — the row must enter pre-seen, silently.
  const streaming = nextArrivals(initialArrivals(["m1"]), rows("m1", GHOST), GHOST);
  expect(streaming).not.toBeNull();
  if (streaming === null) {
    return;
  }
  const committed = nextArrivals(streaming, [...rows("m1"), assistant("m2"), ...rows(GHOST)], GHOST);
  expect(committed).not.toBeNull();
  expect(committed?.fresh).toBe(NO_ARRIVALS);
  expect(committed?.seen.has("m2")).toBe(true);
});

test("the ghost→committed settle render is muted too: the replacing row is pre-seen", () => {
  const streaming = nextArrivals(initialArrivals(["m1"]), rows("m1", GHOST), GHOST);
  expect(streaming).not.toBeNull();
  if (streaming === null) {
    return;
  }
  const settled = nextArrivals(streaming, [...rows("m1"), assistant("m2")], GHOST);
  expect(settled).not.toBeNull();
  expect(settled?.fresh).toBe(NO_ARRIVALS);
  expect(settled?.seen.has("m2")).toBe(true);
  expect(settled?.awaitingSettle).toBe(false);
});

test("a DELAYED settle is muted: the canon row landing a refetch AFTER the ghost left", () => {
  // Live-verified (2026-07-12): the turn-complete phase flip removes the ghost, and the invalidated
  // listMessages refetch lands the committed assistant row a roundtrip LATER — `awaitingSettle`
  // must carry the mute across that gap, then disarm.
  const streaming = nextArrivals(initialArrivals(["m1"]), rows("m1", GHOST), GHOST);
  const ghostGone = streaming === null ? null : nextArrivals(streaming, rows("m1"), GHOST);
  expect(ghostGone?.awaitingSettle).toBe(true);
  const canonLands = ghostGone === null ? null : nextArrivals(ghostGone, [...rows("m1"), assistant("m2")], GHOST);
  expect(canonLands).not.toBeNull();
  expect(canonLands?.fresh).toBe(NO_ARRIVALS);
  expect(canonLands?.awaitingSettle).toBe(false);
  // The latch is consumed: a LATER assistant arrival with no turn live animates normally.
  const later = canonLands === null ? null : nextArrivals(canonLands, [...rows("m1"), assistant("m2"), assistant("m3")], GHOST);
  expect([...(later?.fresh ?? [])]).toEqual(["m3"]);
});

test("a USER message arriving while awaitingSettle still animates (only model output is muted)", () => {
  const streaming = nextArrivals(initialArrivals(["m1"]), rows("m1", GHOST), GHOST);
  const ghostGone = streaming === null ? null : nextArrivals(streaming, rows("m1"), GHOST);
  const userLands = ghostGone === null ? null : nextArrivals(ghostGone, rows("m1", "m2"), GHOST);
  expect([...(userLands?.fresh ?? [])]).toEqual(["m2"]);
  expect(userLands?.awaitingSettle).toBe(true);
});

test("the ghost key re-arms after settle: the NEXT turn's ghost is fresh again", () => {
  const streaming = nextArrivals(initialArrivals(["m1"]), rows("m1", GHOST), GHOST);
  const settled = streaming === null ? null : nextArrivals(streaming, [...rows("m1"), assistant("m2")], GHOST);
  expect(settled?.seen.has(GHOST)).toBe(false);
  const nextTurn = settled === null ? null : nextArrivals(settled, [...rows("m1"), assistant("m2"), ...rows(GHOST)], GHOST);
  expect([...(nextTurn?.fresh ?? [])]).toEqual([GHOST]);
});

test("a cancelled turn (ghost gone, nothing committed) re-arms the ghost without arrivals", () => {
  const streaming = nextArrivals(initialArrivals(["m1"]), rows("m1", GHOST), GHOST);
  const cancelled = streaming === null ? null : nextArrivals(streaming, rows("m1"), GHOST);
  expect(cancelled).not.toBeNull();
  expect(cancelled?.fresh).toBe(NO_ARRIVALS);
  expect(cancelled?.seen.has(GHOST)).toBe(false);
});

test("a deleted key produces no diff (nothing arrived) — exit is deliberately unanimated", () => {
  const diff = initialArrivals(["m1", "m2"]);
  expect(nextArrivals(diff, rows("m1"), GHOST)).toBeNull();
});
