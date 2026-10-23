// The composed card-tag detach op carries the caller scope and applies it, so a foreign id reaches nothing.
// @subject packages/server/src/domain/tag/verbs/detach-card-tag-by-name.ts
// @subject packages/server/src/entry/compose/assets-character.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { characterTags } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

const LABEL = "op-scope-shared-label";

test("a foreign caller's scope on the detach op leaves the owner's card tag attached", async () => {
  await using root = await createServerHarness();
  const owner = await root.principalFor(root.ownerId);
  const foreign = await root.principalFor((await root.actor()).id);
  const owned = await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: "op-scope-owned", name: "Owned", description: "owned" }),
  });
  const theirs = await root.services.character.create({
    principal: foreign,
    input: createCharacterSchema.parse({ handle: "op-scope-foreign", name: "Theirs", description: "theirs" }),
  });
  const { attachCardTagByName, detachCardTagByName } = root.services.tag;
  expect(await attachCardTagByName({ ownerId: owner.userId, characterId: owned.id, tagName: LABEL })).toBe(true);
  expect(await attachCardTagByName({ ownerId: foreign.userId, characterId: theirs.id, tagName: LABEL })).toBe(true);
  const ownedLinks = async (): Promise<readonly unknown[]> =>
    await root.db.select({ tagId: characterTags.tagId }).from(characterTags).where(eq(characterTags.characterId, owned.id));
  const attached = await ownedLinks();
  expect(attached).toHaveLength(1);

  expect(await detachCardTagByName({ ownerId: foreign.userId, characterId: owned.id, tagName: LABEL })).toBe(false);
  expect(await ownedLinks()).toEqual(attached);
  expect(await detachCardTagByName({ ownerId: owner.userId, characterId: owned.id, tagName: LABEL })).toBe(true);
  expect(await ownedLinks()).toEqual([]);
});
