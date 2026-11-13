// An upload that holds several profile directories previews every profile's entries: a file two profiles keep at the
// same relative path is two entries in the preview a person reads, and the numbers match what the run finds and writes.
// @subject packages/server/src/entry/http/import-tree.ts
// @subject packages/server/src/domain/import/loader/profile-directory.ts
// @subject packages/server/src/domain/import/substrate/preview.ts
// @subject packages/contracts/src/import/preview.ts

import type { ImportPreview, ImportPreviewItem, ImportPreviewKind } from "@orb/contracts/import";
import { IMPORT_PREVIEW_KINDS, IMPORT_PREVIEW_TEXT_MAX, mergeImportPreviews, ST_SETTINGS_FILE } from "@orb/contracts/import";
import { ID_PREFIX } from "@orb/kit/ids";
import { forEachNonEmpty, nonEmpty, present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { makeAssetBytes } from "@orb/testkit/node/composed";
import { sql } from "drizzle-orm";
import type { Files } from "./_st-tree-door.ts";
import { admit, cardPng, chatOf, dryRun, finish, finishRun, harness, inProfile, presetOf, settings, themeOf } from "./_st-tree-door.ts";

const ALICE = "alice";
const BOB = "bob";
const GROUP_LEAF = "room";

// Personas merge by name and two same-named orphan directories share one placeholder, so only the other kinds write
// what they list; every kind still lists and counts per profile.
type WrittenKind = Exclude<ImportPreviewKind, "personas" | "orphans">;
const WRITTEN_KINDS = IMPORT_PREVIEW_KINDS.filter((kind): kind is WrittenKind => kind !== "personas" && kind !== "orphans");

/** One profile's files. Every profile lays the same relative path for every kind, with content of its own. */
function profileFiles(root: ServerTestHarness, who: string, withOrphan: boolean): Files {
  return {
    [ST_SETTINGS_FILE]: settings({ "me.png": `${who} persona` }),
    "characters/Card.png": cardPng(root, `${who} card`),
    "chats/Card/solo.jsonl": chatOf(`${who} solo`),
    "worlds/Atlas.json": JSON.stringify({ entries: { "0": { uid: 0, key: [who], comment: who, content: `${who} lore.`, order: 100 } } }),
    "OpenAI Settings/Plain.json": presetOf(`You are ${who}.`),
    "themes/Plain.json": themeOf("Plain", `rgba(${who.length}0, 20, 40, 1)`),
    "backgrounds/Plain.png": new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))),
    "groups/crew.json": JSON.stringify({ name: `${who} crew`, members: ["Card.png"], chats: [GROUP_LEAF] }),
    [`group chats/${GROUP_LEAF}.jsonl`]: chatOf(`${who} room`),
    ...(withOrphan ? { "chats/Wanderer/orphan.jsonl": chatOf(`${who} orphan`) } : {}),
  };
}

function twoProfiles(root: ServerTestHarness, withOrphan: boolean): Files {
  return { ...inProfile(ALICE, profileFiles(root, ALICE, withOrphan)), ...inProfile(BOB, profileFiles(root, BOB, withOrphan)) };
}

/** The preview a person reads: the client folds every upload's preview through the merge, a lone upload included. */
async function shownFor(root: ServerTestHarness, files: Files): Promise<ImportPreview> {
  return mergeImportPreviews([await dryRun(root, files)]);
}

/** How many entries each relative path holds. */
function perPath(items: readonly ImportPreviewItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { source } of items) {
    counts.set(source.path, (counts.get(source.path) ?? 0) + 1);
  }
  return counts;
}

async function rowCount(root: ServerTestHarness, table: string, where = sql`1 = 1`): Promise<number> {
  const [row] = await root.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM ${sql.identifier(table)} WHERE ${where}`);
  return present(row).n;
}

/** What the library holds of each kind the preview lists, read through its own tables and settings. */
const WRITTEN: Readonly<Record<WrittenKind, (root: ServerTestHarness) => Promise<number>>> = {
  characters: async (root) => await rowCount(root, "characters"),
  chats: async (root) => await rowCount(root, "chats"),
  groups: async (root) => await rowCount(root, "chats", sql`imported_from = ${`${GROUP_LEAF}.jsonl`}`),
  worlds: async (root) => await rowCount(root, "world_books"),
  presets: async (root) => await rowCount(root, "presets"),
  themes: async (root) => await rowCount(root, "themes"),
  backgrounds: async (root) =>
    (await root.services.settings.getUserSettings({ principal: await root.principalFor(root.ownerId) })).config.appearance.backgroundLibrary.length,
};

forEachNonEmpty(IMPORT_PREVIEW_KINDS, "preview kinds", (kind) => {
  test(`two profiles that keep a ${kind} entry at the same path are two ${kind} in the preview, as many as the run finds`, async () => {
    await using root = await harness();
    const files = twoProfiles(root, true);

    const shown = await shownFor(root, files);
    const imported = await finishRun(root, await admit(root, files));

    const items = shown.kinds[kind].items;
    expect(shown.kinds[kind].total).toBe(present(imported.found)[kind]);
    expect(items).toHaveLength(present(imported.found)[kind]);
    // The control: the fixture really shares each path between the profiles, and each profile's entry is its own.
    expect(nonEmpty([...perPath(items).values()]).every((count) => count === 2)).toBe(true);
    expect(new Set(items.map(({ source }) => source.profile))).toEqual(new Set([ALICE, BOB]));
  });
});

test("every kind a preview lists is a library row after the same upload really imports", async () => {
  await using root = await harness();
  const files = twoProfiles(root, false);
  const shown = await shownFor(root, files);
  const before = new Map<WrittenKind, number>();
  for (const kind of WRITTEN_KINDS) {
    before.set(kind, await WRITTEN[kind](root));
  }

  await finish(root, await admit(root, files));

  for (const kind of WRITTEN_KINDS) {
    expect(await WRITTEN[kind](root), kind).toBe(present(before.get(kind)) + shown.kinds[kind].total);
  }
});

test("a split folder's repeated files stay one entry each per profile when the uploads' previews merge", async () => {
  await using root = await harness();
  const files = twoProfiles(root, true);

  const merged = mergeImportPreviews([await dryRun(root, files), await dryRun(root, files)]);
  const lone = await shownFor(root, files);

  for (const kind of IMPORT_PREVIEW_KINDS) {
    expect(merged.kinds[kind].total, kind).toBe(lone.kinds[kind].total);
  }
  expect(merged.kinds.characters.total).toBe(2);
});

test("a single profile's preview still lists one entry per file, all under one profile", async () => {
  await using root = await harness();
  const files = inProfile(ALICE, profileFiles(root, ALICE, true));

  const shown = await shownFor(root, files);
  const imported = await finishRun(root, await admit(root, files));

  for (const kind of IMPORT_PREVIEW_KINDS) {
    expect(shown.kinds[kind].total, kind).toBe(present(imported.found)[kind]);
    expect(shown.kinds[kind].total, kind).toBeGreaterThan(0);
  }
  const profiles = new Set(IMPORT_PREVIEW_KINDS.flatMap((kind) => shown.kinds[kind].items.map(({ source }) => source.profile)));
  expect(profiles.size).toBe(1);
});

test("a refused card marks its own profile's source and no card of another profile", async () => {
  await using root = await harness();
  const files = {
    ...inProfile(ALICE, { ...profileFiles(root, ALICE, false), "characters/broken.png": "not a card" }),
    ...inProfile(BOB, profileFiles(root, BOB, false)),
  };

  const shown = await shownFor(root, files);

  expect(shown.skipped.items.filter(({ source }) => source.path === "broken.png")).toEqual([
    { source: { profile: ALICE, path: "broken.png" }, reason: expect.any(String) },
  ]);
  // The control: both profiles' `characters/Card.png` are listed, and neither is a skip.
  expect(shown.kinds.characters.items.map(({ source }) => source.profile).toSorted((a, b) => a.localeCompare(b))).toEqual([ALICE, BOB]);
  expect(shown.skipped.items.map(({ source }) => source.path)).not.toContain("Card.png");
});

test("two profiles that share a refused path are two skips in the merged preview", async () => {
  await using root = await harness();
  const broken = { "characters/broken.png": "not a card" };
  const files = {
    ...inProfile(ALICE, { ...profileFiles(root, ALICE, false), ...broken }),
    ...inProfile(BOB, { ...profileFiles(root, BOB, false), ...broken }),
  };

  const shown = await shownFor(root, files);

  const refused = shown.skipped.items.filter(({ source }) => source.path === "broken.png");
  expect(refused).toHaveLength(2);
  expect(new Set(refused.map(({ source }) => source.profile))).toEqual(new Set([ALICE, BOB]));
});

test("the library's verdict for a card at a shared path follows the profile that holds it, after the merge", async () => {
  await using root = await harness();
  const alice = profileFiles(root, ALICE, false);
  await finish(root, await admit(root, inProfile(ALICE, alice)));

  const shown = await shownFor(root, { ...inProfile(ALICE, alice), ...inProfile(BOB, profileFiles(root, BOB, false)) });

  const verdicts = shown.kinds.characters.items.map(({ source, inLibrary }) => [source.profile, inLibrary === true] as const);
  expect(verdicts.toSorted(([a], [b]) => a.localeCompare(b))).toEqual([
    [ALICE, true],
    [BOB, false],
  ]);
});

test("a hostile profile directory name is clipped to the preview's text limit", async () => {
  await using root = await harness();
  // Over the preview's limit, under what a file system accepts as one directory name.
  const long = "p".repeat(IMPORT_PREVIEW_TEXT_MAX + 50);
  const files = { ...inProfile(long, profileFiles(root, ALICE, false)), ...inProfile(BOB, profileFiles(root, BOB, false)) };

  const shown = await shownFor(root, files);

  const profiles = shown.kinds.characters.items.map(({ source }) => source.profile);
  expect(profiles).toContain("p".repeat(IMPORT_PREVIEW_TEXT_MAX));
  expect(profiles).toContain(BOB);
});
