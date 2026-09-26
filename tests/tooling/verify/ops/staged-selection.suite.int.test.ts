// The commit gate's selection is the index, not the working tree: a staged change is checked with its deletion and
// rename semantics, and a tracked file edited but not staged, or an untracked file, never enters the commit's scope.
// The working-change selection over the same repo is the control that still sees both.
import { mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { REGISTRY, resolveSelection } from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const FILES = {
  staged: "packages/client/src/staged.ts",
  unstaged: "packages/client/src/unstaged.ts",
  untracked: "packages/client/src/untracked.ts",
  deleted: "packages/client/src/deleted.ts",
  renameOld: "packages/client/src/rename-old.ts",
  renameNew: "packages/client/src/rename-new.ts",
} as const;

function plantRepo(repoRoot: string, scratch: string): void {
  writeFileSync(join(scratch, ".gitignore"), "node_modules\n");
  writeFileSync(join(scratch, "package.json"), JSON.stringify({ name: "staged-selection-fixture", private: true }));
  mkdirSync(join(scratch, "scripts"), { recursive: true });
  writeFileSync(join(scratch, "scripts/ts7.ts"), readFileSync(join(repoRoot, "scripts/ts7.ts"), "utf8"));
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  writeFileSync(join(scratch, "tsconfig.base.json"), '{"compilerOptions":{"noEmit":true,"strict":true,"types":[]},"files":[]}\n');
  writeFileSync(join(scratch, "root-anchor.ts"), "export {};\n");
  writeFileSync(join(scratch, "tsconfig.json"), '{"extends":"./tsconfig.base.json","include":["root-anchor.ts"]}\n');
  mkdirSync(join(scratch, "packages/client/src"), { recursive: true });
  writeFileSync(join(scratch, "packages/client/tsconfig.json"), '{"extends":"../../tsconfig.base.json","include":["src"]}\n');
  for (const path of [FILES.staged, FILES.unstaged, FILES.deleted, FILES.renameOld]) {
    writeFileSync(join(scratch, path), `export const baseline = ${JSON.stringify(path)};\n`);
  }
  execFixtureGit(scratch, ["init"]);
  execFixtureGit(scratch, ["add", "."]);
  execFixtureGit(scratch, ["-c", "user.name=Orb Test", "-c", "user.email=orb@example.invalid", "commit", "-m", "baseline"]);

  writeFileSync(join(scratch, FILES.staged), "export const staged = true;\n");
  rmSync(join(scratch, FILES.deleted));
  renameSync(join(scratch, FILES.renameOld), join(scratch, FILES.renameNew));
  execFixtureGit(scratch, ["add", "-A"]);
  writeFileSync(join(scratch, FILES.unstaged), "export const unstaged = true;\n");
  writeFileSync(join(scratch, FILES.untracked), "export const untracked = true;\n");
}

function biomeArgv(selection: ReturnType<typeof resolveSelection>): unknown {
  const stage = REGISTRY.find((candidate) => candidate.name === "lint:biome");
  if (stage?.scopedArgv === undefined) {
    throw new Error("lint:biome has no scoped argv");
  }
  return stage.scopedArgv(selection);
}

test("the staged selection is exactly what the commit records, deletions and the rename's old side included", ({ repoRoot, scratch }) => {
  plantRepo(repoRoot, scratch);
  const staged = resolveSelection({ kind: "staged" }, scratch);
  expect(staged.paths.toSorted()).toEqual([FILES.deleted, FILES.renameNew, FILES.renameOld, FILES.staged].toSorted());
  expect(staged.existingPaths.toSorted()).toEqual([FILES.renameNew, FILES.staged].toSorted());
  expect(biomeArgv(staged)).not.toEqual(expect.arrayContaining([FILES.unstaged]));
  expect(biomeArgv(staged)).not.toEqual(expect.arrayContaining([FILES.untracked]));
  expect(staged.checkScopeArgv).toEqual(expect.arrayContaining([FILES.deleted, FILES.renameOld]));
});

test("control: the working-change selection over the same repo still sees the unstaged and the untracked file", ({ repoRoot, scratch }) => {
  plantRepo(repoRoot, scratch);
  const working = resolveSelection({ kind: "changed", paths: [] }, scratch);
  expect(working.existingPaths).toEqual(expect.arrayContaining([FILES.unstaged, FILES.untracked, FILES.staged]));
});
