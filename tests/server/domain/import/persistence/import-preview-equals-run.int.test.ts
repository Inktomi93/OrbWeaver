// The preview of a library kind states exactly the rows the run adds: an entry the owner holds and a repeat of an
// earlier entry of the same upload write nothing, and every other entry writes one row. Books, presets, themes and
// personas are judged by the write's own batch op in dry-run mode, so the two cannot disagree.
// @subject packages/server/src/domain/import/loader/profile-ownership.ts
// @subject packages/server/src/domain/preset/verbs/import.ts
// @subject packages/server/src/domain/settings/verbs/import-theme.ts
// @subject packages/server/src/domain/world-info/persistence/import-write.ts
// @subject packages/server/src/domain/persona/persistence/import-write.ts

import type { ImportPreviewKind } from "@orb/contracts/import";
import { personas, presets, themes, worldBooks } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { admit, bothKindFolders, dryRun, finish, harness, inProfile, namesakeFolder } from "./_st-tree-door.ts";

// The library kinds whose preview comes from a write's dry run, each with the table its rows land in.
const KINDS = [
  { kind: "worlds", table: worldBooks, namesake: true },
  { kind: "presets", table: presets, namesake: true },
  { kind: "themes", table: themes, namesake: true },
  // A namesake persona merges into the held persona by default, so it writes nothing and would read as a library hit.
  { kind: "personas", table: personas, namesake: false },
] as const satisfies readonly { readonly kind: ImportPreviewKind; readonly table: unknown; readonly namesake: boolean }[];

async function ownedRows(root: ServerTestHarness, table: (typeof KINDS)[number]["table"]): Promise<number> {
  return (await root.db.select({ ownerId: table.ownerId }).from(table).where(eq(table.ownerId, root.ownerId))).length;
}

test.for(KINDS)("the $kind preview writes the rows the run adds, a held entry and an in-upload repeat writing none", async ({ kind, table, namesake }) => {
  await using root = await harness();
  const { held, fresh } = bothKindFolders(root);
  await finish(root, await admit(root, held));
  // Held content, new content, the same new content again, and new content under a held name.
  const upload = {
    ...inProfile("a", held),
    ...inProfile("b", fresh),
    ...inProfile("c", fresh),
    ...(namesake ? inProfile("d", namesakeFolder(root)) : {}),
  };

  const preview = await dryRun(root, upload);
  const before = await ownedRows(root, table);
  await finish(root, await admit(root, upload));
  const added = (await ownedRows(root, table)) - before;

  expect(preview.kinds[kind].counts).toMatchObject({ inLibrary: 1, repeat: 1, writes: namesake ? 2 : 1 });
  expect(added).toBe(preview.kinds[kind].counts.writes);
});
