// A changed selection has two audiences: graph/ledger/type/structure need deletion semantics, while
// concrete-file tools must never receive a path that no longer exists. This plants all four git statuses
// in a disposable repo and proves every stage derives from the one classification.
import { mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import type { Selection, StageDef } from "../../../../tooling/src/verify/index.ts";
import { REGISTRY, resolveSelection } from "../../../../tooling/src/verify/index.ts";
import { gitChangedPathClassification } from "../../../../tooling/src/verify/lib/repo-paths.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function git(root: string, args: readonly string[]): void {
  execFixtureGit(root, args);
}

function stage(name: string): StageDef {
  const found = REGISTRY.find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`missing verify stage ${name}`);
  }
  return found;
}

function scoped(name: string, selection: Selection): ReturnType<NonNullable<StageDef["scopedArgv"]>> {
  const resolve = stage(name).scopedArgv;
  if (resolve === undefined) {
    throw new Error(`verify stage ${name} has no scoped argv`);
  }
  return resolve(selection);
}

test("git-changed classification keeps deletions for semantic stages and removes them from every direct-path stage", ({ repoRoot, scratch }) => {
  const files = {
    modified: "packages/client/src/modified.ts",
    added: "packages/client/src/added.ts",
    renameOld: "packages/client/src/rename-old.ts",
    renameNew: "packages/client/src/rename-new.ts",
    deleted: "packages/client/src/deleted.ts",
    docModified: "docs/architecture/modified.md",
    docDeleted: "docs/architecture/deleted.md",
    testDeleted: "tests/tooling/deleted.test.ts",
  } as const;
  writeFileSync(join(scratch, ".gitignore"), "node_modules\n");
  writeFileSync(join(scratch, "package.json"), JSON.stringify({ name: "selection-fixture", private: true }));
  mkdirSync(join(scratch, "scripts"), { recursive: true });
  writeFileSync(join(scratch, "scripts/ts7.ts"), readFileSync(join(repoRoot, "scripts/ts7.ts"), "utf8"));
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  writeFileSync(join(scratch, "tsconfig.base.json"), '{"compilerOptions":{"noEmit":true,"strict":true,"types":[]},"files":[]}\n');
  writeFileSync(join(scratch, "root-anchor.ts"), "export {};\n");
  writeFileSync(join(scratch, "tsconfig.json"), '{"extends":"./tsconfig.base.json","include":["root-anchor.ts","tests"]}\n');
  mkdirSync(join(scratch, "packages/client"), { recursive: true });
  writeFileSync(join(scratch, "packages/client/tsconfig.json"), '{"extends":"../../tsconfig.base.json","include":["src"]}\n');
  for (const path of [files.modified, files.renameOld, files.deleted, files.docModified, files.docDeleted, files.testDeleted]) {
    mkdirSync(join(scratch, path, ".."), { recursive: true });
    writeFileSync(join(scratch, path), path.endsWith(".md") ? `# ${path}\n` : `export const baseline = ${JSON.stringify(path)};\n`);
  }
  git(scratch, ["init"]);
  git(scratch, ["add", "."]);
  git(scratch, ["-c", "user.name=Orb Test", "-c", "user.email=orb@example.invalid", "commit", "-m", "baseline"]);

  writeFileSync(join(scratch, files.modified), "export const modified = true;\n");
  writeFileSync(join(scratch, files.docModified), "# Modified\n");
  writeFileSync(join(scratch, files.added), "export const added = true;\n");
  renameSync(join(scratch, files.renameOld), join(scratch, files.renameNew));
  rmSync(join(scratch, files.deleted));
  rmSync(join(scratch, files.docDeleted));
  rmSync(join(scratch, files.testDeleted));
  git(scratch, ["add", "-A"]);

  const classified = gitChangedPathClassification(scratch);
  const selection = resolveSelection({ kind: "changed", paths: [] }, scratch);
  expect(classified.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: files.added, status: "added" }),
      expect.objectContaining({ path: files.modified, status: "modified" }),
      expect.objectContaining({ path: files.renameOld, status: "deleted" }),
      expect.objectContaining({ path: files.renameNew, status: "renamed-existing", previousPath: files.renameOld }),
      expect.objectContaining({ path: files.deleted, status: "deleted" }),
    ]),
  );
  expect(selection.paths).toEqual(classified.paths);
  expect(selection.existingPaths).toEqual(classified.existingPaths);
  expect(selection.existingPaths).toEqual(expect.arrayContaining([files.added, files.modified, files.renameNew, files.docModified]));
  expect(selection.existingPaths).not.toEqual(expect.arrayContaining([files.deleted, files.renameOld, files.docDeleted, files.testDeleted]));

  const biome = scoped("lint:biome", selection);
  expect(biome).not.toBe("skip-empty");
  expect(biome).toEqual(expect.arrayContaining([...selection.existingPaths]));
  for (const deleted of classified.deletedPaths) {
    expect(biome).not.toContain(deleted);
  }
  expect(scoped("lint:eslint", selection)).toEqual(expect.arrayContaining([files.added, files.modified, files.renameNew]));
  expect(scoped("imports:depcruise", selection)).toEqual(expect.arrayContaining([files.added, files.modified, files.renameNew]));
  expect(scoped("docs:format", selection)).toEqual(["node", "tooling/src/doc-catalog/cli.ts", "format", "--check", files.docModified]);
  expect(scoped("docs:catalog", selection)).toEqual(["pnpm", "check:doc-catalog"]);

  const structure = scoped("structure:full", selection);
  expect(structure).toEqual(expect.arrayContaining([files.deleted, files.renameOld, files.docDeleted, files.testDeleted]));
  expect(selection.tsconfigs).toContain("packages/client/tsconfig.json");
  expect(selection.tsconfigs).toContain("tsconfig.json");
  expect(scoped("types:native", selection)).toEqual(["pnpm", "typecheck", ...selection.tsconfigs.flatMap((config) => ["--config", config])]);
});
