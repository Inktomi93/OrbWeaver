// The folder preview and the real import's result count the folder the same way: one count per kind feeds
// both, so the number a person confirms is the number the run reports.
// @subject packages/server/src/domain/import/loader/profile-directory.ts
// @subject packages/server/src/domain/import/substrate/preview.ts

import { IMPORT_PREVIEW_KINDS } from "@orb/contracts/import";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { admit, bothKindFolders, dryRun, finishRun, harness } from "./_st-tree-door.ts";

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

test("a rerun over a library that already holds the folder counts the same folder", async () => {
  await using root = await harness();
  const { both } = bothKindFolders(root);
  const first = await finishRun(root, await admit(root, both));

  const again = await finishRun(root, await admit(root, both));

  expect(present(first.found).characters).toBeGreaterThan(0);
  expect(again.found).toEqual(first.found);
  expect(again.changed).toBe(0);
});
