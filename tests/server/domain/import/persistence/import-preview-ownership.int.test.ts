// The import preview names what the owner already has for every kind the loader recognizes. A library that
// imported one folder owns each of its items and none of a second folder's, so a dry run over both flags exactly
// the first folder's items, kind by kind.
// @subject packages/server/src/domain/import/loader/profile-ownership.ts
// @subject packages/server/src/domain/import/loader/profile-directory.ts
// @subject packages/server/src/domain/import/substrate/preview.ts

import { IMPORT_PREVIEW_KINDS } from "@orb/contracts/import";
import { expect, test } from "@orb/testkit/node";
import { admit, bothKindFolders, dryRun, finish, harness } from "./_st-tree-door.ts";

test.for(IMPORT_PREVIEW_KINDS)("a dry run flags the %s the library already holds and not the ones it lacks", async (kind) => {
  await using root = await harness();
  const { held, both, names } = bothKindFolders(root);
  await finish(root, await admit(root, held));

  const preview = await dryRun(root, both);

  const items = preview.kinds[kind].items;
  expect(items.filter((item) => item.inLibrary === true).map((item) => item.name)).toEqual(names.held[kind]);
  expect(items.filter((item) => item.inLibrary !== true).map((item) => item.name)).toEqual(names.fresh[kind]);
});

test("a dry run over a library that imported nothing flags no kind", async () => {
  await using root = await harness();
  const { both } = bothKindFolders(root);

  const preview = await dryRun(root, both);

  for (const kind of IMPORT_PREVIEW_KINDS) {
    expect(preview.kinds[kind].total).toBeGreaterThan(0);
    expect(preview.kinds[kind].items.filter((item) => item.inLibrary === true)).toEqual([]);
  }
});
