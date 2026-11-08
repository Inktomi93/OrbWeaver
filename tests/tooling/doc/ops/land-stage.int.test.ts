// `land --stage`: the landing without the commit. It stages exactly the paths the landing wrote in the
// checkout's real index and leaves every other path alone, so the caller's own `git commit` carries the
// item deletion with its final files and the later `land --merged` finds the id already landed.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { landMerged, landStaged, newItem } from "../../../../tooling/src/doc/index.ts";
import { configureFixtureGitIdentity, execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { checkoutState, fileTimes, pinFileTimes } from "../_checkout-state.ts";
import { written } from "../_written-item.ts";

const TODAY = "2026-09-23";
const SHORT_SHA = 12;
const TIMEOUT = { timeout: scaledBudget(60_000) };
const TRAILER = "Co-Authored-By: t <t@example.invalid>";

function git(root: string, ...args: readonly string[]): string {
  return execFixtureGit(root, args).trim();
}

function commitAll(root: string, message: string): string {
  git(root, "add", "-A");
  git(root, "commit", "-qm", message);
  return git(root, "rev-parse", "HEAD");
}

function lines(output: string): readonly string[] {
  return output.split("\n").filter((line) => line !== "");
}

function stagedNames(root: string): readonly string[] {
  return lines(git(root, "diff", "--cached", "--name-only")).toSorted();
}

async function repoWithItems(plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>): Promise<string> {
  const root = await plantedTree({ "README.md": "# planted\n" });
  git(root, "init", "-q", "-b", "main");
  configureFixtureGitIdentity(root);
  commitAll(root, "chore: base");
  newItem(written({ title: "A", kind: "work", priority: null, area: null, plan: null, lane: "lane", content: { what: "Split the ledger." } }), root, TODAY);
  newItem(written({ title: "B", kind: "work", priority: null, area: null, plan: null, lane: null, blocked: "on 1" }), root, TODAY);
  commitAll(root, "chore(work): items");
  return root;
}

test(
  "land --stage stages exactly what the landing wrote, commits nothing, and leaves a sibling's staged and untracked files alone",
  TIMEOUT,
  async ({ plantedTree }) => {
    const root = await repoWithItems(plantedTree);
    const head = git(root, "rev-parse", "HEAD");
    writeFileSync(join(root, "sibling-staged.txt"), "someone else's work\n");
    git(root, "add", "sibling-staged.txt");
    writeFileSync(join(root, "sibling-loose.txt"), "not staged\n");
    const outcome = landStaged([1], root, TODAY);
    expect(outcome.refusals).toEqual([]);
    expect(outcome.written).toContain("docs/work/0001-a.md");
    expect(outcome.written).toContain("docs/work/0002-b.md");
    expect(git(root, "rev-parse", "HEAD")).toBe(head);
    expect(existsSync(join(root, "docs/work/0001-a.md"))).toBe(false);
    expect(stagedNames(root)).toEqual([...outcome.written, "sibling-staged.txt"].toSorted());
    expect(git(root, "diff", "--cached", "--name-status", "--", "docs/work/0001-a.md")).toBe("D\tdocs/work/0001-a.md");
    expect(git(root, "status", "--porcelain")).toContain("?? sibling-loose.txt");
    expect(outcome.staged?.closes).toBe("Closes: 1");
    expect(outcome.staged?.record).toBe("0001 A\n  Split the ledger.");
  },
);

test(
  "a commit after land --stage carries the deletion, and land --merged then finds the id already landed through a --no-commit merge, with MERGE_HEAD present",
  TIMEOUT,
  async ({ plantedTree }) => {
    const root = await repoWithItems(plantedTree);
    git(root, "checkout", "-qb", "lane");
    writeFileSync(join(root, "lane.txt"), "lane work\n");
    commitAll(root, `feat(x): the work\n\n${TRAILER}`);
    git(root, "checkout", "-q", "main");
    git(root, "merge", "-q", "--no-ff", "--no-commit", "lane");
    expect(existsSync(join(root, ".git", "MERGE_HEAD"))).toBe(true);
    const outcome = landStaged([1], root, TODAY);
    expect(outcome.refusals).toEqual([]);
    expect(stagedNames(root)).toEqual([...outcome.written, "lane.txt"].toSorted());
    const merge = commitAll(root, `Merge lane\n\nCloses: 1\n${TRAILER}`);
    expect(git(root, "rev-list", "--parents", "-n1", "HEAD").split(" ")).toHaveLength(3);
    expect(git(root, "diff", "--name-status", "HEAD^1", "HEAD", "--", "docs/work/0001-a.md")).toBe("D\tdocs/work/0001-a.md");
    const already = { written: [], refusals: [], skipped: [`1: already landed at ${merge.slice(0, SHORT_SHA)}`] };
    expect(landMerged(root, TODAY, false)).toEqual(already);
    expect(landMerged(root, TODAY, true)).toEqual(already);
    expect(git(root, "rev-parse", "HEAD")).toBe(merge);
    expect(git(root, "status", "--porcelain")).toBe("");
  },
);

test("a plain commit after land --stage is likewise landed already for land --merged --head-merge", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  expect(landStaged([1], root, TODAY).refusals).toEqual([]);
  const commit = commitAll(root, `feat(x): the work\n\nCloses: 1\n${TRAILER}`);
  expect(landMerged(root, TODAY, true)).toEqual({ written: [], refusals: [], skipped: [`1: already landed at ${commit.slice(0, SHORT_SHA)}`] });
  expect(git(root, "rev-parse", "HEAD")).toBe(commit);
});

test("a refused land --stage stages, deletes and writes nothing", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  newItem(written({ title: "C", kind: "work", priority: null, area: null, plan: null, lane: null, content: { what: "After [A](0001-a.md)." } }), root, TODAY);
  const head = commitAll(root, "chore(work): c");
  const cited = landStaged([1], root, TODAY);
  expect(cited.written).toEqual([]);
  expect(cited.refusals).toEqual(["docs/work/0003-c.md: refers to docs/work/0001-a.md — remove the reference first"]);
  const unknown = landStaged([2, 7], root, TODAY);
  expect(unknown.written).toEqual([]);
  expect(unknown.refusals).toEqual(["7: no such item under docs/work/, and git shows no landing for it — check the id"]);
  expect(cited.staged).toBeUndefined();
  expect(unknown.staged).toBeUndefined();
  expect(stagedNames(root)).toEqual([]);
  expect(existsSync(join(root, "docs/work/0001-a.md"))).toBe(true);
  expect(existsSync(join(root, "docs/work/0002-b.md"))).toBe(true);
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
  expect(git(root, "status", "--porcelain")).toBe("");
});

test("land --stage under a held index lock refuses before any write and leaves the files and index as they were", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  pinFileTimes(root);
  const pinned = fileTimes(root);
  const indexLock = join(root, ".git", "index.lock");
  writeFileSync(indexLock, "");
  const locked = landStaged([1], root, TODAY);
  expect(locked.written).toEqual([]);
  expect(locked.staged).toBeUndefined();
  expect(locked.refusals).toHaveLength(1);
  expect(locked.refusals[0]).toContain("index.lock");
  // The lock refuses before the write: a file written and then put back would match its bytes but not its time.
  expect(fileTimes(root)).toBe(pinned);
  expect(readFileSync(join(root, "docs/work/0002-b.md"), "utf8")).toContain("blocked: on 1");
  rmSync(indexLock);
  expect(existsSync(join(root, "docs/work/0001-a.md"))).toBe(true);
  expect(git(root, "status", "--porcelain")).toBe("");
  // Positive control: with the lock gone the same landing stages, so the refusal above stood in front of a real write.
  expect(landStaged([1], root, TODAY).refusals).toEqual([]);
  expect(existsSync(join(root, "docs/work/0001-a.md"))).toBe(false);
});

test("a land --stage whose staging git refuses puts every written file back and stages nothing", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  const before = checkoutState(root);
  const indexPath = join(root, ".git", "index");
  const goodIndex = readFileSync(indexPath);
  // A damaged index is git's own refusal shape for the staging step, reached after the write and with no lock held.
  writeFileSync(indexPath, "not an index");
  const refused = landStaged([1], root, TODAY);
  writeFileSync(indexPath, goodIndex);
  expect(refused.written).toEqual([]);
  expect(refused.staged).toBeUndefined();
  expect(refused.refusals).toHaveLength(1);
  expect(refused.refusals[0]).toContain("update-index");
  expect(checkoutState(root)).toBe(before);
  // Positive control: with the index whole the same landing stages, so the refusal above stood after a real write.
  expect(landStaged([1], root, TODAY).refusals).toEqual([]);
  expect(existsSync(join(root, "docs/work/0001-a.md"))).toBe(false);
});

test("a repeated land --stage before the commit says the landing is already staged and changes nothing", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  expect(landStaged([1], root, TODAY).refusals).toEqual([]);
  const staged = stagedNames(root);
  const again = landStaged([1], root, TODAY);
  expect(again.written).toEqual([]);
  expect(again.refusals).toHaveLength(1);
  expect(again.refusals[0]).toContain("already staged");
  expect(stagedNames(root)).toEqual(staged);
});

test("land --stage lands an item git never tracked, and several ids make one Closes line and one record each", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  newItem(written({ title: "Fresh", kind: "work", priority: null, area: null, plan: null, lane: null, content: { what: "Never committed." } }), root, TODAY);
  const outcome = landStaged([3, 1], root, TODAY);
  expect(outcome.refusals).toEqual([]);
  expect(outcome.staged?.closes).toBe("Closes: 3, 1");
  expect(outcome.staged?.record).toBe("0003 Fresh\n  Never committed.\n\n0001 A\n  Split the ledger.");
  expect(stagedNames(root)).toEqual([...outcome.written].filter((path) => path !== "docs/work/0003-fresh.md").toSorted());
  expect(git(root, "status", "--porcelain")).not.toContain("0003-fresh");
});
