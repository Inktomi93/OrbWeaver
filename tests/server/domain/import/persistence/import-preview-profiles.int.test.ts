// An upload that holds several profile directories previews every profile's entries: a file two profiles keep at the
// same relative path is two entries in the preview a person reads, and what the preview says a run will write is what
// the run writes, also when two profiles hold the same content.
// @subject packages/server/src/entry/http/import-tree.ts
// @subject packages/server/src/domain/import/loader/profile-directory.ts
// @subject packages/server/src/domain/import/substrate/preview.ts
// @subject packages/contracts/src/import/preview.ts

import type { ImportPreview, ImportPreviewItem, ImportPreviewKind } from "@orb/contracts/import";
import { IMPORT_PREVIEW_KINDS, IMPORT_PREVIEW_TEXT_MAX, mergeImportPreviews, ST_SETTINGS_FILE, TREE_DRY_RUN_VALUE } from "@orb/contracts/import";
import { workloads } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { forEachNonEmpty, nonEmpty, present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { makeAssetBytes } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";
import type { Files } from "./_st-tree-door.ts";
import { admit, cardPng, chatOf, dryRun, finish, finishRun, harness, inProfile, presetOf, settings, themeOf } from "./_st-tree-door.ts";

const ALICE = "alice";
const BOB = "bob";
const GROUP_LEAF = "room";

const ORPHAN_DIR = "Wanderer";
// The source a placeholder character is stamped with.
const ORPHAN_SOURCE = `chats/${ORPHAN_DIR}`;

/** The two files whose bytes a fixture mints, so two profiles can hold the very same ones. */
interface Art {
  readonly card: Uint8Array;
  readonly background: Uint8Array;
}

function artFor(root: ServerTestHarness, who: string): Art {
  return { card: cardPng(root, `${who} card`), background: new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))) };
}

/** One profile's files. Every profile lays the same relative path for every kind, with content of its own. */
function profileFiles(root: ServerTestHarness, who: string, withOrphan: boolean, art: Art = artFor(root, who)): Files {
  return {
    [ST_SETTINGS_FILE]: settings({ "me.png": `${who} persona` }),
    "characters/Card.png": art.card,
    "chats/Card/solo.jsonl": chatOf(`${who} solo`),
    "worlds/Atlas.json": JSON.stringify({ entries: { "0": { uid: 0, key: [who], comment: who, content: `${who} lore.`, order: 100 } } }),
    "OpenAI Settings/Plain.json": presetOf(`You are ${who}.`),
    "themes/Plain.json": themeOf("Plain", `rgba(${who.length}0, 20, 40, 1)`),
    "backgrounds/Plain.png": art.background,
    "groups/crew.json": JSON.stringify({ name: `${who} crew`, members: ["Card.png"], chats: [GROUP_LEAF] }),
    [`group chats/${GROUP_LEAF}.jsonl`]: chatOf(`${who} room`),
    ...(withOrphan ? { [`chats/${ORPHAN_DIR}/orphan.jsonl`]: chatOf(`${who} orphan`) } : {}),
  };
}

function twoProfiles(root: ServerTestHarness, withOrphan: boolean): Files {
  return { ...inProfile(ALICE, profileFiles(root, ALICE, withOrphan)), ...inProfile(BOB, profileFiles(root, BOB, withOrphan)) };
}

/** Two profiles that hold the very same files, as SillyTavern leaves them when it copies its default content. */
function twinProfiles(root: ServerTestHarness, withOrphan: boolean): Files {
  const art = artFor(root, "twin");
  return { ...inProfile(ALICE, profileFiles(root, "twin", withOrphan, art)), ...inProfile(BOB, profileFiles(root, "twin", withOrphan, art)) };
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
const WRITTEN: Readonly<Record<ImportPreviewKind, (root: ServerTestHarness) => Promise<number>>> = {
  characters: async (root) => await rowCount(root, "characters", sql`imported_from IS NOT ${ORPHAN_SOURCE}`),
  orphans: async (root) => await rowCount(root, "characters", sql`imported_from = ${ORPHAN_SOURCE}`),
  personas: async (root) => await rowCount(root, "personas"),
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

/** What a run adds for a kind: the entries the preview lists, less the ones it reuses. */
function willWrite(shown: ImportPreview, kind: ImportPreviewKind): number {
  const { total, items } = shown.kinds[kind];
  return total - items.filter((item) => item.inLibrary === true || item.repeat === true).length;
}

const FIXTURES = [
  { name: "different content at every path", build: twoProfiles },
  { name: "the same content at every path", build: twinProfiles },
] as const;

for (const { name, build } of FIXTURES) {
  test(`what the preview says a run will write is what it writes, for ${name}`, async () => {
    await using root = await harness();
    const files = build(root, true);
    const shown = await shownFor(root, files);
    const before = new Map<ImportPreviewKind, number>();
    for (const kind of IMPORT_PREVIEW_KINDS) {
      before.set(kind, await WRITTEN[kind](root));
    }

    await finish(root, await admit(root, files));

    for (const kind of IMPORT_PREVIEW_KINDS) {
      expect(await WRITTEN[kind](root), kind).toBe(present(before.get(kind)) + willWrite(shown, kind));
    }
  });
}

forEachNonEmpty(IMPORT_PREVIEW_KINDS, "preview kinds", (kind) => {
  test(`two profiles that hold the same ${kind} entry show the second as a repeat of the first, under its own profile`, async () => {
    await using root = await harness();

    const shown = await shownFor(root, twinProfiles(root, true));

    const { items } = shown.kinds[kind];
    const inAlice = items.filter(({ source }) => source.profile === ALICE);
    const inBob = items.filter(({ source }) => source.profile === BOB);
    // Both profiles list every entry; only the second profile's copy is a repeat.
    expect(items).toHaveLength(inAlice.length + inBob.length);
    expect(inAlice.length).toBeGreaterThan(0);
    expect(inBob).toHaveLength(inAlice.length);
    expect(inAlice.filter((item) => item.repeat === true)).toEqual([]);
    expect(nonEmpty(inBob).every((item) => item.repeat === true)).toBe(true);
  });
});

test("two profiles that hold different content at a shared path repeat nothing but the one placeholder their orphan directories share", async () => {
  await using root = await harness();

  const shown = await shownFor(root, twoProfiles(root, true));

  for (const kind of IMPORT_PREVIEW_KINDS) {
    expect(shown.kinds[kind].items.filter((item) => item.repeat === true).length, kind).toBe(kind === "orphans" ? 1 : 0);
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

const DIGEST = /^[0-9a-f]{64}$/u;

forEachNonEmpty(IMPORT_PREVIEW_KINDS, "preview kinds", (kind) => {
  test(`every ${kind} entry of a preview carries digests of its content keys and equal entries carry the same ones`, async () => {
    await using root = await harness();

    const { items } = (await shownFor(root, twinProfiles(root, true))).kinds[kind];

    const identitiesIn = (profile: string): (readonly string[])[] =>
      items.filter(({ source }) => source.profile === profile).map(({ identities }) => identities);
    expect(nonEmpty(items).every(({ identities }) => identities.length > 0 && identities.every((identity) => DIGEST.test(identity)))).toBe(true);
    expect(nonEmpty(identitiesIn(BOB))).toEqual(identitiesIn(ALICE));
  });
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
    ...inProfile(ALICE, profileFiles(root, ALICE, false)),
    ...inProfile(BOB, { ...profileFiles(root, BOB, false), "characters/broken.png": "not a card" }),
  };

  const shown = await shownFor(root, files);

  expect(shown.skipped.items.filter(({ source }) => source.path === "broken.png")).toEqual([
    { source: { profile: BOB, path: "broken.png" }, reason: expect.any(String) },
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

test("a dry run stored with the older bare-string source reads without its result, keeps its params and leaves the jobs list answering", async () => {
  await using root = await harness();
  const files = inProfile(ALICE, profileFiles(root, ALICE, false));
  const stale = await admit(root, files, [TREE_DRY_RUN_VALUE]);
  await finish(root, stale);
  const fresh = await admit(root, files, [TREE_DRY_RUN_VALUE]);
  await finish(root, fresh);
  const [stored] = await root.db.select({ result: workloads.result }).from(workloads).where(eq(workloads.id, stale));
  const older: unknown = JSON.parse(JSON.stringify(present(stored).result), (key, value: unknown) =>
    key === "source" && typeof value === "object" && value !== null && "path" in value ? value.path : value,
  );
  await root.db
    .update(workloads)
    .set({ result: sql`${JSON.stringify(older)}` })
    .where(eq(workloads.id, stale));
  const caller = await root.principalFor(root.ownerId);

  const listed = await root.services.workloads.list({ caller, kind: "import-st" });

  const readable = listed.find((row) => row.id === fresh);
  const unreadable = listed.find((row) => row.id === stale);
  expect(unreadable).toMatchObject({ poison: false, result: null, params: { dryRun: true } });
  expect(readable).toMatchObject({ poison: false });
  expect(readable?.result).not.toBeNull();
  await expect(root.services.workloads.get({ caller, id: stale })).resolves.toMatchObject({ poison: false, result: null });
});

test("two profile directories whose names share their first characters stay two profiles in the preview", async () => {
  await using root = await harness();
  const shared = "p".repeat(IMPORT_PREVIEW_TEXT_MAX);
  const files = { ...inProfile(`${shared}1`, profileFiles(root, ALICE, false)), ...inProfile(`${shared}2`, profileFiles(root, BOB, false)) };

  const shown = await shownFor(root, files);

  const { total, items } = shown.kinds.characters;
  expect(total).toBe(2);
  expect(new Set(items.map(({ source }) => source.profile)).size).toBe(2);
  expect(nonEmpty(items).every(({ source }) => source.profile.length <= IMPORT_PREVIEW_TEXT_MAX)).toBe(true);
});
