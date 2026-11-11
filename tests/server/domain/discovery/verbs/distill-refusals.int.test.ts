// @subject packages/server/src/domain/discovery/verbs/distill.ts
// The on-demand "Suggest tags" pass refuses in two ways, and the ORDER is the security property: a card the
// caller does not own answers the same not-found as an id that never existed, before any statement about the
// card's content. Reversed, the pair of refusals tells a stranger which card ids exist.
import { createCharacterSchema } from "@orb/contracts/character";
import { CARD_NOT_DISTILLABLE_REASON } from "@orb/contracts/discovery";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

test("a foreign or absent card id answers not-found, even when the foreign card has no content", async () => {
  await using root = await createServerHarness();
  const owner = await root.principalFor(root.ownerId);
  const stranger = await root.actor();
  const strangerCaller = await root.internalCallerFor(stranger.id);
  const nameOnly = await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: "name-only-keeper", name: "Name Only Keeper", description: "" }),
  });
  const written = await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: "written-keeper", name: "Written Keeper", description: "A keeper who holds the walls." }),
  });
  const absent = root.idSource.typeId(ID_PREFIX.character);

  for (const characterId of [nameOnly.id, written.id, absent]) {
    await expect(strangerCaller.discovery.suggestCharacterTags({ characterId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
});

test("an owned card with nothing but a name is refused as not distillable, not as a miss", async () => {
  await using root = await createServerHarness();
  const owner = await root.principalFor(root.ownerId);
  const ownerCaller = await root.internalCallerFor(root.ownerId);
  const nameOnly = await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: "bare-keeper", name: "Bare Keeper", description: "" }),
  });

  await expect(ownerCaller.discovery.suggestCharacterTags({ characterId: nameOnly.id })).rejects.toMatchObject({
    code: "BAD_REQUEST",
    cause: { code: CARD_NOT_DISTILLABLE_REASON },
  });
});
