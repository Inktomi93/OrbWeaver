// @subject packages/server/src/domain/assets/verbs/seed-art.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { readSeedAvatar, SEED_MANIFEST } from "@orb/default-content";
import { createSeedAvatarOps } from "@orb/server/domain/assets";
import { expect, test } from "@orb/testkit/node";
import { seedCharacter } from "@orb/testkit/node/composed";
import { principal } from "@orb/testkit/node/helpers";

const SHIPPED = SEED_MANIFEST.find((item) => item.kind === "character");
if (SHIPPED === undefined) {
  throw new Error("the seed manifest ships no character");
}
const CARD = { input: createCharacterSchema.parse({ handle: SHIPPED.handle, name: "Shipped art subject", description: "A card wearing shipped art." }) };

test("truncated real shipped art is refused by the production magic guard before a CAS index row lands", async ({ harness, services }) => {
  const user = await harness.actor();
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

test("seed gallery keeps the actual Principal and refuses a foreign subject while owned repeats deduplicate", async ({ harness, services }) => {
  const owner = await harness.actor();
  const stranger = await harness.actor();
  const actor = await principal(harness, owner.id);
  const neighbor = await principal(harness, stranger.id);
  const { view: card } = await seedCharacter(harness, { principal: actor, input: CARD.input });
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
