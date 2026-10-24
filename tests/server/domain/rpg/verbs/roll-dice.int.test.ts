// A member's dice notation is refused before any random draw when a field overflows or leaves the dice policy
// bounds, on the real service and through the routed procedure; finite rolls and ability checks are unchanged.
// @subject packages/server/src/domain/rpg/verbs/roll-dice.ts
// @subject packages/server/src/domain/rpg/substrate/dice.ts

import type { Principal } from "@orb/contracts/identity";
import { rpgAttributeModifier } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, seedCorpusActors, seedRecallRoom, seedRpgGame } from "@orb/testkit/node/composed";

/** A digit run far past what `Number` can hold: parsed loosely it becomes `Infinity`. */
const OVERFLOWING_DIGITS = "9".repeat(400);

interface Table extends AsyncDisposable {
  readonly root: ServerTestHarness;
  readonly owner: Principal;
  readonly chatId: ChatId;
  readonly config: Awaited<ReturnType<ServerTestHarness["services"]["rpg"]["getConfigView"]>>;
  readonly caller: Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
  /** Every draw the root's seeded entropy has served so far. */
  readonly draws: () => number;
}

async function openTable(): Promise<Table> {
  let draws = 0;
  const root = await createServerHarness({
    random: () => {
      draws += 1;
      return 0.5;
    },
  });
  const { owner } = await seedCorpusActors(root);
  const caller = await root.internalCallerFor(owner.userId);
  const chatId = await seedRecallRoom(caller);
  await seedRpgGame(root, { principal: owner, chatId, mode: "lite", ruleset: "d20" });
  const config = await root.services.rpg.getConfigView({ principal: owner, chatId });
  return { root, owner, chatId, config, caller, draws: () => draws, [Symbol.asyncDispose]: () => root[Symbol.asyncDispose]() };
}

const REFUSED = [
  { notation: `1d6+${OVERFLOWING_DIGITS}`, code: "rpg_bad_dice_notation" },
  { notation: `1d6-${OVERFLOWING_DIGITS}`, code: "rpg_bad_dice_notation" },
  { notation: `${OVERFLOWING_DIGITS}d6`, code: "rpg_bad_dice_notation" },
  { notation: "1d6+1001", code: "rpg_dice_out_of_bounds" },
  { notation: "1d6-1001", code: "rpg_dice_out_of_bounds" },
  { notation: "101d6", code: "rpg_dice_out_of_bounds" },
  { notation: "1d1001", code: "rpg_dice_out_of_bounds" },
  { notation: "1d1", code: "rpg_dice_out_of_bounds" },
] as const;

test("overflowing and out-of-range notation is refused before any random draw on the service and the route", async () => {
  await using table = await openTable();
  for (const { notation, code } of REFUSED) {
    const before = table.draws();
    await expect(table.root.services.rpg.rollDice({ principal: table.owner, chatId: table.chatId, notation }), notation).rejects.toMatchObject({ code });
    await expect(table.caller.rpg.rollDice({ chatId: table.chatId, notation }), notation).rejects.toMatchObject({ cause: { code } });
    expect(table.draws(), notation).toBe(before);
  }
});

test("a roll at the modifier bound stays finite and draws once per die on the service and the route", async () => {
  await using table = await openTable();
  for (const notation of ["2d6+1000", "3d20-1000"]) {
    const before = table.draws();
    const direct = await table.root.services.rpg.rollDice({ principal: table.owner, chatId: table.chatId, notation });
    const routed = await table.caller.rpg.rollDice({ chatId: table.chatId, notation });
    for (const result of [direct, routed]) {
      expect(Number.isFinite(result.total)).toBe(true);
      expect(result.total).toBe(result.rolls.reduce((sum, roll) => sum + roll, 0) + result.modifier);
      expect(result.stamp).toBe(`[dice: ${notation} → ${result.total}]`);
    }
    expect(direct.modifier).toBe(notation.endsWith("+1000") ? 1000 : -1000);
    expect(table.draws() - before).toBe(direct.rolls.length + routed.rolls.length);
  }
});

test("an ability check still rolls a bare d20 with the sheet's modifier and refuses a caller modifier before drawing", async () => {
  await using table = await openTable();
  const { config } = table;
  const ability = config.statProfile.attributes[0];
  if (ability === undefined) {
    throw new Error("the born game profile has no attribute");
  }
  const params = { principal: table.owner, chatId: table.chatId, ability: ability.key };
  const before = table.draws();
  await expect(table.root.services.rpg.rollDice({ ...params, notation: "d20" })).rejects.toMatchObject({ code: "rpg_unset_ability" });
  await expect(table.root.services.rpg.rollDice({ ...params, notation: "d20+5" })).rejects.toMatchObject({ code: "rpg_bad_ability_dice" });
  expect(table.draws()).toBe(before);

  const score = 16;
  await table.root.services.rpg.patchSheet({
    ...params,
    actorRef: { kind: "user", userId: table.owner.userId },
    patch: { attributes: { [ability.key]: score } },
  });
  const rolled = await table.root.services.rpg.rollDice({ ...params, notation: "d20" });
  const modifier = rpgAttributeModifier(config.statProfile, score);
  expect(rolled).toMatchObject({ notation: "d20", modifier, total: (rolled.rolls[0] ?? Number.NaN) + modifier });
  expect(rolled.rolls).toHaveLength(1);
  expect(rolled.stamp).toBe(`[dice: ${ability.label} d20${modifier >= 0 ? "+" : ""}${modifier} → ${rolled.total}]`);
});
