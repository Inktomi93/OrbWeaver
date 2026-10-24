// A recorded deleted card stays deleted across a cold seed: its character_tags rows keep their seeded source
// and status, and the user_seed_ledger keeps the deletion entry.
// @subject packages/server/src/domain/settings/seeder/content.ts
// @subject packages/server/src/entry/boot/seed-user-content.ts
// @subject packages/server/src/domain/tag/verbs/seed-tag.ts

import { characterTags, tags, userSeedLedger } from "@orb/db";
import { DEFAULT_CHARACTER_CARDS } from "@orb/server/domain/character";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { principal } from "@orb/testkit/node/helpers";
import { and, eq } from "drizzle-orm";
import { FIRST_CARD } from "../seeder/content.fixtures.ts";

test("a recorded deleted card stays deleted across a cold seed; its real tag rows remain card/pending suggestions", async ({
  harness,
  db,
  app,
  services,
  clock,
}) => {
  const user = await harness.actor();
  const actor = await principal(harness, user.id);
  await app.contentSeeder.ensureSeeded(actor);
  const card = await services.character.findByHandle({ ownerId: user.id, handle: FIRST_CARD.handle });
  if (card === null) {
    throw new Error("the real manifest seed did not create its first card");
  }
  const authored = DEFAULT_CHARACTER_CARDS.find((row) => row.input.handle === FIRST_CARD.handle);
  const attached = await db
    .select({ name: tags.name, source: tags.source, ownerId: tags.ownerId, status: characterTags.status })
    .from(characterTags)
    .innerJoin(tags, eq(tags.id, characterTags.tagId))
    .where(eq(characterTags.characterId, card.characterId));
  expect(attached.map((row) => row.name).toSorted()).toEqual(authored?.tags.toSorted());
  expect(attached.length).toBeGreaterThan(0);
  expect(attached.every((row) => row.source === "card" && row.status === "pending" && row.ownerId === user.id)).toBe(true);
  await services.character.remove({ principal: actor, characterId: card.characterId });
  // A restarted server on the same database is the cold seed: its seeder has settled no pass in this process.
  await using restarted = await createServerHarness({ db, ownerId: harness.ownerId, clock, ids: harness.ids });
  await restarted.app.contentSeeder.ensureSeeded(await restarted.principalFor(user.id));
  expect(await services.character.findByHandle({ ownerId: user.id, handle: FIRST_CARD.handle })).toBeNull();
  expect(
    await db
      .select()
      .from(userSeedLedger)
      .where(and(eq(userSeedLedger.userId, user.id), eq(userSeedLedger.itemKey, FIRST_CARD.key))),
  ).toHaveLength(1);
});
