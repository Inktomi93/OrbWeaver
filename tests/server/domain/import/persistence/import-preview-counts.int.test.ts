// The folder preview and the real import's result count the folder the same way: one count per kind feeds
// both, so the number a person confirms is the number the run reports.
// @subject packages/server/src/domain/import/loader/profile-directory.ts
// @subject packages/server/src/domain/import/substrate/preview.ts

import { IMPORT_PREVIEW_KINDS, mergeImportPreviews, ST_SETTINGS_FILE } from "@orb/contracts/import";
import { createBookSchema, createEntrySchema } from "@orb/contracts/world-info";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { admit, bothKindFolders, cardPng, chatOf, dryRun, finishRun, harness, settings } from "./_st-tree-door.ts";

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

test("a group the run refuses counts once in scanned, and its transcripts are not chats", async () => {
  await using root = await harness();
  const files = {
    [ST_SETTINGS_FILE]: settings({}),
    "characters/Aria.png": cardPng(root, "Aria"),
    "chats/Aria/one.jsonl": chatOf("Aria greets you."),
    // No member of this group is in the folder, so the run seats no room for its three transcripts.
    "groups/ghosts.json": JSON.stringify({ name: "Ghosts", members: ["Ghost.png"], chats: ["a", "b", "c"] }),
    "group chats/a.jsonl": chatOf("First."),
    "group chats/b.jsonl": chatOf("Second."),
    "group chats/c.jsonl": chatOf("Third."),
  };

  const preview = await dryRun(root, files);
  const imported = await finishRun(root, await admit(root, files));

  expect(imported.found).toMatchObject({ characters: 1, chats: 1, groups: 0 });
  // One character, one chat, and the refused group as the one skip: never the group plus its three transcripts.
  expect(imported.scanned).toBe(3);
  expect(preview.skipped.items.map((item) => item.source.path)).toContain("groups/ghosts.json");
  expect(preview.kinds.chats.total).toBe(imported.found?.chats);
});

const TWIN_BOOK = "Twin Atlas";

/** Two exports of one library book, taken before and after it gained an entry: one name, two contents. The
 *  library ends holding the later content. */
async function twinBookExports(root: ServerTestHarness): Promise<{ readonly earlier: Uint8Array; readonly later: Uint8Array }> {
  const principal = await root.principalFor(root.ownerId);
  const { worldInfo } = root.services;
  const book = await worldInfo.createBook({ principal, input: createBookSchema.parse({ name: TWIN_BOOK }) });
  const exported = async (): Promise<Uint8Array> => present(await worldInfo.exportBook({ principal, bookId: book.id })).bytes;
  await worldInfo.createEntry({ principal, bookId: book.id, input: createEntrySchema.parse({ title: "North", content: "The north shore.", keys: ["north"] }) });
  const earlier = await exported();
  await worldInfo.createEntry({ principal, bookId: book.id, input: createEntrySchema.parse({ title: "South", content: "The south shore.", keys: ["south"] }) });
  return { earlier, later: await exported() };
}

test("two world books in one folder that share a name are two entries in the merged preview, each with its own verdict", async () => {
  await using root = await harness();
  const { earlier, later } = await twinBookExports(root);
  const files = { [ST_SETTINGS_FILE]: settings({}), "worlds/atlas-earlier.json": earlier, "worlds/atlas-later.json": later };

  // The merge is what a person reads: the client folds every upload's preview through it, a lone upload included.
  const shown = mergeImportPreviews([await dryRun(root, files)]);
  const imported = await finishRun(root, await admit(root, files));

  expect(shown.kinds.worlds.items.map(({ source, ...rest }) => ({ path: source.path, ...rest })).toSorted((a, b) => a.path.localeCompare(b.path))).toEqual([
    { path: "worlds/atlas-earlier.json", name: TWIN_BOOK, sourceDigest: expect.any(String), identities: [expect.any(String)] },
    { path: "worlds/atlas-later.json", name: TWIN_BOOK, sourceDigest: expect.any(String), inLibrary: true, identities: [expect.any(String)] },
  ]);
  expect(shown.kinds.worlds.total).toBe(2);
  expect(present(imported.found).worlds).toBe(2);
});
