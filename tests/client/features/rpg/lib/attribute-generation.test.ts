import { RPG_PROFILE_D20 } from "@orb/contracts/rpg";
import {
  canGenerateD20Attributes,
  rollD20Attributes,
  standardD20Attributes,
} from "../../../../../packages/client/src/features/rpg/lib/attribute-generation.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("the standard array has the six canonical keys in displayed order", () => {
  expect(standardD20Attributes()).toEqual({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });
});

test("4d6 drops exactly one lowest face, including a tie, and rolls independently for each score", async () => {
  const queue = [
    [1, 6, 6, 4],
    [1, 1, 1, 1],
    [6, 6, 6, 6],
    [2, 3, 4, 5],
    [2, 2, 5, 5],
    [3, 3, 3, 3],
  ];
  const scores = await rollD20Attributes(() => {
    const dice = queue.shift();
    if (dice === undefined) {
      throw new Error("roll tape exhausted");
    }
    return Promise.resolve(dice);
  });
  expect(scores).toEqual({ str: 16, dex: 3, con: 18, int: 12, wis: 12, cha: 9 });
  expect(queue).toEqual([]);
});

test("a failed roll rejects the whole generation before its caller can write a partial sheet", async () => {
  let calls = 0;
  await expect(
    rollD20Attributes(() => {
      calls += 1;
      return calls === 2 ? Promise.reject(new Error("dice request failed")) : Promise.resolve([6, 6, 6, 6]);
    }),
  ).rejects.toThrow("dice request failed");
  expect(calls).toBe(2);
});

test("custom profiles keep manual entry without receiving invalid generated values", () => {
  expect(canGenerateD20Attributes(RPG_PROFILE_D20)).toBe(true);
  expect(canGenerateD20Attributes({ ...RPG_PROFILE_D20, attributes: RPG_PROFILE_D20.attributes.slice(1) })).toBe(false);
  expect(canGenerateD20Attributes({ ...RPG_PROFILE_D20, range: { min: 8, max: 20 } })).toBe(false);
});
