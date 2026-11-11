// The operator's ST_PROFILE_DIR is configuration, so a root that is not there reads as no tree, whether the folder is
// missing or a parent of it is a regular file; only a link whose target is gone fails, so its data is never dropped.
// @subject packages/server/src/infra/storage/profile-fs.ts

import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node";
import { onTestFinished } from "vitest";
import { createOperatorImportPort } from "#server/infra/storage/index.ts";

const PROFILE_DIR_NAME = "profile";
const REGULAR_FILE_NAME = "not-a-directory";
// The errno the link's target read fails with; the dangling-link refusal carries it as its cause, a raw errno has none.
const NOT_A_DIRECTORY_CODE = "ENOTDIR";

async function scratchDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "orb-operator-tree-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function regularFileIn(dir: string): Promise<string> {
  const file = join(dir, REGULAR_FILE_NAME);
  await writeFile(file, "x");
  return file;
}

const ABSENT_ROOTS: readonly { readonly name: string; readonly rootIn: (dir: string) => Promise<string> }[] = [
  { name: "a missing folder", rootIn: (dir) => Promise.resolve(join(dir, PROFILE_DIR_NAME)) },
  { name: "a folder beneath a regular file", rootIn: async (dir) => join(await regularFileIn(dir), PROFILE_DIR_NAME) },
];

test.for(ABSENT_ROOTS)("$name reads as no tree", async ({ rootIn }) => {
  const root = await rootIn(await scratchDir());

  await expect(createOperatorImportPort(root).openTree()).resolves.toBeNull();
});

test("a root link whose target sits beneath a regular file fails as a dangling link", async () => {
  const dir = await scratchDir();
  const root = join(dir, PROFILE_DIR_NAME);
  await symlink(join(await regularFileIn(dir), PROFILE_DIR_NAME), root);

  await expect(createOperatorImportPort(root).openTree()).rejects.toMatchObject({ cause: { code: NOT_A_DIRECTORY_CODE } });
});
