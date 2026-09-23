// The git-facing item verbs on a planted repository with a real `main`: land proves its evidence is on
// main, land --merged reads the merged commits' trailers and commits, and drift reads the tree's facts.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFixtureGit } from "../../../../tooling/src/_shared/git-fixture.ts";
import { drift, driftFacts, landItems, landMerged, newItem, overview } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const TODAY = "2026-09-23";
const IDENTITY = ["-c", "user.name=Doc Test", "-c", "user.email=doc@example.invalid"];

function git(root: string, ...args: readonly string[]): string {
  return execFixtureGit(root, [...IDENTITY, ...args]).trim();
}

function commitAll(root: string, message: string): string {
  git(root, "add", "-A");
  git(root, "commit", "-qm", message);
  return git(root, "rev-parse", "HEAD");
}

async function repo(plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>): Promise<string> {
  const root = await plantedTree({ "README.md": "# planted\n" });
  git(root, "init", "-q", "-b", "main");
  commitAll(root, "chore: base");
  return root;
}

test("land refuses evidence that is not on main and lands with evidence that is", async ({ plantedTree }) => {
  const root = await repo(plantedTree);
  newItem({ title: "A", kind: "work", priority: null, area: null, plan: null, lane: "cb-x" }, root, TODAY);
  const head = commitAll(root, "feat(x): a");
  const bogus = landItems([1], "0123456789abcdef0123456789abcdef01234567", root, TODAY);
  expect(bogus.written).toEqual([]);
  expect(bogus.refusals[0]).toContain("not a commit reachable from main");
  const landed = landItems([1], head, root, TODAY);
  expect(landed.refusals).toEqual([]);
  expect(readFileSync(join(root, "docs/work/0001-a.md"), "utf8")).toContain(`status: done\nupdated: 2026-09-23\nevidence: ${head}\n`);
  expect(overview(root)).toEqual(["open (0)", "doing (0)", "blocked (0)", "done (1)"]);
});

test("land --merged lands the Closes ids of the merged commits with the merge commit as evidence, commits only the item files, and is idempotent", async ({
  plantedTree,
}) => {
  const root = await repo(plantedTree);
  newItem({ title: "A", kind: "work", priority: null, area: null, plan: null, lane: null }, root, TODAY);
  newItem({ title: "B", kind: "work", priority: null, area: null, plan: null, lane: null }, root, TODAY);
  commitAll(root, "chore(work): items");
  git(root, "checkout", "-qb", "lane");
  writeFileSync(join(root, "lane.txt"), "lane work\n");
  commitAll(root, "feat(x): first\n\nCloses: 1\nCo-Authored-By: t <t@example.invalid>");
  git(root, "checkout", "-q", "main");
  // A sibling's pathspec-staged file on the shared main checkout must NOT ride the hook's commit (F2). A
  // fast-forward is the merge shape git allows over a dirty index (a real merge refuses it), so it is the
  // shape that exposes the sweep.
  writeFileSync(join(root, "sibling-staged.txt"), "someone else's work\n");
  git(root, "add", "sibling-staged.txt");
  git(root, "merge", "-q", "--ff-only", "lane");
  const merge = git(root, "rev-parse", "HEAD");
  const outcome = landMerged(root, TODAY);
  expect(outcome.refusals).toEqual([]);
  expect(outcome.written).toContain("docs/work/0001-a.md");
  expect(readFileSync(join(root, "docs/work/0001-a.md"), "utf8")).toContain(`evidence: ${merge}\n`);
  expect(readFileSync(join(root, "docs/work/0002-b.md"), "utf8")).toContain("status: open\n");
  expect(git(root, "log", "-1", "--format=%s")).toBe("chore(work): land 1");
  expect(
    git(root, "show", "--name-only", "--format=", "HEAD")
      .split("\n")
      .filter((line) => line !== ""),
  ).toEqual(["docs/plans/README.md", "docs/work/0001-a.md", "docs/work/README.md"].filter((path) => outcome.written.includes(path)).toSorted());
  expect(git(root, "status", "--porcelain")).toBe("A  sibling-staged.txt");
  // Idempotent (F10): the same trailer landing again writes nothing and mints no second commit.
  const landed = git(root, "rev-parse", "HEAD");
  const again = landItems([1], landed, root, "2026-09-30");
  expect(again).toEqual({ written: [], refusals: [], skipped: ["docs/work/0001-a.md: already done at " + merge.slice(0, 12)] });
  expect(readFileSync(join(root, "docs/work/0001-a.md"), "utf8")).toContain(`evidence: ${merge}\n`);
  // Off main, or with no trailer, the door is silent.
  git(root, "checkout", "-q", "lane");
  expect(landMerged(root, TODAY)).toEqual({ written: [], refusals: [], skipped: [] });
});

test("land --merged is all-or-nothing: an unknown id in a Closes trailer refuses the whole batch and writes nothing (F5)", async ({ plantedTree }) => {
  const root = await repo(plantedTree);
  newItem({ title: "A", kind: "work", priority: null, area: null, plan: null, lane: null }, root, TODAY);
  commitAll(root, "chore(work): items");
  git(root, "checkout", "-qb", "lane");
  writeFileSync(join(root, "lane.txt"), "lane work\n");
  commitAll(root, "feat(x): first\n\nCloses: 1, 99\nCo-Authored-By: t <t@example.invalid>");
  git(root, "checkout", "-q", "main");
  git(root, "merge", "-q", "--no-ff", "-m", "Merge lane", "lane");
  const before = git(root, "rev-parse", "HEAD");
  const outcome = landMerged(root, TODAY);
  expect(outcome.written).toEqual([]);
  expect(outcome.refusals).toEqual([
    "99: a merged commit closes it but no such item exists under docs/work/ — fix the trailer's id, then pnpm doc land 1 --evidence " + before,
  ]);
  expect(readFileSync(join(root, "docs/work/0001-a.md"), "utf8")).toContain("status: open\n");
  expect(git(root, "rev-parse", "HEAD")).toBe(before);
});

test("drift reads the repository: a stale doing item and an unlanded Closes trailer fire; a live lane branch keeps quiet", async ({ plantedTree }) => {
  const root = await repo(plantedTree);
  newItem({ title: "A", kind: "work", priority: null, area: null, plan: null, lane: "wt/cb-live-docs" }, root, TODAY);
  newItem({ title: "B", kind: "work", priority: null, area: null, plan: null, lane: "cb-live" }, root, TODAY);
  newItem({ title: "C", kind: "work", priority: null, area: null, plan: null, lane: null }, root, TODAY);
  commitAll(root, "chore(work): items");
  git(root, "branch", "wt/cb-live-docs");
  git(root, "checkout", "-q", "wt/cb-live-docs");
  writeFileSync(join(root, "lane.txt"), "lane work\n");
  commitAll(root, "feat(x): unmerged\n\nCo-Authored-By: t <t@example.invalid>");
  git(root, "checkout", "-q", "main");
  writeFileSync(join(root, "main.txt"), "main work\n");
  const closer = commitAll(root, "fix(x): closes c\n\nCloses: 3\nCo-Authored-By: t <t@example.invalid>");
  const facts = driftFacts(root);
  expect(facts.unmergedBranches).toEqual(["wt/cb-live-docs"]);
  expect(drift(root)).toEqual([
    "2 is doing under lane cb-live with no live worktree and no unmerged branch — pnpm doc set 2 open",
    `main commit ${closer} closes 3 but the item is not done (a conflict-resolved merge runs no post-merge hook) — pnpm doc land 3 --evidence ${closer}`,
  ]);
});

test("drift resolves wake conditions against the tree, never a shell: a present path and a gone path each wake", async ({ plantedTree }) => {
  const root = await repo(plantedTree);
  newItem({ title: "A", kind: "work", priority: null, area: null, plan: null, lane: null }, root, TODAY);
  newItem({ title: "B", kind: "work", priority: null, area: null, plan: null, lane: null }, root, TODAY);
  newItem({ title: "C", kind: "work", priority: null, area: null, plan: null, lane: null }, root, TODAY);
  newItem({ title: "D", kind: "work", priority: null, area: null, plan: null, lane: null }, root, TODAY);
  const { setItems } = await import("../../../../tooling/src/doc/index.ts");
  setItems([1], { state: "blocked", blocked: "wake path README.md" }, root, TODAY);
  setItems([2], { state: "blocked", blocked: "wake path never-there" }, root, TODAY);
  setItems([3], { state: "blocked", blocked: "wake gone never-there" }, root, TODAY);
  setItems([4], { state: "blocked", blocked: "wake gone README.md" }, root, TODAY);
  commitAll(root, "chore(work): blocked");
  expect(drift(root)).toEqual([
    "1 has a met wake condition (wake path README.md) — pnpm doc set 1 open",
    "3 has a met wake condition (wake gone never-there) — pnpm doc set 3 open",
  ]);
});
