// A character is its content (D290): a card whose handle the owner holds but whose content matches no owned card
// lands beside the owned one, taking a suffix on its handle only. The preview says so, and an equal card is still
// the owner's.
// @subject packages/server/src/domain/import/loader/profile-ownership.ts
// @subject packages/server/src/domain/import/verbs/import-character.ts

import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { sql } from "drizzle-orm";
import type { Files } from "./_st-tree-door.ts";
import { admit, cardPng, dryRun, finishRun, harness, settings } from "./_st-tree-door.ts";

// Both cards slug to the handle `card`, from the one file name they share and from their names, which differ only in case.
const CARD_FILE = "characters/Card.png";
const HELD_NAME = "Card";
const NAMESAKE_NAME = "card";

function folderWith(card: Uint8Array): Files {
  return { [ST_SETTINGS_FILE]: settings({}), [CARD_FILE]: card };
}

async function handlesHeld(root: ServerTestHarness): Promise<readonly string[]> {
  const rows = await root.db.all<{ handle: string }>(sql`SELECT handle FROM characters WHERE imported_from IS NOT NULL ORDER BY handle`);
  return rows.map((row) => row.handle);
}

test("a card that takes a held card's handle with other content previews as a write, and the run lands it beside the held one", async () => {
  await using root = await harness();
  await finishRun(root, await admit(root, folderWith(cardPng(root, HELD_NAME))));
  expect(await handlesHeld(root)).toEqual(["card"]);
  const other = folderWith(cardPng(root, NAMESAKE_NAME));

  const preview = await dryRun(root, other);
  await finishRun(root, await admit(root, other));

  expect(preview.kinds.characters.items.map((item) => item.name)).toEqual([NAMESAKE_NAME]);
  expect(preview.kinds.characters.items.filter((item) => item.inLibrary === true || item.repeat === true)).toEqual([]);
  expect(await handlesHeld(root)).toEqual(["card", "card-2"]);
});

test("a card equal to the held card still previews as the owner's, and the run writes nothing", async () => {
  await using root = await harness();
  const owned = folderWith(cardPng(root, HELD_NAME));
  await finishRun(root, await admit(root, owned));

  const preview = await dryRun(root, owned);
  await finishRun(root, await admit(root, owned));

  expect(present(preview.kinds.characters.items[0]).inLibrary).toBe(true);
  expect(await handlesHeld(root)).toEqual(["card"]);
});
