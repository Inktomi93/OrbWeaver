// `landedCommit` names the commit that deleted an item's file. A merge counts only when the deletion happened
// IN the merge; a merge that merely carries a deletion one parent already had, or an `ours` merge, is not a
// landing. A wrong answer here lets a bad `Closes:` trailer read as landed.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { landStaged, newItem } from "../../../../tooling/src/doc/index.ts";
import { landedCommit } from "../../../../tooling/src/doc/ops/tree.ts";
import { configureFixtureGitIdentity, execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { written } from "../_written-item.ts";

const TODAY = "2026-09-23";
const TIMEOUT = { timeout: scaledBudget(60_000) };
const TRAILER = "Co-Authored-By: t <t@example.invalid>";
const ITEM = "docs/work/0001-a.md";

function git(root: string, ...args: readonly string[]): string {
  return execFixtureGit(root, args).trim();
}

function commitAll(root: string, message: string): string {
  git(root, "add", "-A");
  git(root, "commit", "-qm", `${message}\n\n${TRAILER}`);
  return git(root, "rev-parse", "HEAD");
}

/** A repository whose `main` holds the base commit and then item 1; returns the root and the base commit. */
async function repoWithItem(
  plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>,
): Promise<{ readonly root: string; readonly base: string }> {
  const root = await plantedTree({ "README.md": "# planted\n" });
  git(root, "init", "-q", "-b", "main");
  configureFixtureGitIdentity(root);
  const base = commitAll(root, "chore: base");
  newItem(written({ title: "A", kind: "work", priority: null, area: null, plan: null, lane: null }), root, TODAY);
  commitAll(root, "chore(work): items");
  return { root, base };
}

function land(root: string): string {
  git(root, "rm", "-q", ITEM);
  return commitAll(root, "chore(work): land 1");
}

test("a merge of a stale branch that still holds the file is not the landing; the deleting commit is", TIMEOUT, async ({ plantedTree }) => {
  const { root } = await repoWithItem(plantedTree);
  git(root, "checkout", "-qb", "stale");
  writeFileSync(join(root, "stale.txt"), "stale work\n");
  commitAll(root, "feat(x): stale");
  git(root, "checkout", "-q", "main");
  const landing = land(root);
  git(root, "merge", "-q", "--no-ff", "-m", "Merge stale", "stale");
  expect(landedCommit(1, root)).toBe(landing);
});

test("a lane's sync merge of the landed main is not the landing; the deleting commit is", TIMEOUT, async ({ plantedTree }) => {
  const { root } = await repoWithItem(plantedTree);
  git(root, "checkout", "-qb", "lane");
  writeFileSync(join(root, "lane.txt"), "lane work\n");
  commitAll(root, "feat(x): lane");
  git(root, "checkout", "-q", "main");
  const landing = land(root);
  git(root, "checkout", "-q", "lane");
  git(root, "merge", "-q", "--no-ff", "-m", "Sync main", "main");
  git(root, "checkout", "-q", "main");
  git(root, "merge", "-q", "--no-ff", "-m", "Merge lane", "lane");
  expect(landedCommit(1, root)).toBe(landing);
});

test("an `ours` merge that drops a never-landed item does not read as landed", TIMEOUT, async ({ plantedTree }) => {
  const { root, base } = await repoWithItem(plantedTree);
  git(root, "checkout", "-qb", "side", base);
  git(root, "merge", "-q", "-s", "ours", "-m", "Merge main (ours)", "main");
  expect(landedCommit(1, root)).toBeNull();
});

test("a deletion made inside the merge commit is its landing", TIMEOUT, async ({ plantedTree }) => {
  const { root } = await repoWithItem(plantedTree);
  git(root, "checkout", "-qb", "lane");
  writeFileSync(join(root, "lane.txt"), "lane work\n");
  commitAll(root, "feat(x): lane");
  git(root, "checkout", "-q", "main");
  git(root, "merge", "-q", "--no-ff", "--no-commit", "lane");
  expect(landStaged([1], root, TODAY).refusals).toEqual([]);
  const merge = commitAll(root, "Merge lane\n\nCloses: 1");
  expect(landedCommit(1, root)).toBe(merge);
  expect(landedCommit(7, root)).toBeNull();
});
