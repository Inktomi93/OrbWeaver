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
