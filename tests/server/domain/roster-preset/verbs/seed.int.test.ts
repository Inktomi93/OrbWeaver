// @subject packages/server/src/domain/roster-preset/verbs/seed.ts

import "@orb/testkit/node/composed-real.ts";
import { SEED_MANIFEST } from "@orb/default-content";
import { createFindSeedCharacter } from "@orb/server/domain/character";
import { createRosterSeedStep, createSeedRosterPreset } from "@orb/server/domain/roster-preset";
import { seedCharacter } from "@orb/testkit/node/factories/character.ts";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

const CAMPAIGN = SEED_MANIFEST.find((item) => item.kind === "rosterPreset" && item.startsGame);
const PLAIN = SEED_MANIFEST.find((item) => item.kind === "rosterPreset" && !item.startsGame);
if (CAMPAIGN?.kind !== "rosterPreset" || PLAIN?.kind !== "rosterPreset") {
  throw new Error("the canonical manifest must contain its plain and campaign rosters");
}

test("authored campaign and plain steps preserve the receiving Principal, owned character order and real game interpretation", async ({ db, services }) => {
  const owner = await seedUser(db);
  const neighbor = await seedUser(db);
  const actor = principal(owner.id, { role: owner.role, handle: owner.handle });
  for (const handle of new Set([...CAMPAIGN.characters, ...PLAIN.characters])) {
    await seedCharacter(db, { ownerId: owner.id, handle });
    await seedCharacter(db, { ownerId: neighbor.id, handle });
  }
  for (const item of [CAMPAIGN, PLAIN]) {
    const step = createRosterSeedStep({
      name: item.name,
      description: item.description,
      startsGame: item.startsGame,
      characterHandles: item.characters,
      findCharacter: createFindSeedCharacter((args) => services.character.findByHandle(args)),
      createRosterPreset: createSeedRosterPreset((args) => services.rosterPreset.create(args)),
    });
    expect(await step(actor)).toBe(true);
    const row = (await services.rosterPreset.list({ principal: actor })).find((r) => r.name === item.name);
    if (row === undefined) {
      throw new Error("the real roster seed did not land its authored roster");
    }
    const expected = await Promise.all(
      item.characters.map(async (handle) => (await services.character.findByHandle({ ownerId: owner.id, handle }))?.characterId),
    );
    expect(row.members.map((member) => member.characterId)).toEqual(expected);
    expect(row.game === null).toBe(!item.startsGame);
  }
  expect(await services.rosterPreset.list({ principal: principal(neighbor.id, { role: neighbor.role, handle: neighbor.handle }) })).toEqual([]);
});

test("all-deleted authored seats settle without a roster write, never filling the vacancy with another user's same handles", async ({ db, services }) => {
  const owner = await seedUser(db);
  const neighbor = await seedUser(db);
  const actor = principal(owner.id, { role: owner.role, handle: owner.handle });
  for (const handle of PLAIN.characters) {
    const card = await seedCharacter(db, { ownerId: owner.id, handle });
    await seedCharacter(db, { ownerId: neighbor.id, handle });
    await services.character.remove({ principal: actor, characterId: card.id });
  }
  const step = createRosterSeedStep({
    name: PLAIN.name,
    description: PLAIN.description,
    startsGame: PLAIN.startsGame,
    characterHandles: PLAIN.characters,
    findCharacter: createFindSeedCharacter((args) => services.character.findByHandle(args)),
    createRosterPreset: createSeedRosterPreset((args) => services.rosterPreset.create(args)),
  });
  expect(await step(actor)).toBe(true);
  expect(await services.rosterPreset.list({ principal: actor })).toEqual([]);
});
