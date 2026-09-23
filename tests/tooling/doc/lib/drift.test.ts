// The drift nag as a pure rule: each of the four lines fires on a planted fact and stays silent on the
// consistent control, and the `Closes:` trailer reader.
import type { DriftFacts, WorkItem } from "../../../../tooling/src/doc/index.ts";
import { closesTrailer, driftLines, wakeConditions } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function item(overrides: Partial<WorkItem>): WorkItem {
  return {
    id: 1,
    path: "docs/work/0001-a.md",
    title: "A",
    kind: "work",
    state: "open",
    updated: "2026-09-23",
    priority: null,
    area: null,
    lane: null,
    blocked: null,
    plan: null,
    evidence: null,
    reviewed: null,
    ...overrides,
  };
}

function facts(overrides: Partial<DriftFacts>): DriftFacts {
  return { items: [], worktreeBranches: [], unmergedBranches: [], closedOnMain: [], wokenItems: new Set(), ...overrides };
}

test("a consistent tree prints nothing", () => {
  const consistent = facts({
    items: [
      item({ id: 1, state: "doing", lane: "wt/agent-cb-x" }),
      item({ id: 2, state: "blocked", blocked: "on 1" }),
      item({ id: 3, state: "done", evidence: "abc" }),
    ],
    worktreeBranches: ["wt/agent-cb-x"],
    closedOnMain: [{ sha: "abc", ids: [3] }],
  });
  expect(driftLines(consistent)).toEqual([]);
});

test("a doing item is live only when its lane names a worktree or unmerged branch EXACTLY; a substring is stale", () => {
  const stale = facts({ items: [item({ id: 1, state: "doing", lane: "cb-x" })], unmergedBranches: ["wt/cb-x-docs", "codex/cb-x"] });
  expect(driftLines(stale)).toEqual(["1 is doing under lane cb-x with no live worktree and no unmerged branch — pnpm doc set 1 open"]);
  expect(driftLines({ ...stale, unmergedBranches: ["cb-x"] })).toEqual([]);
  expect(driftLines({ ...stale, worktreeBranches: ["cb-x"] })).toEqual([]);
});

test("a main commit whose Closes trailer names an unlanded item is reported once, with the landing command", () => {
  const unlanded = facts({
    items: [item({ id: 1 }), item({ id: 2, state: "done", evidence: "def" })],
    closedOnMain: [
      { sha: "def", ids: [1, 2] },
      { sha: "abc", ids: [1] },
    ],
  });
  expect(driftLines(unlanded)).toEqual([
    "main commit def closes 1 but the item is not done (a conflict-resolved merge runs no post-merge hook) — pnpm doc land 1 --evidence def",
  ]);
});

test("a blocked-on item whose blocker is done, and a met wake condition, each name the reopen command", () => {
  const blocked = facts({ items: [item({ id: 1, state: "done", evidence: "abc" }), item({ id: 2, state: "blocked", blocked: "on 1" })] });
  expect(driftLines(blocked)).toEqual(["2 is blocked on 1, which is done — pnpm doc set 2 open"]);
  const woken = facts({ items: [item({ id: 3, state: "blocked", blocked: "wake path x" })], wokenItems: new Set([3]) });
  expect(driftLines(woken)).toEqual(["3 has a met wake condition (wake path x) — pnpm doc set 3 open"]);
  expect(driftLines({ ...woken, wokenItems: new Set() })).toEqual([]);
});

test("wake conditions are collected from blocked items only, and the Closes trailer parses ids", () => {
  const items = [item({ id: 3, state: "blocked", blocked: "wake path x" }), item({ id: 4, state: "open", blocked: "wake gone y" })];
  expect([...wakeConditions(items)]).toEqual([[3, { kind: "wake", presence: "path", path: "x" }]]);
  expect(closesTrailer("fix(x): y\n\nCloses: 12, 14\nCo-Authored-By: a <a@b.c>\n")).toEqual([12, 14]);
  expect(closesTrailer("fix(x): y\n")).toEqual([]);
  expect(closesTrailer("Closes: twelve, 0, 7\n")).toEqual([7]);
});
