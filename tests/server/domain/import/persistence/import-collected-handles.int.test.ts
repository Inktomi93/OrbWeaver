// A folder's preview names what the collector decided about handles: the card whose file name gives a handle an earlier card
// already holds, and the chat folder that joined a card by the name match because none carried the card's exact name.
// @subject packages/server/src/domain/import/loader/collect.ts
// @subject packages/server/src/domain/import/substrate/preview.ts

import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { admit, CHAT, cardPng, dryRun, finishRun, harness, settings } from "./_st-tree-door.ts";

// Two files whose names slug alike (`aria-vale`) and hold different cards. A chat folder named for that slug goes to the
// card that collects first, so the card left without the room is the one the preview must mark.
const FIRST_FILE = "characters/Aria Vale.png";
const SECOND_FILE = "characters/aria-vale.png";
const SHARED_HANDLE = "aria-vale";
const CARD_NAMES = ["Aria Vale", "Another Vale"] as const;

test("the card whose file name gives a held handle is the one a run leaves without the chat folder of that name, and its twin is not marked", async () => {
  await using root = await harness();
  const folder = {
    [ST_SETTINGS_FILE]: settings({}),
    [FIRST_FILE]: cardPng(root, CARD_NAMES[0]),
    [SECOND_FILE]: cardPng(root, CARD_NAMES[1]),
    [`chats/${SHARED_HANDLE}/one.jsonl`]: CHAT,
  };
  const preview = await dryRun(root, folder);
  await finishRun(root, await admit(root, folder));

  // The run is the witness of which card lost the handle: the one that holds no room.
  const caller = await root.internalCallerFor(root.ownerId);
  const characters = (await caller.character.list({})).items.filter((item) => CARD_NAMES.some((name) => name === item.name));
  expect(characters).toHaveLength(CARD_NAMES.length);
  const roomsHeld = await Promise.all(
    characters.map(async (item) => [item.name, (await caller.chat.listChats({ characterId: item.id })).items.length] as const),
  );
  const without = roomsHeld.filter(([, rooms]) => rooms === 0).map(([name]) => name);
  expect(without).toHaveLength(1);
  expect(roomsHeld.filter(([, rooms]) => rooms > 0)).toHaveLength(1);

  expect(preview.kinds.characters.items.filter((item) => item.collidedHandle !== undefined).map((item) => [item.name, item.collidedHandle])).toEqual([
    [...without, SHARED_HANDLE],
  ]);
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
