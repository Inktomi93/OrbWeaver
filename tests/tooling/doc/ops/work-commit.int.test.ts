// `set --commit` and `item --commit`: the verb's written paths plus every other uncommitted change under
// docs/work/ go into one commit, and nothing outside docs/work/ rides along.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import {
  docLayerProblems,
  editItem,
  landStaged,
  newItem,
  newItemsFrom,
  newPlan,
  parseDocCommand,
  runDocCommand,
  runWrite,
  setItems,
  workCommitMessage,
} from "../../../../tooling/src/doc/index.ts";
import { MAX_HEADER } from "../../../../tooling/src/doc/lib/items.ts";
import { TOOL_TRAILER } from "../../../../tooling/src/doc/ops/tree.ts";
import { EXIT } from "../../../../tooling/src/floor/cli/exit-contract.ts";
import { configureFixtureGitIdentity, execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { checkoutState } from "../_checkout-state.ts";
import { plantConcurrentCommit } from "../_concurrent-commit.ts";
import { WRITTEN_CONTENT, written } from "../_written-item.ts";

const TODAY = "2026-09-23";
const TIMEOUT = { timeout: scaledBudget(60_000) };

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
    newItem(written({ ...MINT, title }), root, TODAY);
  }
  commitAll(root, "chore(work): items");
  return root;
}

test("set --commit sweeps an earlier uncommitted set into one commit that names every id", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  const before = git(root, "rev-list", "--count", "HEAD");
  expect(setItems([1], { state: "doing", lane: "a" }, root, TODAY).refusals).toEqual([]);
  const outcome = runWrite(true, root, () => setItems([2, 3], { state: "doing", lane: "b" }, root, TODAY));
  expect(outcome.refusals).toEqual([]);
  expect(Number(git(root, "rev-list", "--count", "HEAD")) - Number(before)).toBe(1);
  expect(committedNames(root)).toEqual(expect.arrayContaining(["docs/work/0001-a.md", "docs/work/0002-b.md", "docs/work/0003-c.md"]));
  expect(outcome.written).toEqual(expect.arrayContaining(["docs/work/0001-a.md", "docs/work/0002-b.md", "docs/work/0003-c.md"]));
  expect(git(root, "log", "-1", "--format=%B")).toBe(`chore(work): update 1, 2, 3\n\n${TOOL_TRAILER}`);
  expect(outcome.committed).toBe(git(root, "rev-parse", "HEAD"));
  expect(git(root, "status", "--porcelain")).toBe("");
});

test("set --commit leaves a staged and an unstaged file outside docs/work/ out of the commit", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  writeFileSync(join(root, "sibling-staged.txt"), "someone else's work\n");
  git(root, "add", "sibling-staged.txt");
  writeFileSync(join(root, "README.md"), "# edited by someone\n");
  const outcome = runWrite(true, root, () => setItems([1], { state: "doing", lane: "a" }, root, TODAY));
  expect(outcome.refusals).toEqual([]);
  expect(committedNames(root)).toEqual(outcome.written.toSorted());
  expect(committedNames(root)).not.toContain("sibling-staged.txt");
  expect(committedNames(root)).not.toContain("README.md");
  expect(git(root, "diff", "--cached", "--name-only")).toBe("sibling-staged.txt");
  expect(git(root, "diff", "--name-only")).toBe("README.md");
});

test("item --commit commits the minted items, from flags and from a batch file", TIMEOUT, async ({ plantedTree, scratch }) => {
  const root = await repoWithItems(plantedTree);
  const single = runWrite(true, root, () => newItem(written({ ...MINT, title: "D" }), root, TODAY));
  expect(single.refusals).toEqual([]);
  expect(git(root, "log", "-1", "--format=%s")).toBe("chore(work): update 4");
  expect(committedNames(root)).toEqual(expect.arrayContaining(["docs/work/0004-d.md"]));
  const batch = join(scratch, "batch.json");
  writeFileSync(
    batch,
    JSON.stringify([
      { title: "E", kind: "work", ...WRITTEN_CONTENT },
      { title: "F", kind: "bug", ...WRITTEN_CONTENT },
    ]),
  );
  const many = runWrite(true, root, () => newItemsFrom(batch, root, TODAY));
  expect(many.refusals).toEqual([]);
  expect(git(root, "log", "-1", "--format=%s")).toBe("chore(work): update 5, 6");
  expect(git(root, "status", "--porcelain")).toBe("");
});

test("a refused set --commit commits nothing, and without --commit nothing is committed", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  const head = git(root, "rev-parse", "HEAD");
  const refused = runWrite(true, root, () => setItems([99], { state: "doing", lane: "a" }, root, TODAY));
  expect(refused.written).toEqual([]);
  expect(refused.refusals).toHaveLength(1);
  expect(refused.committed).toBeUndefined();
  expect(setItems([1], { state: "doing", lane: "a" }, root, TODAY).committed).toBeUndefined();
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
  expect(git(root, "status", "--porcelain")).toContain("M docs/work/0001-a.md");
});

test("a set --commit whose commit git refuses puts every file back and reports git's own reason", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  const before = checkoutState(root);
  // A stale ref lock is git's own refusal shape: the commit object is written, the ref update is not.
  const refLock = join(root, ".git", "refs", "heads", "main.lock");
  writeFileSync(refLock, "");
  const outcome = runWrite(true, root, () => setItems([1], { state: "doing", lane: "a" }, root, TODAY));
  expect(outcome.written).toEqual([]);
  expect(outcome.refusals).toHaveLength(1);
  expect(outcome.refusals[0]).toContain("cannot lock ref");
  expect(outcome.committed).toBeUndefined();
  rmSync(refLock);
  expect(checkoutState(root)).toBe(before);
  // Positive control: the same write commits once the lock is gone, so the refusal above stood after a real write.
  const again = runWrite(true, root, () => setItems([1], { state: "doing", lane: "a" }, root, TODAY));
  expect(again.refusals).toEqual([]);
  expect(again.committed).toBe(git(root, "rev-parse", "HEAD"));
});

test("a retitling set --commit whose commit git refuses puts back the renamed file and the references it rewrote", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  writeFileSync(join(root, "notes.ts"), "// see docs/work/0001-a.md\n");
  writeFileSync(join(root, "docs/work/0002-b.md"), `${readFileSync(join(root, "docs/work/0002-b.md"), "utf8")}\nAfter [A](0001-a.md).\n`);
  commitAll(root, "chore: a code file and an item that cite item 1");
  const before = checkoutState(root);
  const refLock = join(root, ".git", "refs", "heads", "main.lock");
  writeFileSync(refLock, "");
  const outcome = runWrite(true, root, () => setItems([1], { title: "Renamed" }, root, TODAY));
  expect(outcome.written).toEqual([]);
  expect(outcome.refusals).toHaveLength(1);
  rmSync(refLock);
  expect(checkoutState(root)).toBe(before);
  // Positive control: unlocked, the retitle renames the file and rewrites both citers in one commit.
  const again = runWrite(true, root, () => setItems([1], { title: "Renamed" }, root, TODAY));
  expect(again.refusals).toEqual([]);
  expect(committedNames(root)).toEqual(expect.arrayContaining(["docs/work/0001-renamed.md", "notes.ts", "docs/work/0002-b.md"]));
  expect(git(root, "ls-tree", "--name-only", "HEAD", "docs/work/0001-a.md")).toBe("");
  expect(git(root, "show", "HEAD:notes.ts")).toContain("0001-renamed.md");
});

test(
  "a set --commit whose commit reached history before HEAD moved on leaves the files written and names both commits",
  TIMEOUT,
  async ({ plantedTree, scratch }) => {
    const root = await repoWithItems(plantedTree);
    const head = git(root, "rev-parse", "HEAD");
    plantConcurrentCommit(root, scratch);
    const outcome = runWrite(true, root, () => setItems([1], { state: "doing", lane: "a" }, root, TODAY));
    rmSync(join(root, ".git", "index.lock"));
    const concurrent = git(root, "rev-parse", "HEAD");
    const ours = git(root, "rev-parse", "HEAD^");
    expect(git(root, "rev-parse", `${ours}^`)).toBe(head);
    expect(git(root, "log", "-1", "--format=%s", ours)).toBe("chore(work): update 1");
    expect(outcome.committed).toBeUndefined();
    expect(outcome.refusals).toHaveLength(1);
    expect(outcome.refusals[0]).toContain(ours);
    expect(outcome.refusals[0]).toContain(concurrent);
    // HEAD holds the files, so putting them back would read as a revert.
    expect(outcome.written).toContain("docs/work/0001-a.md");
    expect(readFileSync(join(root, "docs/work/0001-a.md"), "utf8")).toContain("status: doing");
  },
);

test("the work commit's header is capped at the commit-message limit however many ids it names", () => {
  const ids = Array.from({ length: 120 }, (_, index) => index + 1);
  const message = workCommitMessage(ids, TOOL_TRAILER);
  expect(message.split("\n")[0]?.length).toBeLessThanOrEqual(MAX_HEADER);
  expect(message.endsWith(TOOL_TRAILER)).toBe(true);
});

test("edit --commit commits the edited section as one work commit", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  const outcome = runWrite(true, root, () => editItem(1, { why: "A new reason." }, root, "2026-10-01"));
  expect(outcome.refusals).toEqual([]);
  expect(git(root, "log", "-1", "--format=%s")).toBe("chore(work): update 1");
  expect(git(root, "show", "HEAD:docs/work/0001-a.md")).toContain("A new reason.");
  expect(git(root, "status", "--porcelain")).toBe("");
});

test("set --commit carries the plan task list an earlier set regenerated, so the docs check is clean at HEAD", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  newPlan({ slug: "foo", title: "Foo", rank: 1 }, root, TODAY);
  commitAll(root, "docs: plan foo");
  expect(setItems([1], { plan: "foo" }, root, TODAY).refusals).toEqual([]);
  const outcome = runWrite(true, root, () => setItems([2], { state: "doing", lane: "l" }, root, TODAY));
  expect(outcome.refusals).toEqual([]);
  expect(committedNames(root)).toContain("docs/plans/foo/tasks.md");
  expect(git(root, "status", "--porcelain")).toBe("");
  expect(docLayerProblems(root)).toEqual([]);
});

test("--commit refuses before any write while a landing is staged, and while a merge waits for its commit", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  const head = git(root, "rev-parse", "HEAD");
  const item = (): string => readFileSync(join(root, "docs/work/0002-b.md"), "utf8");
  const before = item();
  expect(landStaged([1], root, TODAY).refusals).toEqual([]);
  const staged = runWrite(true, root, () => setItems([2], { state: "doing", lane: "l" }, root, TODAY));
  expect(staged.written).toEqual([]);
  expect(staged.refusals.join("\n")).toContain("docs/work/0001-a.md");
  expect(item()).toBe(before);
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
  // The landing commits with its record; then a merge waiting for its commit blocks the next --commit.
  commitAll(root, "feat(x): work\n\nCloses: 1\nCo-Authored-By: t <t@example.invalid>");
  git(root, "checkout", "-qb", "lane");
  writeFileSync(join(root, "lane.txt"), "lane work\n");
  commitAll(root, "feat(x): lane\n\nCo-Authored-By: t <t@example.invalid>");
  git(root, "checkout", "-q", "main");
  git(root, "merge", "-q", "--no-ff", "--no-commit", "lane");
  const merging = runWrite(true, root, () => setItems([2], { state: "doing", lane: "l" }, root, TODAY));
  expect(merging.written).toEqual([]);
  expect(merging.refusals).toHaveLength(1);
  expect(item()).toBe(before);
});

test("a --commit whose write changed nothing makes no commit and says so", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  const head = git(root, "rev-parse", "HEAD");
  const outcome = runWrite(true, root, () => setItems([1], { state: "open" }, root, TODAY));
  expect(outcome.refusals).toEqual([]);
  expect(outcome.committed).toBeUndefined();
  expect(outcome.skipped).toHaveLength(1);
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
});

test("the parsed command runs --commit through runDocCommand against the given repository", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  const before = git(root, "rev-list", "--count", "HEAD");
  const code = runDocCommand(parseDocCommand(["set", "1", "2", "doing", "--lane", "l", "--commit"]), root);
  expect(code).toBe(EXIT.clean);
  expect(Number(git(root, "rev-list", "--count", "HEAD")) - Number(before)).toBe(1);
  expect(git(root, "log", "-1", "--format=%B")).toBe(`chore(work): update 1, 2\n\n${TOOL_TRAILER}`);
  expect(git(root, "status", "--porcelain")).toBe("");
});

test("--commit refuses before any write while a hand-owned doc the indexes describe is uncommitted", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  const head = git(root, "rev-parse", "HEAD");
  const before = readFileSync(join(root, "docs/work/0002-b.md"), "utf8");
  mkdirSync(join(root, "docs/law"), { recursive: true });
  writeFileSync(join(root, "docs/law/zed.md"), "# Zed\n");
  const outcome = runWrite(true, root, () => setItems([2], { state: "doing", lane: "l" }, root, TODAY));
  expect(outcome.written).toEqual([]);
  expect(outcome.refusals.join("\n")).toContain("docs/law/zed.md");
  expect(readFileSync(join(root, "docs/work/0002-b.md"), "utf8")).toBe(before);
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
});
