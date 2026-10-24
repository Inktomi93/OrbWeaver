// `{{roll}}` reads the shared dice notation and bound table: a signed modifier, the table's maxima, one draw per
// die, and an empty render for malformed or out-of-bounds notation.
// @subject packages/kit/src/macro/registry.ts
// @subject packages/kit/src/dice/index.ts

import { DICE_BOUNDS } from "@orb/kit/dice";
import { processMacros } from "@orb/kit/macro";
import { expect, test } from "@orb/testkit/node";

/** The largest draw strictly below 1, so every die lands on its top face. */
const TOP_DRAW = 1 - Number.EPSILON / 2;

function roll(spec: string, draw = 0): { readonly output: string; readonly draws: number } {
  let draws = 0;
  const output = processMacros(`{{roll::${spec}}}`, {
    char: "C",
    user: "U",
    persona: "P",
    scenario: "S",
    env: {},
    random: () => {
      draws += 1;
      return draw;
    },
  });
  return { output, draws };
}

test("a signed modifier joins the dice total", () => {
  expect(roll("2d6+3")).toEqual({ output: "5", draws: 2 });
  expect(roll("d20-25", TOP_DRAW)).toEqual({ output: "-5", draws: 1 });
  expect(roll("3D4", TOP_DRAW)).toEqual({ output: "12", draws: 3 });
});

test("a bare count rolls one die of that many faces", () => {
  expect(roll("1")).toEqual({ output: "1", draws: 1 });
  expect(roll(String(DICE_BOUNDS.maxFaces), TOP_DRAW)).toEqual({ output: String(DICE_BOUNDS.maxFaces), draws: 1 });
  expect(roll("0")).toEqual({ output: "", draws: 0 });
});

test("the table's maxima roll and one past any of them renders empty without a draw", () => {
  const { maxDice, maxFaces, maxModifier } = DICE_BOUNDS;
  expect(roll(`${maxDice}d1+${maxModifier}`)).toEqual({ output: String(maxDice + maxModifier), draws: maxDice });
  for (const spec of [`${maxDice + 1}d6`, `1d${maxFaces + 1}`, `${maxFaces + 1}`, `1d6+${maxModifier + 1}`, `1d6-${maxModifier + 1}`, "0d6"]) {
    expect(roll(spec), spec).toEqual({ output: "", draws: 0 });
  }
});

test("malformed notation renders empty without a draw", () => {
  for (const spec of ["", "2d", "abc", "2d6+", "1.5d6", "-3", `1d6+${"9".repeat(400)}`]) {
    expect(roll(spec), spec).toEqual({ output: "", draws: 0 });
  }
});
