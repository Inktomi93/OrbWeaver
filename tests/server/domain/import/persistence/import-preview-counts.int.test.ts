// The folder preview and the real import's result count the folder the same way: one count per kind feeds
// both, so the number a person confirms is the number the run reports.
// @subject packages/server/src/domain/import/loader/profile-directory.ts
// @subject packages/server/src/domain/import/substrate/preview.ts

import { IMPORT_PREVIEW_KINDS, ST_SETTINGS_FILE } from "@orb/contracts/import";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { admit, bothKindFolders, chatOf, dryRun, finishRun, harness, settings } from "./_st-tree-door.ts";

test("a folder's preview totals equal the real import's counts, kind by kind", async () => {
  await using root = await harness();
  const { both } = bothKindFolders(root);

  const preview = await dryRun(root, both);
  const imported = await finishRun(root, await admit(root, both));

  const found = present(imported.found);
  for (const kind of IMPORT_PREVIEW_KINDS) {
    // The control: a kind with nothing in it would make the equality hold for any count.
    expect(preview.kinds[kind].total).toBeGreaterThan(0);
    expect(found[kind]).toBe(preview.kinds[kind].total);
  }
});

test("a library that already holds the folder reports the same counts the preview lists, with nothing new", async () => {
  await using root = await harness();
  const { both } = bothKindFolders(root);
  const first = await finishRun(root, await admit(root, both));

  const preview = await dryRun(root, both);
  const again = await finishRun(root, await admit(root, both));

  expect(first.changed).toBeGreaterThan(0);
  expect(again.changed).toBe(0);
  for (const kind of IMPORT_PREVIEW_KINDS) {
    expect(present(again.found)[kind]).toBe(preview.kinds[kind].total);
  }
});

test("an orphan chat directory is examined once: its placeholder and its transcript are the two entities", async () => {
  await using root = await harness();
  const files = { [ST_SETTINGS_FILE]: settings({}), "chats/Wanderer/orphan.jsonl": chatOf("A lone transcript.") };

  const imported = await finishRun(root, await admit(root, files));

  expect(imported.found).toMatchObject({ orphans: 1, chats: 1 });
  expect(imported.scanned).toBe(2);
  expect(imported.changed).toBe(2);
});
