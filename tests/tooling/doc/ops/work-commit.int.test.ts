// `set --commit` and `item --commit`: the verb's written paths plus every other uncommitted change under
// docs/work/ go into one commit, and nothing outside docs/work/ rides along.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { finishWrite, newItem, newItemsFrom, setItems, workCommitMessage } from "../../../../tooling/src/doc/index.ts";
import { configureFixtureGitIdentity, execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { scaledBudget } from "../../_load-budget.ts";

const TODAY = "2026-09-23";
const TIMEOUT = { timeout: scaledBudget(60_000) };
const TRAILER = "Co-Authored-By: pnpm doc <doc-tool@orbweaver.invalid>";
const MAX_HEADER = 200;

function git(root: string, ...args: readonly string[]): string {
  return execFixtureGit(root, args).trim();
}

function commitAll(root: string, message: string): string {
  git(root, "add", "-A");
  git(root, "commit", "-qm", message);
  return git(root, "rev-parse", "HEAD");
}

function committedNames(root: string): readonly string[] {
  return git(root, "show", "--name-only", "--format=", "HEAD")
    .split("\n")
    .filter((line) => line !== "")
    .toSorted();
}

const MINT = { kind: "work", priority: null, area: null, plan: null, lane: null } as const;

async function repoWithItems(plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>): Promise<string> {
  const root = await plantedTree({ "README.md": "# planted\n" });
  git(root, "init", "-q", "-b", "main");
  configureFixtureGitIdentity(root);
  commitAll(root, "chore: base");
  for (const title of ["A", "B", "C"]) {
    newItem({ ...MINT, title }, root, TODAY);
  }
  commitAll(root, "chore(work): items");
  return root;
}

test("set --commit sweeps an earlier uncommitted set into one commit that names every id", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  const before = git(root, "rev-list", "--count", "HEAD");
  expect(setItems([1], { state: "doing", lane: "a" }, root, TODAY).refusals).toEqual([]);
  const outcome = finishWrite(setItems([2, 3], { state: "doing", lane: "b" }, root, TODAY), true, root);
  expect(outcome.refusals).toEqual([]);
  expect(Number(git(root, "rev-list", "--count", "HEAD")) - Number(before)).toBe(1);
  expect(committedNames(root)).toEqual(expect.arrayContaining(["docs/work/0001-a.md", "docs/work/0002-b.md", "docs/work/0003-c.md"]));
  expect(outcome.written).toEqual(expect.arrayContaining(["docs/work/0001-a.md", "docs/work/0002-b.md", "docs/work/0003-c.md"]));
  expect(git(root, "log", "-1", "--format=%B")).toBe(`chore(work): update 1, 2, 3\n\n${TRAILER}`);
  expect(outcome.committed).toBe(git(root, "rev-parse", "HEAD"));
  expect(git(root, "status", "--porcelain")).toBe("");
});

test("set --commit leaves a staged and an unstaged file outside docs/work/ out of the commit", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  writeFileSync(join(root, "sibling-staged.txt"), "someone else's work\n");
  git(root, "add", "sibling-staged.txt");
  writeFileSync(join(root, "README.md"), "# edited by someone\n");
  const outcome = finishWrite(setItems([1], { state: "doing", lane: "a" }, root, TODAY), true, root);
  expect(outcome.refusals).toEqual([]);
  expect(committedNames(root)).toEqual(outcome.written.toSorted());
  expect(committedNames(root)).not.toContain("sibling-staged.txt");
  expect(committedNames(root)).not.toContain("README.md");
  expect(git(root, "diff", "--cached", "--name-only")).toBe("sibling-staged.txt");
  expect(git(root, "diff", "--name-only")).toBe("README.md");
});

test("item --commit commits the minted items, from flags and from a batch file", TIMEOUT, async ({ plantedTree, scratch }) => {
  const root = await repoWithItems(plantedTree);
  const single = finishWrite(newItem({ ...MINT, title: "D" }, root, TODAY), true, root);
  expect(single.refusals).toEqual([]);
  expect(git(root, "log", "-1", "--format=%s")).toBe("chore(work): update 4");
  expect(committedNames(root)).toEqual(expect.arrayContaining(["docs/work/0004-d.md"]));
  const batch = join(scratch, "batch.json");
  writeFileSync(
    batch,
    JSON.stringify([
      { title: "E", kind: "work" },
      { title: "F", kind: "bug" },
    ]),
  );
  const many = finishWrite(newItemsFrom(batch, root, TODAY), true, root);
  expect(many.refusals).toEqual([]);
  expect(git(root, "log", "-1", "--format=%s")).toBe("chore(work): update 5, 6");
  expect(git(root, "status", "--porcelain")).toBe("");
});

test("a refused set --commit commits nothing, and without --commit nothing is committed", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  const head = git(root, "rev-parse", "HEAD");
  const refused = finishWrite(setItems([99], { state: "doing", lane: "a" }, root, TODAY), true, root);
  expect(refused.written).toEqual([]);
  expect(refused.refusals).toHaveLength(1);
  expect(refused.committed).toBeUndefined();
  expect(setItems([1], { state: "doing", lane: "a" }, root, TODAY).committed).toBeUndefined();
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
  expect(git(root, "status", "--porcelain")).toContain("M docs/work/0001-a.md");
});

test("a set --commit whose commit git refuses reports the written files and git's own reason", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  const head = git(root, "rev-parse", "HEAD");
  // A stale ref lock is git's own refusal shape: the commit object is written, the ref update is not.
  writeFileSync(join(root, ".git", "refs", "heads", "main.lock"), "");
  const outcome = finishWrite(setItems([1], { state: "doing", lane: "a" }, root, TODAY), true, root);
  expect(outcome.written).toContain("docs/work/0001-a.md");
  expect(outcome.refusals).toHaveLength(1);
  expect(outcome.refusals[0]).toContain("cannot lock ref");
  expect(outcome.committed).toBeUndefined();
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
});

test("the work commit's header is capped at the commit-message limit however many ids it names", () => {
  const ids = Array.from({ length: 120 }, (_, index) => index + 1);
  const message = workCommitMessage(ids, TRAILER);
  expect(message.split("\n")[0]?.length).toBeLessThanOrEqual(MAX_HEADER);
  expect(message.endsWith(TRAILER)).toBe(true);
});
