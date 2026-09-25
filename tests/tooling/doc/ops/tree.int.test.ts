// The doc tool's git writer on a planted repository: a landing commit goes through plumbing, so the
// commit-message contract is checked by this door itself, and git's own refusal text reaches the caller.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFixtureGit } from "../../../../tooling/src/_shared/git-fixture.ts";
import { withProcessEnv } from "../../../../tooling/src/_shared/process-env.ts";
import { commitPaths } from "../../../../tooling/src/doc/ops/tree.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const IDENTITY = ["-c", "user.name=Doc Test", "-c", "user.email=doc@example.invalid"];
const TRAILER = "Co-Authored-By: t <t@example.invalid>";

function git(root: string, ...args: readonly string[]): string {
  return execFixtureGit(root, [...IDENTITY, ...args]).trim();
}

async function repo(plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>): Promise<string> {
  const root = await plantedTree({ "README.md": "# planted\n", "docs/a.md": "a\n" });
  git(root, "init", "-q", "-b", "main");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "chore: base");
  return root;
}

test("commitPaths commits exactly the named paths, records a deletion, and leaves a sibling's staged file out", async ({ plantedTree }) => {
  const root = await repo(plantedTree);
  const head = git(root, "rev-parse", "HEAD");
  writeFileSync(join(root, "README.md"), "# changed\n");
  writeFileSync(join(root, "docs/b.md"), "b\n");
  execFixtureGit(root, ["rm", "-q", "docs/a.md"]);
  writeFileSync(join(root, "sibling.txt"), "someone else's\n");
  git(root, "add", "sibling.txt");
  const outcome = commitPaths(["README.md", "docs/a.md", "docs/b.md"], `chore(work): land\n\n${TRAILER}`, root);
  expect(outcome.ok, outcome.ok ? "" : outcome.reason).toBe(true);
  expect(outcome.ok && outcome.sha).toBe(git(root, "rev-parse", "HEAD"));
  expect(git(root, "rev-parse", "HEAD^")).toBe(head);
  expect(git(root, "show", "--name-status", "--format=", "HEAD")).toBe("M\tREADME.md\nD\tdocs/a.md\nA\tdocs/b.md");
  expect(git(root, "status", "--porcelain")).toBe("A  sibling.txt");
  expect(readFileSync(join(root, "README.md"), "utf8")).toBe("# changed\n");
});

test("the commit is refused before it is written when its message fails the commit-message contract", async ({ plantedTree }) => {
  const root = await repo(plantedTree);
  const head = git(root, "rev-parse", "HEAD");
  writeFileSync(join(root, "README.md"), "# changed\n");
  const outcome = commitPaths(["README.md"], "chore(work): no trailer here", root);
  expect(outcome.ok).toBe(false);
  expect(!outcome.ok && outcome.reason).toContain("Co-Authored-By");
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
});

test("a hook's exported GIT_DIR and GIT_INDEX_FILE never redirect the commit into the checkout running the hook", async ({ plantedTree }) => {
  const root = await repo(plantedTree);
  const foreign = await repo(plantedTree);
  const foreignHead = git(foreign, "rev-parse", "HEAD");
  const head = git(root, "rev-parse", "HEAD");
  writeFileSync(join(root, "README.md"), "# changed\n");
  // The shape git gives every hook child: the running checkout's repository and index, by absolute path.
  const outcome = await withProcessEnv("GIT_DIR", join(foreign, ".git"), () =>
    withProcessEnv("GIT_INDEX_FILE", join(foreign, ".git", "index"), () =>
      Promise.resolve(commitPaths(["README.md"], `chore(work): land\n\n${TRAILER}`, root)),
    ),
  );
  expect(outcome.ok, outcome.ok ? "" : outcome.reason).toBe(true);
  expect(git(root, "rev-parse", "HEAD^")).toBe(head);
  expect(git(foreign, "rev-parse", "HEAD"), "the foreign repository's HEAD must not move").toBe(foreignHead);
  expect(git(foreign, "status", "--porcelain"), "the foreign repository's index must not change").toBe("");
});

test("a ref git cannot move answers with git's own words, and HEAD stays put", async ({ plantedTree }) => {
  const root = await repo(plantedTree);
  const head = git(root, "rev-parse", "HEAD");
  writeFileSync(join(root, "README.md"), "# changed\n");
  writeFileSync(join(root, ".git", "refs", "heads", "main.lock"), "");
  const outcome = commitPaths(["README.md"], `chore(work): land\n\n${TRAILER}`, root);
  expect(outcome.ok).toBe(false);
  expect(!outcome.ok && outcome.reason).toContain("update-ref failed");
  expect(!outcome.ok && outcome.reason).toContain("cannot lock ref");
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
});
