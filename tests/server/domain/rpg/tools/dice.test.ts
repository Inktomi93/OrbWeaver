// domain/rpg/tools/dice — the PURE dice-notation roller (rpg-design/05 §4.5). Deterministic: the injected
// `randomInt` is a scripted queue, so the faces + total pin exactly. Pins: NdM+K parsing, the [0,max)→[1,max]
// face mapping, the modifier, the default count, and the null on unparseable / out-of-bounds notation.

import { rollNotation } from "../../../../../packages/server/src/domain/rpg/tools/dice.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** A scripted `randomInt` — returns each queued value in order (the value is a `[0, faces)` roll). */
function scripted(values: number[]): (max: number) => number {
  const q = [...values];
  return () => q.shift() ?? 0;
}

test("2d6+1 sums the faces (mapped [0,6)→[1,6]) plus the modifier", () => {
  // Queue two [0,6) rolls: 3 → face 4, 5 → face 6. Total 4+6+1 = 11.
  const roll = rollNotation("2d6+1", scripted([3, 5]));
  expect(roll).toEqual({ faces: [4, 6], total: 11 });
});

test("d20 defaults the count to 1", () => {
  const roll = rollNotation("d20", scripted([19])); // 19 → face 20
  expect(roll).toEqual({ faces: [20], total: 20 });
});

test("a negative modifier subtracts", () => {
  const roll = rollNotation("3d8-2", scripted([0, 0, 0])); // three face-1s
  expect(roll).toEqual({ faces: [1, 1, 1], total: 1 });
});

test("unparseable notation returns null", () => {
  expect(rollNotation("not-dice", scripted([]))).toBeNull();
  expect(rollNotation("", scripted([]))).toBeNull();
});

test("out-of-bounds notation is rejected (no huge roll loop)", () => {
  expect(rollNotation("9999d9999", scripted([]))).toBeNull();
  expect(rollNotation("0d6", scripted([]))).toBeNull();
});
