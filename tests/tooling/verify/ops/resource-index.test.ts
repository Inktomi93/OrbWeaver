import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { candidateIndexGitEnvironment, loadCandidateIndexDelta } from "../../../../tooling/src/verify/ops/resource-index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function plant(root: string, path: string, text: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, text);
}

function git(root: string, args: readonly string[]): void {
  execFixtureGit(root, args);
}

test("candidate index delta returns staged text only when it differs from the working tree", ({ scratch }) => {
  const path = "styles/a.css";
  const clean = ".a { color: red; }\n";
  const staged = "/* biome-ignore-all lint: staged */\n.a { color: red; }\n";
  git(scratch, ["init", "--quiet"]);
  plant(scratch, path, clean);
  git(scratch, ["add", path]);
  expect(loadCandidateIndexDelta(scratch, [path])).toMatchObject({ status: "ready", value: { files: [] }, members: 1 });

  plant(scratch, path, staged);
  git(scratch, ["add", path]);
  plant(scratch, path, clean);
  expect(loadCandidateIndexDelta(scratch, [path])).toMatchObject({
    status: "ready",
    value: { files: [{ path, text: staged }] },
    members: 1,
  });
});

test("a non-repository root is an unresolved index fact", ({ scratch }) => {
  expect(loadCandidateIndexDelta(scratch, ["styles/a.css"])).toMatchObject({ status: "unresolved", subprocess: { command: "git-index" } });
});

test("only the real invocation root inherits a hook candidate index, and no other Git routing", ({ scratch }) => {
  const ambient = { ["GIT_INDEX_FILE"]: "/tmp/candidate-index", ["GIT_DIR"]: "/tmp/other-git", ["GIT_WORK_TREE"]: "/tmp/other-tree" };
  expect(candidateIndexGitEnvironment(scratch, ambient, scratch)).toMatchObject({ ["GIT_INDEX_FILE"]: "/tmp/candidate-index" });
  expect(candidateIndexGitEnvironment(scratch, ambient, scratch)).not.toHaveProperty("GIT_DIR");
  expect(candidateIndexGitEnvironment(scratch, ambient, "/different/root")).not.toHaveProperty("GIT_INDEX_FILE");
});
