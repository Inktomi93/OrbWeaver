// data/import-tree-plan — the folder-import upload plan. Pins: the planes the importer only reports are
// skipped with their reason and `secrets.json` is never in a batch; an under-cap profile is one upload; an
// over-cap profile splits into uploads that keep a card with its chats, repeat settings.json and seat a group
// with its members; a file over the per-file cap and the file-count cap are honoured; a non-SillyTavern
// tree splits in path order.

import { relativePathOf } from "../../../packages/client/src/data/import-tree.ts";
// Deep import the PURE module (NOT the "@orb/client/data" barrel): a barrel import drags browser TSX into
// the dom-less node typecheck:graph program.
import type { TreeImportCaps } from "../../../packages/client/src/data/import-tree-plan.ts";
import { OVER_FILE_CAP_REASON, planTreeImport } from "../../../packages/client/src/data/import-tree-plan.ts";
import { expect, test } from "../../support/fixtures.ts";

/** A File whose read-only `webkitRelativePath` is set (as a directory-picked browser File carries it). */
function pickedFile(relPath: string, bytes = "x"): File {
  const file = new File([bytes], relPath.split("/").at(-1) ?? relPath);
  Object.defineProperty(file, "webkitRelativePath", { value: relPath, configurable: true });
  return file;
}

const CAPS: TreeImportCaps = { totalBytes: 10_000, fileBytes: 4000, files: 50_000 };

/** A synthetic ST profile: the planes the importer reads, the planes it only reports, and secrets.json. */
function syntheticProfile(): File[] {
  return [
    pickedFile("data/default-user/settings.json", "{}"),
    pickedFile("data/default-user/secrets.json", "{}"),
    pickedFile("data/default-user/characters/Aria.png", "x".repeat(1000)),
    pickedFile("data/default-user/characters/Bram.png", "x".repeat(1000)),
    pickedFile("data/default-user/chats/Aria/one.jsonl", "x".repeat(500)),
    pickedFile("data/default-user/chats/Aria 2/two.jsonl", "x".repeat(500)),
    pickedFile("data/default-user/chats/Nobody/orphan.jsonl", "x".repeat(100)),
    pickedFile("data/default-user/worlds/Harbor.json", "{}"),
    pickedFile("data/default-user/themes/Night.json", "{}"),
    pickedFile("data/default-user/OpenAI Settings/Preset.json", "{}"),
    pickedFile("data/default-user/vectors/index.bin", "x".repeat(2000)),
    pickedFile("data/default-user/extensions/third-party/index.js", "x"),
    pickedFile("data/default-user/TextGen Settings/Mirostat.json", "{}"),
    pickedFile("data/default-user/groups/g1.json", JSON.stringify({ members: ["Aria.png", "Bram.png"], chats: ["party"] })),
    pickedFile("data/default-user/group chats/party.jsonl", "x".repeat(200)),
  ];
}

test("the plan skips the planes the importer only reports, with each reason, and never includes secrets.json", async () => {
  const plan = await planTreeImport(syntheticProfile(), CAPS, (f) => f.text());
  // The reported path is what the server would see: the picked folder's wrapper stripped, the profile dir kept.
  const skippedPaths = plan.skipped.map((s) => s.path).toSorted();
  expect(skippedPaths).toEqual([
    "default-user/TextGen Settings/Mirostat.json",
    "default-user/extensions/third-party/index.js",
    "default-user/secrets.json",
    "default-user/vectors/index.bin",
  ]);
  expect(plan.skipped.find((s) => s.path === "default-user/secrets.json")?.reason).toContain("API keys");
  expect(plan.skipped.find((s) => s.path === "default-user/vectors/index.bin")?.reason).toContain("vector store");
  for (const batch of plan.batches) {
    expect(batch.map(relativePathOf)).not.toContain("data/default-user/secrets.json");
  }
});

test("under the cap the whole profile is ONE upload", async () => {
  const plan = await planTreeImport(syntheticProfile(), CAPS, (f) => f.text());
  expect(plan.batches).toHaveLength(1);
  expect(plan.files).toBe(11);
  const sent = plan.batches[0]?.map(relativePathOf).toSorted();
  expect(sent).toEqual([
    "data/default-user/OpenAI Settings/Preset.json",
    "data/default-user/characters/Aria.png",
    "data/default-user/characters/Bram.png",
    "data/default-user/chats/Aria 2/two.jsonl",
    "data/default-user/chats/Aria/one.jsonl",
    "data/default-user/chats/Nobody/orphan.jsonl",
    "data/default-user/group chats/party.jsonl",
    "data/default-user/groups/g1.json",
    "data/default-user/settings.json",
    "data/default-user/themes/Night.json",
    "data/default-user/worlds/Harbor.json",
  ]);
});

test("OVER the cap the profile splits into uploads that each keep a card with its chats, repeat settings.json, and seat a group with its members", async () => {
  const tight: TreeImportCaps = { totalBytes: 2700, fileBytes: 4000, files: 50_000 };
  const plan = await planTreeImport(syntheticProfile(), tight, (f) => f.text());
  expect(plan.batches.length).toBeGreaterThan(1);
  const paths = plan.batches.map((b) => b.map(relativePathOf));
  for (const batch of paths) {
    expect(batch).toContain("data/default-user/settings.json");
    expect(batch.reduce((n, p) => n + (syntheticProfile().find((f) => relativePathOf(f) === p)?.size ?? 0), 0)).toBeLessThanOrEqual(tight.totalBytes);
  }
  // Aria's two chat dirs (the exact slug and the "Aria 2" decoration) ride with Aria's card, never alone.
  const withAriaChats = paths.filter((b) => b.some((p) => p.startsWith("data/default-user/chats/Aria")));
  for (const batch of withAriaChats) {
    expect(batch).toContain("data/default-user/characters/Aria.png");
  }
  // The group's upload carries both member cards and its transcript.
  const groupBatch = paths.find((b) => b.includes("data/default-user/groups/g1.json"));
  expect(groupBatch).toEqual(
    expect.arrayContaining(["data/default-user/characters/Aria.png", "data/default-user/characters/Bram.png", "data/default-user/group chats/party.jsonl"]),
  );
  // Every planned file was sent at least once.
  const sentOnce = new Set(paths.flat());
  expect(sentOnce.size).toBe(plan.files);
});

test("a file over the per-file cap stays on disk with its reason; the file count cap splits uploads too", async () => {
  const files = [...syntheticProfile(), pickedFile("data/default-user/characters/Huge.png", "x".repeat(5000))];
  const plan = await planTreeImport(files, CAPS, (f) => f.text());
  expect(plan.skipped.find((s) => s.path === "default-user/characters/Huge.png")?.reason).toBe(OVER_FILE_CAP_REASON);

  // The count cap must hold the largest unit (a group with its members and settings.json); the profile
  // still needs more than one upload under it.
  const fewFiles: TreeImportCaps = { totalBytes: 10_000, fileBytes: 4000, files: 6 };
  const split = await planTreeImport(syntheticProfile(), fewFiles, (f) => f.text());
  expect(split.batches.length).toBeGreaterThan(1);
  for (const batch of split.batches) {
    expect(batch.length).toBeLessThanOrEqual(6);
  }
});

test("a non-SillyTavern tree (an unzipped orb backup) is split in path order with nothing left out", async () => {
  const plan = await planTreeImport(
    [pickedFile("backup/personas/me.json", "x".repeat(3000)), pickedFile("backup/presets/rp.json", "x".repeat(3000))],
    { totalBytes: 5000, fileBytes: 4000, files: 50_000 },
    (f) => f.text(),
  );
  expect(plan.skipped).toEqual([]);
  expect(plan.batches.map((b) => b.map(relativePathOf))).toEqual([["backup/personas/me.json"], ["backup/presets/rp.json"]]);
});

test("two cards whose names slug alike are BOTH sent (the server suffixes the second handle); nothing is dropped", async () => {
  const plan = await planTreeImport(
    [
      pickedFile("data/default-user/settings.json", "{}"),
      pickedFile("data/default-user/characters/Mr. Smith.png", "x"),
      pickedFile("data/default-user/characters/Mr Smith.png", "y"),
      pickedFile("data/default-user/characters/mr-smith.png", "z"),
      pickedFile("data/default-user/chats/Mr Smith/one.jsonl", "c"),
    ],
    CAPS,
    (f) => f.text(),
  );
  expect(plan.skipped).toEqual([]);
  expect(plan.files).toBe(5);
  expect(plan.batches).toHaveLength(1);
  expect(plan.batches[0]?.map(relativePathOf).toSorted()).toEqual([
    "data/default-user/characters/Mr Smith.png",
    "data/default-user/characters/Mr. Smith.png",
    "data/default-user/characters/mr-smith.png",
    "data/default-user/chats/Mr Smith/one.jsonl",
    "data/default-user/settings.json",
  ]);
});

test("a multi-profile root keeps EVERY profile's settings.json in every upload", async () => {
  const files = [
    pickedFile("data/alice/settings.json", "{}"),
    pickedFile("data/alice/characters/A.png", "x".repeat(1500)),
    pickedFile("data/bob/settings.json", "{}"),
    pickedFile("data/bob/characters/B.png", "x".repeat(1500)),
  ];
  const plan = await planTreeImport(files, { totalBytes: 1600, fileBytes: 4000, files: 50_000 }, (f) => f.text());
  expect(plan.skipped).toEqual([]);
  expect(plan.files).toBe(4);
  expect(plan.batches).toHaveLength(2);
  for (const batch of plan.batches) {
    const paths = batch.map(relativePathOf);
    expect(paths).toContain("data/alice/settings.json");
    expect(paths).toContain("data/bob/settings.json");
  }
});
