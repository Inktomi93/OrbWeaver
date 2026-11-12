// The import preview names what the owner already has for every kind the loader recognizes. A library that
// imported one folder owns each of its items and none of a second folder's; an item is held by its content, never
// its name, and a transcript only under the character that holds it.
// @subject packages/server/src/domain/import/loader/profile-ownership.ts
// @subject packages/server/src/domain/import/loader/profile-directory.ts
// @subject packages/server/src/domain/import/substrate/preview.ts

import type { ImportPreviewKind } from "@orb/contracts/import";
import { IMPORT_PREVIEW_KINDS, ST_SETTINGS_FILE } from "@orb/contracts/import";
import { forEachNonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { admit, bothKindFolders, cardPng, chatOf, dryRun, finish, finishRun, harness, inProfile, namesakeFolder, settings } from "./_st-tree-door.ts";

// Every kind whose ownership comes from an owner domain's read. Characters keep the one lookup every door uses.
const OWNED_KINDS = IMPORT_PREVIEW_KINDS.filter((kind): kind is Exclude<ImportPreviewKind, "characters"> => kind !== "characters");
const NAMESAKE_KINDS = ["personas", "worlds", "presets", "themes", "backgrounds"] as const satisfies readonly ImportPreviewKind[];

forEachNonEmpty(OWNED_KINDS, "owned preview kinds", (kind) => {
  test(`a dry run flags the ${kind} the library already holds and not the ones it lacks`, async () => {
    await using root = await harness();
    const { held, both, names } = bothKindFolders(root);
    await finish(root, await admit(root, held));

    const preview = await dryRun(root, both);

    const items = preview.kinds[kind].items;
    expect(items.filter((item) => item.inLibrary === true).map((item) => item.name)).toEqual(names.held[kind]);
    expect(items.filter((item) => item.inLibrary !== true).map((item) => item.name)).toEqual(names.fresh[kind]);
  });
});

test.for(NAMESAKE_KINDS)("a %s item that shares a held item's name but not its content is not flagged", async (kind) => {
  await using root = await harness();
  const { held, names } = bothKindFolders(root);
  await finish(root, await admit(root, held));
  // The control: the held folder's own item reads as held, so the namesake's verdict is the content's.
  const control = await dryRun(root, held);
  expect(control.kinds[kind].items.filter((item) => item.inLibrary === true).map((item) => item.name)).toEqual(names.held[kind]);

  const preview = await dryRun(root, namesakeFolder(root));

  expect(preview.kinds[kind].items.map((item) => item.name)).toEqual(names.held[kind]);
  expect(preview.kinds[kind].items.filter((item) => item.inLibrary === true)).toEqual([]);
});

test("a transcript the owner holds under one character is not flagged under another character", async () => {
  await using root = await harness();
  const aria = cardPng(root, "Aria");
  const bram = cardPng(root, "Bram");
  const shared = chatOf("A line both folders carry.");
  await finish(
    root,
    await admit(root, { [ST_SETTINGS_FILE]: settings({}), "characters/Aria.png": aria, "characters/Bram.png": bram, "chats/Aria/shared.jsonl": shared }),
  );

  const preview = await dryRun(root, {
    [ST_SETTINGS_FILE]: settings({}),
    "characters/Aria.png": aria,
    "characters/Bram.png": bram,
    "chats/Aria/shared.jsonl": shared,
    "chats/Bram/shared.jsonl": shared,
  });

  const flagged = (held: boolean): string[] => preview.kinds.chats.items.filter((item) => (item.inLibrary === true) === held).map((item) => item.name);
  expect(flagged(true)).toEqual(["Aria: shared"]);
  expect(flagged(false)).toEqual(["Bram: shared"]);
});

test("two profiles that share a path keep their own verdicts", async () => {
  await using root = await harness();
  const aria = cardPng(root, "Aria");
  const alice = { [ST_SETTINGS_FILE]: settings({}), "characters/Aria.png": aria, "chats/Aria/shared.jsonl": chatOf("Alice's line.") };
  const bob = { [ST_SETTINGS_FILE]: settings({}), "characters/Aria.png": aria, "chats/Aria/shared.jsonl": chatOf("Bob's line.") };
  await finish(root, await admit(root, inProfile("alice", alice)));

  // Both profiles carry `chats/Aria/shared.jsonl`; only alice's transcript is the one the library holds.
  const preview = await dryRun(root, { ...inProfile("alice", alice), ...inProfile("bob", bob) });

  expect(preview.kinds.chats.total).toBe(2);
  expect(preview.kinds.chats.items.filter((item) => item.inLibrary === true)).toHaveLength(1);
});

test("a group the run refuses is a skip, not a new room, and the preview counts what the run counts", async () => {
  await using root = await harness();
  const { fresh } = bothKindFolders(root);
  const roomless = { name: "Roomless", members: ["Bram.png"], chats: [] };
  const memberless = { name: "Memberless", members: ["Ghost.png"], chats: ["ghost-room"] };
  const files = {
    ...fresh,
    "groups/roomless.json": JSON.stringify(roomless),
    "groups/memberless.json": JSON.stringify(memberless),
    "group chats/ghost-room.jsonl": chatOf("Nobody to seat."),
  };

  const preview = await dryRun(root, files);
  const imported = await finishRun(root, await admit(root, files));

  // The control: the folder's valid group is the one room, and its transcript is the only group transcript.
  expect(preview.kinds.groups.items.map((item) => item.name)).toEqual(["Fresh Group"]);
  expect(preview.skipped.items.map((item) => item.source)).toEqual(expect.arrayContaining(["groups/roomless.json", "groups/memberless.json"]));
  expect(imported.found).toMatchObject({ groups: preview.kinds.groups.total, chats: preview.kinds.chats.total });
  expect(preview.kinds.chats.items.map((item) => item.name)).not.toContain("Memberless: ghost-room");
});
