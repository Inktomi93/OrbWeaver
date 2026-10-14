// @subject tests/support/node/corpus.ts

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { createCorpusCapsule } from "@orb/testkit/node/corpus.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("capsule creation refuses an existing data root before opening or modifying its contents", async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-corpus-boundary-"));
  await using cleanup = new AsyncDisposableStack();
  cleanup.defer(() => rm(parent, { recursive: true, force: true }));
  const directory = join(parent, "existing-data");
  await mkdir(directory);
  const sentinel = join(directory, "keep.txt");
  await writeFile(sentinel, "existing caller-owned bytes", "utf8");
  await expect(
    createCorpusCapsule({
      directory,
      server: { authConfig: { ...authConfigFromEnv(), mode: "local" } },
      seed: { ownerPassword: "unused-boundary-password", log: () => undefined },
      privateCredential: { provider: "custom-openai", key: "unused-boundary-credential" },
    }),
  ).rejects.toMatchObject({ code: "EEXIST" });
  expect(await readdir(directory)).toEqual(["keep.txt"]);
  expect(await readFile(sentinel, "utf8")).toBe("existing caller-owned bytes");
});
