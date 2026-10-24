// A member's roll names why it was refused: a count the shared notation reads but the rpg policy narrows away is
// out of bounds, and a count wider than any bound is not notation at all.
// @subject packages/server/src/domain/rpg/verbs/roll-dice.ts
// @subject packages/server/src/domain/rpg/substrate/dice.ts

import { DICE_BOUNDS } from "@orb/kit/dice";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, seedCorpusActors, seedRecallRoom, seedRpgGame } from "@orb/testkit/node/composed";

test("a kit-width count past the rpg policy is out of bounds, and a wider one is unparseable", async () => {
  await using root = await createServerHarness();
  const { owner } = await seedCorpusActors(root);
  const chatId = await seedRecallRoom(await root.internalCallerFor(owner.userId));
  await seedRpgGame(root, { principal: owner, chatId, mode: "lite", ruleset: "d20" });
  const roll = (notation: string): Promise<unknown> => root.services.rpg.rollDice({ principal: owner, chatId, notation });

  await expect(roll(`${DICE_BOUNDS.maxDice}d6`)).rejects.toMatchObject({ code: "rpg_dice_out_of_bounds" });
  await expect(roll(`${DICE_BOUNDS.maxDice * 10}d6`)).rejects.toMatchObject({ code: "rpg_bad_dice_notation" });
});
