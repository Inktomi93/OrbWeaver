// infra/storage/stage-dir — the directory→StagedArchive adapter the folder-import bundle path consumes.
// Pins: every regular file surfaces as a forward-slash relative entry with lazy byte-correct reads, nested
// dirs are walked, non-file entries are ignored, and dispose() removes the staged tree.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageDirectory } from "@orb/server/infra/storage";
import { afterEach, beforeEach, describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "orb-stage-dir-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("stageDirectory", () => {
  test("walks nested files into forward-slash relative entries with byte-correct lazy reads", async () => {
    await mkdir(join(root, "characters"), { recursive: true });
    await mkdir(join(root, "personas"), { recursive: true });
    await writeFile(join(root, "characters", "Aria.png"), new Uint8Array([1, 2, 3]));
    await writeFile(join(root, "personas", "me.json"), new Uint8Array([4, 5]));

    const staged = await stageDirectory(root);
    try {
      const paths = staged.entries.map((e) => e.path).sort();
      expect(paths).toEqual(["characters/Aria.png", "personas/me.json"]);
      const aria = staged.entries.find((e) => e.path === "characters/Aria.png");
      expect(aria).toBeDefined();
      expect(Array.from(await (aria as { read: () => Promise<Uint8Array> }).read())).toEqual([1, 2, 3]);
    } finally {
      await staged.dispose();
    }
  });

  test("an empty directory stages zero entries", async () => {
    const staged = await stageDirectory(root);
    expect(staged.entries).toHaveLength(0);
    await staged.dispose();
  });

  test("dispose() removes the staged tree", async () => {
    await writeFile(join(root, "x.json"), new Uint8Array([9]));
    const staged = await stageDirectory(root);
    await staged.dispose();
    await expect(stageDirectory(root)).rejects.toThrow();
  });
});
