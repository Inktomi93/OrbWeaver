// A staged tree swapped after the run listed it imports none of the replacement's bytes, on the profile and bundle paths.
// The actor is local and may rename inside the staged tree. Linux only: Node has no openat, and only /proc/self/fd reads
// through a held parent.
// @subject packages/server/src/domain/import/loader/collect.ts
// @subject packages/server/src/infra/storage/profile-fs.ts
// @subject packages/server/src/infra/storage/stage-dir.ts

import { execFile } from "node:child_process";
import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { PORTABLE_DIRECTORIES } from "@orb/contracts/portability";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { vi } from "vitest";
import type { Files } from "./_st-tree-door.ts";
import { admit, cardPng, chatOf, finish, harness, settings, stagedTree, tableContents } from "./_st-tree-door.ts";

const runProcess = promisify(execFile);

const ON_LINUX = process.platform === "linux";
const ORIGINAL = "the-staged-original";
const REPLACEMENT = "the-late-replacement";
const SETTINGS = settings({ "bob.png": "Bob" });

function tree(root: ServerTestHarness, text: string): Files {
  return {
    [ST_SETTINGS_FILE]: SETTINGS,
    "characters/Aria.png": cardPng(root, "Aria"),
    "chats/Aria/first.jsonl": chatOf(`${text}-solo`),
    "groups/g.json": JSON.stringify({ name: "G", members: ["Aria.png"], chats: ["real"] }),
    "group chats/real.jsonl": chatOf(`${text}-group`),
    "User Avatars/bob.png": cardPng(root, `${text}-avatar`),
  };
}

async function writeTree(dir: string, files: Files): Promise<void> {
  for (const [path, bytes] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), bytes);
  }
}

test.runIf(ON_LINUX)("a profile folder swapped after the run listed it imports the staged bytes and none of the replacement", async () => {
  await using root = await harness();
  const id = await admit(root, tree(root, ORIGINAL));
  const staged = await stagedTree(root);
  const profile = join(staged, "profile");
  const moved = join(staged, "moved-aside");
  const replacement = join(staged, "replacement");
  await writeTree(replacement, tree(root, REPLACEMENT));

  // A FIFO is the barrier: the writer's open resolves only once the run has reached this read, after its listing.
  const settingsPath = join(profile, ST_SETTINGS_FILE);
  await writeFile(`${settingsPath}.kept`, SETTINGS);
  await rm(settingsPath);
  await runProcess("mkfifo", [settingsPath]);
  const running = finish(root, id);
  const writer = await open(settingsPath, "w");

  await rename(profile, moved);
  await rename(replacement, profile);
  await rename(join(moved, `${ST_SETTINGS_FILE}.kept`), join(moved, ST_SETTINGS_FILE));
  await writer.writeFile(SETTINGS);
  await writer.close();
  await running;

  const stored = JSON.stringify(await tableContents(root));
  expect(stored).not.toContain(REPLACEMENT);
  expect(stored).toContain(`${ORIGINAL}-solo`);
  expect(stored).toContain(`${ORIGINAL}-group`);
});

test.runIf(ON_LINUX)("a bundle folder's parent swapped after staging imports the staged card and none of the replacement", async () => {
  await using root = await harness();
  const token = "parent-custody-bundle";
  const staged = join(root.stagedImportsOf(root.ownerId), token);
  const cards = join(staged, PORTABLE_DIRECTORIES.character);
  await writeTree(staged, { [`${PORTABLE_DIRECTORIES.character}aria.png`]: cardPng(root, ORIGINAL), [`${PORTABLE_DIRECTORIES.tag}first.json`]: "{}" });
  const replacement = join(staged, "replacement");
  await writeTree(replacement, { "aria.png": cardPng(root, REPLACEMENT) });

  // Tags import before characters, so this wave runs after staging listed the tree and before any card read.
  const tagEntity = root.app.portability.find((entity) => entity.kind === "tag");
  if (tagEntity === undefined) {
    throw new Error("the registry has no tag entity");
  }
  const importTag = tagEntity.importFile;
  vi.spyOn(tagEntity, "importFile").mockImplementation(async (ownerId, file) => {
    await rename(cards, join(staged, "moved-aside"));
    await rename(replacement, cards);
    return await importTag(ownerId, file);
  });

  const report = await root.app.workloadContributions["import-bundle"].run(
    { ownerId: root.ownerId, userId: root.ownerId, funderUserId: null, now: () => root.clock.now() },
    { token, source: "dir" },
    () => undefined,
    new AbortController().signal,
  );

  expect(report).toMatchObject({ imported: 1 });
  const stored = JSON.stringify(await tableContents(root));
  expect(stored).not.toContain(REPLACEMENT);
  expect(stored).toContain(ORIGINAL);
});
