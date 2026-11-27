// The isolation tripwire as a stage refusal: a vite.config that only mentions the variable would proxy /api to the dev server.
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { assertStageSourceSupportsIsolation, syncDirtyTree } from "../../../../tooling/src/snap/ops/stage-source.ts";

const VITE_CONFIG_REL = "packages/client/vite.config.ts";

test("a dirty tree whose vite.config only names the tripwire in a comment is refused; one that reads it is accepted", async ({ plantedTree }) => {
  const reading = await plantedTree({ [VITE_CONFIG_REL]: 'const target = process.env["VITE_API_TARGET"] ?? "http://127.0.0.1:8788";\n' });
  expect(() => assertStageSourceSupportsIsolation(reading, true, "dirty")).not.toThrow();

  const commentOnly = await plantedTree({ [VITE_CONFIG_REL]: "// the VITE_API_TARGET env read below is the version tripwire\nconst target = 1;\n" });
  expect(() => assertStageSourceSupportsIsolation(commentOnly, true, "dirty")).toThrow("lacks the VITE_API_TARGET env hook");
});

// The stage's `node --watch` restarts its server for a written or deleted source file, so the wait for that
// restart is decided by exactly the files a re-sync touched: an unchanged tree touches none.
test("a dirty re-sync names the files it wrote and deleted, and none when the tree has not changed", async ({ plantedTree }) => {
  const root = await plantedTree({ "keep.ts": "keep\n", "packages/server/src/gone.ts": "gone\n", "packages/kit/src/edited.ts": "one\n" });
  execFixtureGit(root, ["init", "--quiet"]);
  // Tracked, so a deleted file stays in the manifest as a missing arg that rsync turns into a stage-side deletion.
  execFixtureGit(root, ["add", "--all"]);
  const stage = await plantedTree({});

  expect(syncDirtyTree(root, stage).toSorted()).toEqual(["keep.ts", "packages/kit/src/edited.ts", "packages/server/src/gone.ts"]);
  // The control: a second sync of the same tree reads as quiet, so "no files" is a real answer and not an unreadable one.
  expect(syncDirtyTree(root, stage)).toEqual([]);

  writeFileSync(join(root, "packages/kit/src/edited.ts"), "two, longer\n");
  rmSync(join(root, "packages/server/src/gone.ts"));
  writeFileSync(join(root, "packages/server/src/added.ts"), "added\n");
  expect(syncDirtyTree(root, stage).toSorted()).toEqual(["packages/kit/src/edited.ts", "packages/server/src/added.ts", "packages/server/src/gone.ts"]);
});
