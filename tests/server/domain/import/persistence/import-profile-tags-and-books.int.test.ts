// A folder of several SillyTavern profiles lands each card with the library tags and extra books its own profile gave
// it: two profiles that keep different cards under one filename never lend each other their tags or books.
// @subject packages/server/src/entry/http/import-tree.ts
// @subject packages/server/src/domain/import/loader/profile-directory.ts

import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import type { CharacterId } from "@orb/kit/ids";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import type { Files } from "./_st-tree-door.ts";
import { admit, cardPng, finishRun, harness, inProfile } from "./_st-tree-door.ts";

const ALICE = "alice";
const BOB = "bob";
const SHARED_CARD_FILE = "Card.png";
const SHARED_CARD_STEM = "Card";

const tagOf = (who: string): string => `${who} tag`;
const bookOf = (who: string): string => `${who} lore`;
const cardOf = (who: string): string => `${who} card`;

/** One profile: a card under the shared filename, a tag and an extra book that only this profile gives it. Tag ids are
 *  per profile in SillyTavern, so both profiles use the same id for different tags. */
function profileFiles(root: ServerTestHarness, who: string): Files {
  return {
    [ST_SETTINGS_FILE]: JSON.stringify({
      tags: [{ id: "1", name: tagOf(who) }],
      ["tag_map"]: { [SHARED_CARD_FILE]: ["1"] },
      ["world_info_settings"]: { ["world_info"]: { charLore: [{ name: SHARED_CARD_STEM, extraBooks: [bookOf(who)] }] } },
    }),
    [`characters/${SHARED_CARD_FILE}`]: cardPng(root, cardOf(who)),
    [`worlds/${bookOf(who)}.json`]: JSON.stringify({ entries: { "0": { uid: 0, key: [who], comment: who, content: `${who} lore.`, order: 100 } } }),
  };
}

async function characterNamed(root: ServerTestHarness, name: string): Promise<CharacterId> {
  const caller = await root.internalCallerFor(root.ownerId);
  const found = (await caller.character.list({})).items.filter((item) => item.name === name);
  const [first] = found;
  if (first === undefined || found.length !== 1) {
    throw new Error(`expected exactly one character named ${name}, found ${found.length}`);
  }
  return first.id;
}

/** What a character wears after the import, read through the product's own verbs. */
async function wornBy(root: ServerTestHarness, name: string): Promise<{ readonly tags: string[]; readonly books: string[] }> {
  const caller = await root.internalCallerFor(root.ownerId);
  const characterId = await characterNamed(root, name);
  return {
    tags: (await caller.character.get({ characterId })).tags.map((tag) => tag.name).toSorted(),
    books: (await caller.worldInfo.listForCharacter({ characterId })).map((book) => book.name).toSorted(),
  };
}

test("two profiles that keep different cards under one filename give each card only its own tags and extra books", async () => {
  await using root = await harness();
  const files = { ...inProfile(ALICE, profileFiles(root, ALICE)), ...inProfile(BOB, profileFiles(root, BOB)) };

  const imported = await finishRun(root, await admit(root, files));

  // The control: both cards landed as two characters, and the run attached both profiles' books.
  expect(present(imported.found).characters).toBe(2);
  expect(await wornBy(root, cardOf(ALICE))).toEqual({ tags: [tagOf(ALICE)], books: [bookOf(ALICE)] });
  expect(await wornBy(root, cardOf(BOB))).toEqual({ tags: [tagOf(BOB)], books: [bookOf(BOB)] });
});
