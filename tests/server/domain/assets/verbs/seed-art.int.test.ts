// @subject packages/server/src/domain/assets/verbs/seed-art.ts

import { readSeedAvatar } from "@orb/default-content";
import { createSeedAvatarOps } from "@orb/server/domain/assets";
import { DEFAULT_CHARACTER_CARDS } from "@orb/server/domain/character";
import { seedCharacter } from "@orb/testkit/node/factories/character.ts";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

const CARD = DEFAULT_CHARACTER_CARDS[0];
if (CARD === undefined) {
  throw new Error("the authored card pack is empty");
}

test("truncated real shipped art is refused by the production magic guard before a CAS index row lands", async ({ harness, db, services }) => {
  const user = await seedUser(db);
  const actor = await principal(harness, user.id);
  const art = await readSeedAvatar(CARD.input.handle);
  if (art === null) {
    throw new Error("the authored card ships no testable avatar");
  }
  const ops = createSeedAvatarOps({
    readAvatar: () => Promise.resolve({ ...art, bytes: art.bytes.subarray(0, 3) }),
    store: (args) => services.assets.store(args),
    addToGallery: (args) => services.assets.addToGallery(args),
  });
  await expect(ops.character.storeAvatar(actor, CARD.input.handle)).rejects.toThrow();
  expect(await services.assets.listOwned({ principal: actor, limit: 100 })).toEqual([]);
  const valid = createSeedAvatarOps({
    readAvatar: readSeedAvatar,
    store: (args) => services.assets.store(args),
    addToGallery: (args) => services.assets.addToGallery(args),
  });
  expect(await valid.character.storeAvatar(actor, CARD.input.handle)).not.toBeNull();
  expect(await services.assets.listOwned({ principal: actor, limit: 100 })).toMatchObject([{ kind: "avatar", mime: art.mime }]);
});

test("seed gallery keeps the actual Principal and refuses a foreign subject while owned repeats deduplicate", async ({ harness, db, services }) => {
  const owner = await seedUser(db);
  const stranger = await seedUser(db);
  const actor = await principal(harness, owner.id);
  const neighbor = await principal(harness, stranger.id);
  const card = await seedCharacter(db, { ownerId: owner.id });
  const ops = createSeedAvatarOps({
    readAvatar: readSeedAvatar,
    store: (args) => services.assets.store(args),
    addToGallery: (args) => services.assets.addToGallery(args),
  });
  await expect(ops.character.seedGallery(neighbor, card.id, CARD.input.handle)).rejects.toThrow();
  expect(await services.assets.listGallery({ principal: neighbor, subjectCharacterId: card.id, limit: 100 })).toEqual([]);
  await ops.character.seedGallery(actor, card.id, CARD.input.handle);
  const first = await services.assets.listGallery({ principal: actor, subjectCharacterId: card.id, limit: 100 });
  expect(first).toHaveLength(1);
  expect(first[0]?.subjectCharacterId).toBe(card.id);
  await ops.character.seedGallery(actor, card.id, CARD.input.handle);
  expect(await services.assets.listGallery({ principal: actor, subjectCharacterId: card.id, limit: 100 })).toEqual(first);
});
