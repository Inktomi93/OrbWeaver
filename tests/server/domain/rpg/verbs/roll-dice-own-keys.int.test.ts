// An ability check reads only the sheet's own score: a host label that mints an `Object.prototype` member name as
// its key (`Constructor` → `constructor`) is unset until the sheet sets it, then rolls with its real modifier.
// @subject packages/server/src/domain/rpg/verbs/roll-dice.ts

import { rpgAttributeModifier } from "@orb/contracts/rpg";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, seedCorpusActors, seedRecallRoom, seedRpgGame } from "@orb/testkit/node/composed";

/** The key the client mints from the host label "Constructor": an inherited member of every plain object. */
const INHERITED_KEY = "constructor";

test("an ability keyed by an inherited member name refuses while unset and rolls its own score once set", async () => {
  await using root = await createServerHarness({ random: () => 0.5 });
  const { owner } = await seedCorpusActors(root);
  const chatId = await seedRecallRoom(await root.internalCallerFor(owner.userId));
  await seedRpgGame(root, { principal: owner, chatId, mode: "lite", ruleset: "d20" });
  const born = (await root.services.rpg.getConfigView({ principal: owner, chatId })).statProfile;
  const statProfile = { ...born, attributes: [...born.attributes, { key: INHERITED_KEY, label: "Constructor", hint: "" }] };
  await root.services.rpg.updateConfig({ principal: owner, chatId, patch: { statProfile } });
  const params = { principal: owner, chatId, ability: INHERITED_KEY, notation: "d20" };
  const sheet = { principal: owner, chatId, actorRef: { kind: "user", userId: owner.userId } } as const;
  const other = born.attributes[0];
  if (other === undefined) {
    throw new Error("the born game profile has no attribute");
  }
  // A stored sheet that sets a different attribute: the inherited name is still unset on it.
  await root.services.rpg.patchSheet({ ...sheet, patch: { attributes: { [other.key]: born.range.max } } });

  await expect(root.services.rpg.rollDice(params)).rejects.toMatchObject({ code: "rpg_unset_ability" });

  const score = 17;
  await root.services.rpg.patchSheet({ ...sheet, patch: { attributes: { [INHERITED_KEY]: score } } });
  const rolled = await root.services.rpg.rollDice(params);
  const modifier = rpgAttributeModifier(statProfile, score);
  expect(rolled).toMatchObject({ modifier, total: (rolled.rolls[0] ?? Number.NaN) + modifier });
  expect(rolled.stamp).toBe(`[dice: Constructor d20${modifier >= 0 ? "+" : ""}${modifier} → ${rolled.total}]`);
});
