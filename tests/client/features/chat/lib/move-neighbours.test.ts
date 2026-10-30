import { expect, test } from "@orb/testkit/node";
import { moveNeighboursAt, moveReasons } from "#client/features/chat/lib/move-neighbours.ts";

const ROWS = [{ seq: 4 }, { seq: 7 }, { seq: 9 }] as const;
const SETTLED = { earlier: false, later: false, settling: false } as const;

/** Which arrows a row leaves enabled: `up` and `down` are true when no reason disables them. */
function enabledAt(
  at: number,
  edges: { readonly earlier: boolean; readonly later: boolean; readonly settling: boolean },
  generating = false,
): { up: boolean; down: boolean } {
  const reasons = moveReasons(moveNeighboursAt(ROWS, at, edges), generating);
  return { up: reasons.up === undefined, down: reasons.down === undefined };
}

test("an interior row has both neighbours and a row at a loaded end has one", () => {
  expect(enabledAt(1, SETTLED)).toEqual({ up: true, down: true });
  expect(enabledAt(0, SETTLED)).toEqual({ up: false, down: true });
  expect(enabledAt(2, SETTLED)).toEqual({ up: true, down: false });
});

test("canon beyond the loaded rows keeps the end arrow live, and only on the end row", () => {
  expect(enabledAt(0, { ...SETTLED, earlier: true })).toEqual({ up: true, down: true });
  expect(enabledAt(2, { ...SETTLED, later: true })).toEqual({ up: true, down: true });
  expect(enabledAt(1, { ...SETTLED, earlier: true, later: true })).toEqual({ up: true, down: true });
  expect(enabledAt(2, { ...SETTLED, earlier: true })).toEqual({ up: true, down: false });
});

test("both arrows disable on every row while the loaded pages are still catching up to the live tail", () => {
  for (const at of [0, 1, 2]) {
    // The loaded neighbour may sit across a gap, so even an interior row must not send its seq.
    expect(enabledAt(at, { ...SETTLED, settling: true })).toEqual({ up: false, down: false });
  }
});

test("a running turn disables both arrows on every row", () => {
  for (const at of [0, 1, 2]) {
    expect(enabledAt(at, SETTLED, true)).toEqual({ up: false, down: false });
  }
});
