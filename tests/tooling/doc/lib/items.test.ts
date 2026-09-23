// Work items as data: the parse, the blocker grammar, and the transition patch that clears the
// companions of the states left behind.
import { applyPatch, itemTemplate, parseBlocker, parseItem } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const PATH = "docs/work/0007-ledger-split.md";
const SOURCE = itemTemplate({ kind: "work", status: "doing", updated: "2026-09-23", lane: "cb-x", priority: "P1", plan: "doc-migration" }, "Ledger split");

test("an item file parses to its fields, with absent fields as null", () => {
  expect(parseItem(PATH, SOURCE)).toEqual({
    id: 7,
    path: PATH,
    title: "Ledger split",
    kind: "work",
    state: "doing",
    updated: "2026-09-23",
    priority: "P1",
    area: null,
    lane: "cb-x",
    blocked: null,
    plan: "doc-migration",
    evidence: null,
    reviewed: null,
  });
});

test("a file outside the grammar, or with an unknown kind or state, is not an item", () => {
  expect(parseItem("docs/work/notes.md", SOURCE)).toBeNull();
  expect(parseItem(PATH, SOURCE.replace("kind: work", "kind: adr"))).toBeNull();
  expect(parseItem(PATH, SOURCE.replace("status: doing", "status: active"))).toBeNull();
  expect(parseItem(PATH, "# no block\n")).toBeNull();
});

test("the blocker grammar: owner, on <id>, wake <command>; anything else is no blocker", () => {
  expect(parseBlocker("owner")).toEqual({ kind: "owner" });
  expect(parseBlocker("on 12")).toEqual({ kind: "on", id: 12 });
  expect(parseBlocker("wake test -f reports/done")).toEqual({ kind: "wake", command: "test -f reports/done" });
  expect(parseBlocker("waiting on nate")).toBeNull();
});

test("a transition clears the companions of the states it leaves and keeps the fields it does not name", () => {
  const item = parseItem(PATH, SOURCE) as NonNullable<ReturnType<typeof parseItem>>;
  const blocked = applyPatch(SOURCE, item, { state: "blocked", blocked: "on 1" }, "2026-09-24");
  expect(blocked).toContain("status: blocked\nupdated: 2026-09-24\npriority: P1\nblocked: on 1\nplan: doc-migration\n");
  expect(blocked).not.toContain("lane:");
  const reopened = applyPatch(blocked, parseItem(PATH, blocked) as NonNullable<ReturnType<typeof parseItem>>, { state: "open", priority: null }, "2026-09-25");
  expect(reopened).not.toContain("blocked:");
  expect(reopened).not.toContain("priority:");
  expect(reopened).toContain("plan: doc-migration");
  expect(reopened).toContain("# Ledger split\n\n## What\n");
  const done = applyPatch(SOURCE, item, { state: "done", evidence: "abc1234" }, "2026-09-25");
  expect(done).toContain("evidence: abc1234");
  expect(done).not.toContain("lane:");
});
