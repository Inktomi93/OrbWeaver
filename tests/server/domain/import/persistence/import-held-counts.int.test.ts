// A SillyTavern folder run reports the entries the library already held as held, in the units it reports what the
// folder holds, and counts as skipped only the entries it never attempted.
// @subject packages/server/src/domain/import/loader/profile-directory.ts
// @subject packages/server/src/domain/import/loader/workload-drivers.ts

import { IMPORT_PREVIEW_KINDS } from "@orb/contracts/import";
import { expect, test } from "@orb/testkit/node";
import { admit, bothKindFolders, chatOf, finishRun, harness } from "./_st-tree-door.ts";

test("a re-run of an unchanged folder stores every entry as held and only the refused group as skipped", async () => {
  await using root = await harness();
  const { held } = bothKindFolders(root);
  // A group no card seats is refused before any write: the one entry the run never attempts.
  const folder = {
    ...held,
    "groups/memberless.json": JSON.stringify({ name: "Memberless", members: ["Ghost.png"], chats: ["ghost-room"] }),
    "group chats/ghost-room.jsonl": chatOf("Nobody to seat."),
  };

  const first = await finishRun(root, await admit(root, folder));
  const again = await finishRun(root, await admit(root, folder));

  const entries = IMPORT_PREVIEW_KINDS.reduce((sum, kind) => sum + (again.found?.[kind] ?? 0), 0);
  // The control: a first run into an empty library holds nothing and writes every entry.
  expect(first).toMatchObject({ inLibrary: 0, skipped: 1 });
  expect(first.changed).toBeGreaterThan(0);
  expect(entries).toBeGreaterThan(0);
  expect(again).toMatchObject({ changed: 0, inLibrary: entries, skipped: 1 });
});

test("a re-run after the owner removed rows stores what the waves reused, counting a repeat of the upload as held", async () => {
  await using root = await harness();
  const principal = await root.principalFor(root.ownerId);
  const { held, names } = bothKindFolders(root);
  const book = held["worlds/Eldoria.json"];
  if (book === undefined) {
    throw new Error("the kind folder carries no world book");
  }
  // The same lore under a second file name: the world wave reuses the book the first file lands.
  const folder = { ...held, "worlds/Eldoria2.json": book };

  const first = await finishRun(root, await admit(root, folder));
  const entries = IMPORT_PREVIEW_KINDS.reduce((sum, kind) => sum + (first.found?.[kind] ?? 0), 0);
  expect(first).toMatchObject({ inLibrary: 1, skipped: 0 });

  const books = await root.services.worldInfo.listBooks({ principal });
  const presets = await root.services.preset.list({ userId: root.ownerId });
  const [eldoria] = books.filter(({ name }) => names.held.worlds.includes(name));
  const [preset] = presets.filter(({ name }) => names.held.presets.includes(name));
  if (eldoria === undefined || preset === undefined) {
    throw new Error(`the first run landed no held book or preset: ${JSON.stringify([books.map((b) => b.name), presets.map((p) => p.name)])}`);
  }
  await root.services.worldInfo.removeBook({ principal, bookId: eldoria.id });
  await root.services.preset.remove({ userId: root.ownerId, id: preset.id });

  const again = await finishRun(root, await admit(root, folder));

  // The removed book and preset are written again; every other entry, and the repeat, is reused.
  expect(again).toMatchObject({ changed: 2, inLibrary: entries - 2, skipped: 0 });
});
