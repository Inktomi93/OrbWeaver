// A folder's preview names what the collector decided about handles: the card that lost its file name's handle to an earlier
// card, and the chat folder that joined a card by the name match because none carried the card's exact name.
// @subject packages/server/src/domain/import/loader/collect.ts
// @subject packages/server/src/domain/import/substrate/preview.ts

import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { CHAT, cardPng, dryRun, harness, settings } from "./_st-tree-door.ts";

// Two files whose names slug alike (`aria-vale`) and hold different cards: the second to collect takes `aria-vale-2`.
const FIRST_FILE = "characters/Aria Vale.png";
const SECOND_FILE = "characters/aria-vale.png";
const COLLIDED_SLUG = "aria-vale-2";

test("the card that lost its file name's handle to another card previews with the handle it takes, and its twin previews with none", async () => {
  await using root = await harness();
  const preview = await dryRun(root, {
    [ST_SETTINGS_FILE]: settings({}),
    [FIRST_FILE]: cardPng(root, "Aria Vale"),
    [SECOND_FILE]: cardPng(root, "Another Vale"),
  });

  const collided = preview.kinds.characters.items.filter((item) => item.collidedHandle !== undefined);
  expect(collided.map((item) => item.collidedHandle)).toEqual([COLLIDED_SLUG]);
  expect(preview.kinds.characters.items.filter((item) => item.collidedHandle === undefined)).toHaveLength(1);
});

test("a chat folder with a trailing number previews on the card it joined, and a folder with the card's exact name joins nothing by name", async () => {
  await using root = await harness();
  const folder = "Aria 7";
  const preview = await dryRun(root, {
    [ST_SETTINGS_FILE]: settings({}),
    "characters/Aria.png": cardPng(root, "Aria"),
    [`chats/${folder}/one.jsonl`]: CHAT,
  });
  expect(present(preview.kinds.characters.items[0]).pairedChatFolders).toEqual([folder]);

  // The control: the folder carries the card's own name, so it pairs exactly and the preview says nothing about it.
  const exact = await dryRun(root, {
    [ST_SETTINGS_FILE]: settings({}),
    "characters/Aria.png": cardPng(root, "Aria"),
    "chats/Aria/one.jsonl": CHAT,
  });
  expect(present(exact.kinds.characters.items[0]).pairedChatFolders).toBeUndefined();
  expect(present(exact.kinds.characters.items[0]).collidedHandle).toBeUndefined();
});
