import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { configureFixtureGitIdentity, execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { readGitPathHistory } from "../../../../tooling/src/floor/git/git-history.ts";

function commit(root: string): void {
  execFixtureGit(root, ["add", "-A"]);
  execFixtureGit(root, ["commit", "--quiet", "--allow-empty", "-m", "fixture"]);
}

test("all-ref filename history retains side-branch names and NUL-delimited unusual paths", ({ scratch }) => {
  execFixtureGit(scratch, ["init", "--quiet"]);
  configureFixtureGitIdentity(scratch);
  commit(scratch);
  const original = execFixtureGit(scratch, ["branch", "--show-current"]).trim();
  execFixtureGit(scratch, ["checkout", "-b", "side"]);
  const path = "docs/work/0042-spaces and\nline.md";
  mkdirSync(join(scratch, dirname(path)), { recursive: true });
  writeFileSync(join(scratch, path), "fixture");
  commit(scratch);
  execFixtureGit(scratch, ["rm", path]);
  commit(scratch);
  execFixtureGit(scratch, ["checkout", original]);
  expect(readGitPathHistory(scratch, { kind: "all-refs", path: "docs/work/" })).toMatchObject({
    status: "ready",
    value: { initialPaths: [], addedPaths: [path], deletedPaths: [path] },
  });
});

test("an empty native history is ready data, but a missing repository is missing", ({ scratch }) => {
  expect(readGitPathHistory(scratch, { kind: "all-refs", path: "docs/work" })).toMatchObject({ status: "missing" });
  execFixtureGit(scratch, ["init", "--quiet"]);
  expect(readGitPathHistory(scratch, { kind: "all-refs", path: "docs/work" })).toMatchObject({
    status: "ready",
    value: { head: null, addedPaths: [], deletedPaths: [] },
  });
});

for (const output of ["A\0unterminated", "R100\0old\0new\0", "A\0\0"] as const) {
  test(`malformed native history is refused: ${JSON.stringify(output)}`, async ({ scratch, fakeBin }) => {
    await fakeBin(
      "git",
      `const args=process.argv.slice(2); if(args.includes('--git-dir')) process.stdout.write('.git\\n'); else if(args.includes('--is-shallow-repository')) process.stdout.write('false\\n'); else if(args.includes('HEAD^{commit}')) process.stdout.write('a'.repeat(40)+'\\n'); else process.stdout.write(${JSON.stringify(output)});`,
    );
    expect(readGitPathHistory(scratch, { kind: "all-refs", path: "docs/work" })).toMatchObject({ status: "unresolved" });
  });
}

test("failed Git commands do not classify a repository root, worktree file or nested root as absent", async ({ scratch, fakeBin }) => {
  const repository = join(scratch, "repository");
  const worktree = join(scratch, "worktree");
  const nested = join(worktree, "nested");
  mkdirSync(repository);
  execFixtureGit(repository, ["init", "--quiet"]);
  configureFixtureGitIdentity(repository);
  commit(repository);
  execFixtureGit(repository, ["worktree", "add", "--detach", worktree]);
  mkdirSync(nested);
  for (const root of [repository, worktree, nested]) {
    expect(readGitPathHistory(root, { kind: "all-refs", path: "docs/work" })).toMatchObject({ status: "ready" });
  }
  await fakeBin("git", "process.stderr.write('Git command unavailable');process.exitCode=77;");
  for (const root of [repository, worktree, nested]) {
    expect(readGitPathHistory(root, { kind: "all-refs", path: "docs/work" })).toMatchObject({ status: "unresolved" });
  }
});
