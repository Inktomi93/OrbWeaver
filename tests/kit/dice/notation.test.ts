// The one dice-notation parser and bound table: well-formed fields, refused shapes, the widest bounds, a policy
// that can only narrow them, and one draw per die.
// @subject packages/kit/src/dice/index.ts

import type { DiceBounds } from "@orb/kit/dice";
import { DICE_BOUNDS, diceNotationInBounds, parseDiceNotation, rollDiceNotation } from "@orb/kit/dice";
import { expect, test } from "@orb/testkit/node";

/** A digit run far past what `Number` can hold: parsed loosely it becomes `Infinity`. */
const OVERFLOWING_DIGITS = "9".repeat(400);
/** One digit wider than the widest bound, so the shape refuses it before any bound is read. */
const TOO_WIDE = String(DICE_BOUNDS.maxDice * 10);

test("well-formed notation parses into its fields with a default count and modifier", () => {
  expect(parseDiceNotation("2d6+1")).toEqual({ count: 2, faces: 6, modifier: 1 });
  expect(parseDiceNotation("d20")).toEqual({ count: 1, faces: 20, modifier: 0 });
  expect(parseDiceNotation(" 3D8-2 ")).toEqual({ count: 3, faces: 8, modifier: -2 });
  expect(parseDiceNotation(`${DICE_BOUNDS.maxDice}d${DICE_BOUNDS.maxFaces}-${DICE_BOUNDS.maxModifier}`)).toEqual({
    count: DICE_BOUNDS.maxDice,
    faces: DICE_BOUNDS.maxFaces,
    modifier: -DICE_BOUNDS.maxModifier,
  });
});

test("malformed and overflowing notation does not parse", () => {
  const refused = [
    "",
    "d",
    "2d",
    "2x6",
    "2d6+",
    "2d6++1",
    "2d6+1+1",
    "1.5d6",
    "-1d6",
    "2 d6",
    `1d6+${OVERFLOWING_DIGITS}`,
    `${OVERFLOWING_DIGITS}d6`,
    `1d${OVERFLOWING_DIGITS}`,
    `${TOO_WIDE}d6`,
    `1d${TOO_WIDE}`,
    `1d6-${TOO_WIDE}`,
  ];
  for (const notation of refused) {
    expect(parseDiceNotation(notation), notation).toBeNull();
  }
});

test("the widest bounds admit their maxima and refuse one past each, and a zero count or face", () => {
  const { maxDice, maxFaces, maxModifier } = DICE_BOUNDS;
  expect(diceNotationInBounds({ count: maxDice, faces: maxFaces, modifier: maxModifier })).toBe(true);
  expect(diceNotationInBounds({ count: 1, faces: 1, modifier: -maxModifier })).toBe(true);
  const outside = [
    { count: maxDice + 1, faces: 6, modifier: 0 },
    { count: 1, faces: maxFaces + 1, modifier: 0 },
    { count: 1, faces: 6, modifier: maxModifier + 1 },
    { count: 1, faces: 6, modifier: -maxModifier - 1 },
    { count: 0, faces: 6, modifier: 0 },
    { count: 1, faces: 0, modifier: 0 },
  ];
  for (const notation of outside) {
    expect(diceNotationInBounds(notation), JSON.stringify(notation)).toBe(false);
  }
});

test("a policy's bounds narrow the table and can never widen it", () => {
  const narrow: DiceBounds = { maxDice: 4, maxFaces: 8, maxModifier: 2 };
  expect(diceNotationInBounds({ count: 4, faces: 8, modifier: -2 }, narrow)).toBe(true);
  expect(diceNotationInBounds({ count: 5, faces: 8, modifier: 0 }, narrow)).toBe(false);
  expect(diceNotationInBounds({ count: 1, faces: 9, modifier: 0 }, narrow)).toBe(false);
  expect(diceNotationInBounds({ count: 1, faces: 8, modifier: 3 }, narrow)).toBe(false);

  const wide: DiceBounds = { maxDice: Number.MAX_SAFE_INTEGER, maxFaces: Number.MAX_SAFE_INTEGER, maxModifier: Number.MAX_SAFE_INTEGER };
  expect(diceNotationInBounds({ count: DICE_BOUNDS.maxDice + 1, faces: 6, modifier: 0 }, wide)).toBe(false);
  expect(diceNotationInBounds({ count: 1, faces: DICE_BOUNDS.maxFaces + 1, modifier: 0 }, wide)).toBe(false);
  expect(diceNotationInBounds({ count: 1, faces: 6, modifier: DICE_BOUNDS.maxModifier + 1 }, wide)).toBe(false);
});

test("a roll draws once per die over its faces and adds the modifier to the total", () => {
  const asked: number[] = [];
  const draws = [0, 5, 2];
  const roll = rollDiceNotation({ count: 3, faces: 6, modifier: -4 }, (max) => {
    asked.push(max);
    return draws[asked.length - 1] ?? Number.NaN;
  });
  expect(asked).toEqual([6, 6, 6]);
  expect(roll).toEqual({ rolls: [1, 6, 3], total: 6 });
});
