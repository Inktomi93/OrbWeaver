// The import preview through the real door: a dry-run tree upload runs as the import-st workload, reports what a
// real run would bring and skip, writes no row anywhere, and leaves the same files importable.
// @subject packages/server/src/entry/http/import-tree.ts
// @subject packages/server/src/domain/import/loader/profile-directory.ts
// @subject packages/server/src/domain/import/substrate/preview.ts

import { readdir } from "node:fs/promises";
import type { ImportPreview } from "@orb/contracts/import";
import {
  IMPORT_PREVIEW_LIST_MAX,
  IMPORT_PREVIEW_TEXT_MAX,
  mergeImportPreviews,
  ST_SECRETS_FILE,
  ST_SETTINGS_FILE,
  TREE_DRY_RUN_VALUE,
} from "@orb/contracts/import";
import { PORTABLE_DIRECTORIES } from "@orb/contracts/portability";
import { nonEmpty, present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import type { Files } from "./_st-tree-door.ts";
import { admit, CHAT, cardPng, dryRun, finish, harness, post, settings, storedBlobs, tableContents, WORLD } from "./_st-tree-door.ts";

function profile(root: ServerTestHarness): Files {
  return {
    [ST_SETTINGS_FILE]: settings({ "bob.png": "Bob" }),
    "characters/Aria.png": cardPng(root, "Aria"),
    "characters/broken.png": "not a card",
    "chats/Aria/one.jsonl": CHAT,
    "worlds/Eldoria.json": WORLD,
    "movingUI/layout.json": "{}",
  };
}

function names(preview: ImportPreview, kind: keyof ImportPreview["kinds"]): readonly string[] {
  return preview.kinds[kind].items.map((item) => item.name);
}

test("a dry run names what each kind would bring and what it would skip, writes no row in any table, and a real run then lands it", async () => {
  await using root = await harness();
  const files = profile(root);
  const before = await tableContents(root);
  const blobsBefore = await storedBlobs(root);

  const preview = await dryRun(root, files);

  expect(names(preview, "characters")).toEqual(["Aria"]);
  expect(preview.kinds.characters.items[0]?.inLibrary).toBeUndefined();
  expect(preview.kinds.chats.total).toBe(1);
  expect(names(preview, "personas")).toEqual(["Bob"]);
  expect(names(preview, "worlds")).toEqual(["Eldoria"]);
  expect(preview.skipped.items.map((item) => item.source)).toEqual(expect.arrayContaining(["broken.png", "movingUI/"]));
  expect(nonEmpty(preview.skipped.items).every((item) => item.reason.length > 0)).toBe(true);
  expect(await tableContents(root)).toEqual(before);
  expect(await storedBlobs(root)).toEqual(blobsBefore);
  expect(await readdir(root.importStagingDir, { recursive: true })).not.toContainEqual(expect.stringContaining("characters"));

  // The control: both checks move as soon as the same bytes really import.
  await finish(root, await admit(root, files));
  const after = await tableContents(root);
  expect(after["characters"]).toHaveLength((before["characters"] ?? []).length + 1);
  expect(after["personas"]).toHaveLength((before["personas"] ?? []).length + 1);
  expect(after["world_books"]).toHaveLength((before["world_books"] ?? []).length + 1);
  expect(await storedBlobs(root)).not.toEqual(blobsBefore);

  const again = await dryRun(root, files);
  expect(again.kinds.characters.items[0]).toMatchObject({ name: "Aria", inLibrary: true });
});

// A prompt with an empty identifier cannot key a section; the bad preset is one skip, never the whole profile.
const UNKEYED_PRESET = JSON.stringify({
  prompts: [{ identifier: "", name: "Unkeyed", content: "x", role: "system" }],
  ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "", enabled: true }] }],
});

test("one unreadable preset file is skipped while the profile's cards, chats and worlds still import", async () => {
  await using root = await harness();
  const files = { ...profile(root), ["OpenAI Settings/Unkeyed.json"]: UNKEYED_PRESET };
  const before = await tableContents(root);

  const preview = await dryRun(root, files);
  expect(preview.skipped.items.map((item) => item.source)).toContain("OpenAI Settings/Unkeyed.json");
  expect(names(preview, "characters")).toEqual(["Aria"]);
  expect(preview.kinds.chats.total).toBe(1);
  expect(names(preview, "worlds")).toEqual(["Eldoria"]);

  await finish(root, await admit(root, files));
  const after = await tableContents(root);
  expect(after["characters"]).toHaveLength((before["characters"] ?? []).length + 1);
  expect(after["chats"]).toHaveLength((before["chats"] ?? []).length + 1);
  expect(after["world_books"]).toHaveLength((before["world_books"] ?? []).length + 1);
});

test("a persona with no avatar file is listed by its name as importing without art, not as a skipped file", async () => {
  await using root = await harness();

  const preview = await dryRun(root, profile(root));

  expect(preview.kinds.personas.items).toEqual([expect.objectContaining({ name: "Bob", withoutArt: true })]);
  expect(preview.skipped.items.map((item) => item.source)).not.toContain("bob.png");
  const merged = mergeImportPreviews([preview, preview]);
  expect(merged.kinds.personas.items[0]).toMatchObject({ name: "Bob", withoutArt: true });
});

test("a hostile folder's names are clipped, its lists capped with an exact total, and no server path or credential reaches the preview", async () => {
  await using root = await harness();
  const over = IMPORT_PREVIEW_LIST_MAX + 1;
  const personas = Object.fromEntries(Array.from({ length: over }, (_, i) => [`p${String(i)}.png`, `Persona ${String(i)}`]));
  const long = "N".repeat(IMPORT_PREVIEW_TEXT_MAX * 2);

  const preview = await dryRun(root, {
    [ST_SETTINGS_FILE]: settings(personas),
    "characters/long.png": cardPng(root, long),
    [ST_SECRETS_FILE]: '{"api_key_openai":"planted-credential"}',
  });

  expect(preview.kinds.personas.total).toBe(over);
  expect(preview.kinds.personas.items).toHaveLength(IMPORT_PREVIEW_LIST_MAX);
  expect(preview.kinds.characters.items[0]?.name).toHaveLength(IMPORT_PREVIEW_TEXT_MAX);
  const wire = JSON.stringify(preview);
  expect(wire).not.toContain(root.importStagingDir);
  expect(wire).not.toContain("planted-credential");
});

test("a split folder's previews count a repeated card and the shared settings once", async () => {
  await using root = await harness();
  const shared = { [ST_SETTINGS_FILE]: settings({ "bob.png": "Bob" }), "worlds/Eldoria.json": WORLD };
  const aria = cardPng(root, "Aria");
  const first = await dryRun(root, { ...shared, "characters/Aria.png": aria, "chats/Aria/one.jsonl": CHAT });
  const second = await dryRun(root, { ...shared, "characters/Aria.png": aria, "characters/Bram.png": cardPng(root, "Bram") });

  const merged = mergeImportPreviews([first, second]);

  expect(names(merged, "characters")).toEqual(["Aria", "Bram"]);
  expect(merged.kinds.characters.total).toBe(2);
  expect(merged.kinds.personas.total).toBe(1);
  expect(merged.kinds.worlds.total).toBe(1);
  expect(merged.kinds.chats.total).toBe(1);
});

test("two cards that share a name keep their own chats when a split folder's previews merge", async () => {
  await using root = await harness();
  const shared = { [ST_SETTINGS_FILE]: settings({}) };
  const first = await dryRun(root, { ...shared, "characters/Aria.png": cardPng(root, "Aria"), "chats/Aria/one.jsonl": CHAT });
  const second = await dryRun(root, { ...shared, "characters/Aria 2.png": cardPng(root, "Aria"), "chats/Aria 2/one.jsonl": CHAT });

  const merged = mergeImportPreviews([first, second]);

  expect(merged.kinds.characters.total).toBe(2);
  expect(merged.kinds.chats.total).toBe(2);
});

test("a chat whose card rides in only one upload of a split folder counts once", async () => {
  await using root = await harness();
  const shared = { [ST_SETTINGS_FILE]: settings({}), "chats/Aria/one.jsonl": CHAT };
  const carded = await dryRun(root, { ...shared, "characters/Aria.png": cardPng(root, "Aria") });
  const orphaned = await dryRun(root, shared);

  expect(mergeImportPreviews([carded, orphaned]).kinds.chats.total).toBe(1);
});

test("two group files that share a name stay two when a split folder's previews merge", async () => {
  await using root = await harness();
  const group = '{"name":"G","members":["Aria.png"]}';
  const shared = { [ST_SETTINGS_FILE]: settings({}), "characters/Aria.png": cardPng(root, "Aria") };
  const first = await dryRun(root, { ...shared, "groups/one.json": group });
  const second = await dryRun(root, { ...shared, "groups/two.json": group });

  expect(mergeImportPreviews([first, second]).kinds.groups.total).toBe(2);
});

test("one source skipped two ways keeps both rows across a split folder, and a repeat of the same skip stays one", async () => {
  await using root = await harness();
  const shared = { [ST_SETTINGS_FILE]: settings({}), "movingUI/layout.json": "{}" };
  const first = await dryRun(root, { ...shared, "user/files/a.txt": "a" });
  const second = await dryRun(root, { ...shared, "user/files/b.txt": "b", "user/files/c.txt": "c" });

  const merged = mergeImportPreviews([first, second]);

  expect(merged.skipped.items.filter((item) => item.source === "user/files/")).toHaveLength(2);
  expect(merged.skipped.items.filter((item) => item.source === "movingUI/")).toHaveLength(1);
});

test("a skip's reason is one short line per kind of skip, carrying no field name a file or the importer wrote", async () => {
  await using root = await harness();
  const preview = await dryRun(root, {
    [ST_SETTINGS_FILE]: JSON.stringify({ ["world_info_settings"]: {}, ["extension_settings"]: {} }),
    "characters/Aria.png": cardPng(root, "Aria"),
    "themes/one.json": '{"name":"one"}',
    "themes/two.json": "not json",
    "backgrounds/note.txt": "not media",
    "user/workflows/flow.json": "{}",
    "reasoning/format.json": "{}",
  });

  const reasonOf = (source: string): string => present(preview.skipped.items.find((item) => item.source === source)).reason;
  expect(reasonOf("themes/one.json")).toBe(reasonOf("themes/two.json"));
  expect(reasonOf("world_info_settings")).toBe(reasonOf("extension_settings"));
  expect(reasonOf("user/")).toBe(reasonOf("reasoning/"));
  const reasons = nonEmpty(preview.skipped.items.map((item) => item.reason));
  expect(reasons.filter((reason) => reason.includes("`") || /[a-z]_[a-z]/u.test(reason))).toEqual([]);
  expect(Math.max(...reasons.map((reason) => reason.length))).toBeLessThan(IMPORT_PREVIEW_TEXT_MAX);
});

test("a dry-run field that is malformed, repeated, or on a native backup refuses with nothing staged and no job", async () => {
  await using root = await harness();
  const principal = await root.principalFor(root.ownerId);
  const native = { [`${PORTABLE_DIRECTORIES.regex}tidy.json`]: "{}" };
  const refused: readonly (readonly [Files, readonly (string | File)[]])[] = [
    [profile(root), ["yes"]],
    [profile(root), [TREE_DRY_RUN_VALUE, TREE_DRY_RUN_VALUE]],
    [profile(root), [new File([TREE_DRY_RUN_VALUE], "dryRun")]],
    [native, [TREE_DRY_RUN_VALUE]],
  ];
  for (const [files, fields] of refused) {
    const response = await post(root, files, fields);
    await response.arrayBuffer();
    expect(response.status).toBe(400);
  }
  expect(await readdir(root.importStagingDir, { recursive: true })).toEqual(expect.not.arrayContaining([expect.stringContaining("import-tree-")]));
  expect(await root.services.workloads.list({ caller: principal, kind: "import-st" })).toEqual([]);
  expect(await root.services.workloads.list({ caller: principal, kind: "import-bundle" })).toEqual([]);
});
