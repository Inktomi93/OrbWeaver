// @subject packages/server/src/domain/roster-preset/verbs/seed.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { rosterPresets } from "@orb/db";
import { SEED_MANIFEST } from "@orb/default-content";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, refuseWrites, seedCharacter } from "@orb/testkit/node/composed";
import { principal } from "@orb/testkit/node/helpers";
import { vi } from "vitest";

const CAMPAIGN = SEED_MANIFEST.find((item) => item.kind === "rosterPreset" && item.startsGame);
const PLAIN = SEED_MANIFEST.find((item) => item.kind === "rosterPreset" && !item.startsGame);
if (CAMPAIGN?.kind !== "rosterPreset" || PLAIN?.kind !== "rosterPreset") {
  throw new Error("the canonical manifest must contain its plain and campaign rosters");
}

test("authored campaign and plain steps preserve the receiving Principal, owned character order and real game interpretation", async ({
  harness,
  app,
  services,
}) => {
  const owner = await harness.actor();
  const neighbor = await harness.actor();
  const actor = await principal(harness, owner.id);
  const neighborActor = await principal(harness, neighbor.id);
  for (const handle of new Set([...CAMPAIGN.characters, ...PLAIN.characters])) {
    await seedCharacter(harness, { principal: neighborActor, input: createCharacterSchema.parse({ handle, name: handle, description: "" }) });
  }
  await app.contentSeeder.ensureSeeded(actor);
  for (const item of [CAMPAIGN, PLAIN]) {
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
  expect(await services.rosterPreset.list({ principal: neighborActor })).toEqual([]);
});

test("all-deleted authored seats settle without a roster write, never filling the vacancy with another user's same handles", async ({
  harness,
  db,
  clock,
  app,
  services,
}) => {
  const owner = await harness.actor();
  const neighbor = await harness.actor();
  const actor = await principal(harness, owner.id);
  const neighborActor = await principal(harness, neighbor.id);
  for (const handle of PLAIN.characters) {
    await seedCharacter(harness, { principal: neighborActor, input: createCharacterSchema.parse({ handle, name: handle, description: "" }) });
  }
  // A refused roster write leaves every roster step unrecorded while the shipped cards land and record.
  await using refusal = await refuseWrites(db, { table: rosterPresets, event: "INSERT", message: "roster refused" });
  await app.contentSeeder.ensureSeeded(actor);
  await refusal.lift();
  expect(await services.rosterPreset.list({ principal: actor })).toEqual([]);
  for (const handle of PLAIN.characters) {
    const card = await services.character.findByHandle({ ownerId: owner.id, handle });
    if (card === null) {
      throw new Error("the real manifest seed did not land an authored seat");
    }
    await services.character.remove({ principal: actor, characterId: card.characterId });
  }
  await app.contentSeeder.ensureSeeded(actor);
  expect((await services.rosterPreset.list({ principal: actor })).find((row) => row.name === PLAIN.name)).toBeUndefined();
  // The vacant roster settled and recorded its key, so even a restarted server's cold pass looks no seat up.
  await using restarted = await createServerHarness({ db, ownerId: harness.ownerId, clock, ids: harness.ids });
  const reads = vi.spyOn(restarted.services.character, "findByHandle");
  await restarted.app.contentSeeder.ensureSeeded(await restarted.principalFor(owner.id));
  expect(reads).not.toHaveBeenCalled();
});
