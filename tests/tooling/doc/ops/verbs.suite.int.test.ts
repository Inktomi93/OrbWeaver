// The write verbs on planted trees: what each writes, the indexes it regenerates, and the refusal that
// writes nothing. A suite because the verbs share one planted shape and each proves a different door.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { archive, newAdr, newItem, newPlan, nextAdrId, regenerateIndexes, review, setItems, setStatus } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const TODAY = "2026-09-23";
const REGISTRY = "docs/architecture/core/Core-Path-Registry.md";
const REGISTRY_SOURCE = "# Registry\n\n> **RESERVED RANGE — D79–D105:** main-era rulings.\n\n## D1-D2\n\n- **D1** — one.\n\n- **D163** — last.\n";

function read(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}

test("new adr mints at the next free id past the registry and the reserved range, and refuses a twin slug", async ({ plantedTree }) => {
  const root = await plantedTree({ [REGISTRY]: REGISTRY_SOURCE, "docs/Mission.md": "---\nkind: law\nstatus: active\nupdated: 2026-01-01\n---\n\n# M\n" });
  expect(nextAdrId(root)).toBe(164);
  const first = newAdr("docs-system", "Docs system", root, TODAY);
  expect(first.refusals).toEqual([]);
  expect(first.written).toEqual(["docs/adr/0164-docs-system.md", "docs/adr/README.md", "docs/plans/README.md", "docs/work/README.md", "docs/law/README.md"]);
  expect(read(root, "docs/adr/0164-docs-system.md")).toContain("---\nkind: adr\nstatus: active\nupdated: 2026-09-23\n---\n\n# Docs system\n\n## Context\n");
  expect(read(root, "docs/adr/README.md")).toContain("| D164 | [Docs system](0164-docs-system.md) | active |");
  expect(nextAdrId(root)).toBe(165);
  const twin = newAdr("docs-system", null, root, TODAY);
  expect(twin.written).toEqual([]);
  expect(twin.refusals[0]).toContain("an ADR with slug docs-system exists");
  const reservedOnly = await plantedTree({ [REGISTRY]: "> **RESERVED RANGE — D79–D105:** x.\n\n## D1-D2\n\n- **D78** — y.\n" });
  expect(nextAdrId(reservedOnly)).toBe(106);
});

test("new plan mints design.md in its own folder and refuses an existing folder", async ({ plantedTree }) => {
  const root = await plantedTree({});
  const outcome = newPlan("doc-migration", null, root, TODAY);
  expect(outcome.written[0]).toBe("docs/plans/doc-migration/design.md");
  expect(read(root, "docs/plans/doc-migration/design.md")).toContain("# Doc migration\n\n## Goal\n");
  expect(read(root, "docs/plans/README.md")).toContain("| [Doc migration](doc-migration/design.md) | active |");
  expect(newPlan("doc-migration", null, root, TODAY).refusals[0]).toContain("docs/plans/doc-migration/: exists");
});

test("status writes both halves of a supersession and refuses a status the kind does not take", async ({ plantedTree }) => {
  const root = await plantedTree({});
  newAdr("first", "First", root, TODAY);
  newAdr("second", "Second", root, TODAY);
  const refused = setStatus({ status: "done", paths: ["docs/adr/0001-first.md"], by: null }, root, TODAY);
  expect(refused.written).toEqual([]);
  expect(refused.refusals).toEqual(["docs/adr/0001-first.md: status done is not one of active | superseded for kind adr"]);
  const superseded = setStatus({ status: "superseded", paths: ["docs/adr/0001-first.md"], by: "docs/adr/0002-second.md" }, root, "2026-09-24");
  expect(superseded.refusals).toEqual([]);
  expect(read(root, "docs/adr/0001-first.md")).toContain(
    "---\nkind: adr\nstatus: superseded\nupdated: 2026-09-24\nsuperseded-by: docs/adr/0002-second.md\n---\n",
  );
  expect(read(root, "docs/adr/0002-second.md")).toContain("supersedes: docs/adr/0001-first.md\n");
  expect(read(root, "docs/adr/README.md")).toContain("| D1 | [First](0001-first.md) | superseded by [0002-second.md](0002-second.md) |");
});

test("item mints under docs/work with the next id, joins its plan's tasks.md, and refuses an unknown plan", async ({ plantedTree }) => {
  const root = await plantedTree({});
  newPlan("p", "P", root, TODAY);
  const missing = newItem({ title: "Fix it", kind: "bug", priority: "P1", area: "docs", plan: "ghost", lane: null }, root, TODAY);
  expect(missing.written).toEqual([]);
  expect(missing.refusals[0]).toContain("no such plan");
  const first = newItem({ title: "Fix it", kind: "bug", priority: "P1", area: "docs", plan: "p", lane: null }, root, TODAY);
  expect(first.written).toContain("docs/work/0001-fix-it.md");
  expect(first.written).toContain("docs/plans/p/tasks.md");
  const second = newItem({ title: "Then this", kind: "work", priority: null, area: null, plan: null, lane: "cb-x" }, root, TODAY);
  expect(second.written).toContain("docs/work/0002-then-this.md");
  expect(read(root, "docs/work/0002-then-this.md")).toContain(
    "---\nkind: work\nstatus: doing\nupdated: 2026-09-23\nlane: cb-x\n---\n\n# Then this\n\n## What\n",
  );
  expect(read(root, "docs/plans/p/tasks.md")).toContain("- [ ] [0001](../../work/0001-fix-it.md) P1 Fix it `p`\n");
  expect(read(root, "docs/work/README.md")).toContain("## Doing\n\n- [0002](0002-then-this.md) triage Then this (cb-x)\n");
});

test("set transitions N items in one write, judges the final shape, and refuses all-or-nothing", async ({ plantedTree }) => {
  const root = await plantedTree({});
  newItem({ title: "A", kind: "work", priority: null, area: null, plan: null, lane: null }, root, TODAY);
  newItem({ title: "B", kind: "work", priority: null, area: null, plan: null, lane: null }, root, TODAY);
  const half = setItems([1, 2], { state: "doing" }, root, TODAY);
  expect(half.written).toEqual([]);
  expect(half.refusals).toEqual([
    "docs/work/0001-a.md: a doing item names its lane: pnpm doc set <id> doing --lane <lane>",
    "docs/work/0002-b.md: a doing item names its lane: pnpm doc set <id> doing --lane <lane>",
  ]);
  expect(read(root, "docs/work/0001-a.md")).toContain("status: open\n");
  const both = setItems([1, 2], { state: "blocked", blocked: "on 2" }, root, "2026-09-24");
  expect(both.written).toEqual(["docs/work/0001-a.md", "docs/work/0002-b.md", "docs/work/README.md"]);
  expect(read(root, "docs/work/0002-b.md")).toContain("status: blocked\nupdated: 2026-09-24\nblocked: on 2\n");
  expect(setItems([9], { state: "open" }, root, TODAY).refusals[0]).toContain("9: no such item");
});

test("review sets updated on a glob of docs in one write, and index regenerates only stale files", async ({ plantedTree }) => {
  const root = await plantedTree({});
  newAdr("one", "One", root, "2026-01-01");
  newAdr("two", "Two", root, "2026-01-01");
  const reviewed = review(["docs/adr/*.md"], root, TODAY);
  expect(reviewed.written).toEqual(["docs/adr/0001-one.md", "docs/adr/0002-two.md"]);
  expect(read(root, "docs/adr/0002-two.md")).toContain("updated: 2026-09-23\n");
  expect(review(["docs/adr/nope-*.md"], root, TODAY).refusals[0]).toContain("selects no governed document");
  expect(regenerateIndexes(root)).toEqual([]);
});

test("archive moves a finished plan and its done items into the dated archive folder and rewrites the old path everywhere tracked", async ({ plantedTree }) => {
  const root = await plantedTree({ "packages/kit/src/x.ts": "// See docs/plans/p/design.md for the shape.\nexport const x = 1;\n" });
  const { execFixtureGit } = await import("../../../../tooling/src/_shared/git-fixture.ts");
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
  newPlan("p", "P", root, TODAY);
  newItem({ title: "Task", kind: "work", priority: null, area: null, plan: "p", lane: null }, root, TODAY);
  execFixtureGit(root, ["add", "-A"]);
  const open = archive(["p"], root, TODAY);
  expect(open.written).toEqual([]);
  expect(open.refusals).toEqual(["docs/work/0001-task.md: open, and a plan archives only when every item is done"]);
  setItems([1], { state: "done", evidence: "abc1234" }, root, TODAY);
  const done = archive(["p"], root, TODAY);
  expect(done.refusals).toEqual([]);
  expect(existsSync(join(root, "docs/plans/p"))).toBe(false);
  expect(read(root, "docs/plans/archive/2026-09-23-p/design.md")).toContain("status: archived\n");
  expect(existsSync(join(root, "docs/plans/archive/2026-09-23-p/0001-task.md"))).toBe(true);
  expect(read(root, "docs/plans/archive/2026-09-23-p/tasks.md")).toContain("- [x] [0001](0001-task.md) triage Task `p` (abc1234)\n");
  expect(read(root, "packages/kit/src/x.ts")).toBe("// See docs/plans/archive/2026-09-23-p/design.md for the shape.\nexport const x = 1;\n");
  expect(read(root, "docs/plans/README.md")).toContain("| [P](archive/2026-09-23-p/design.md) | archived |");
  expect(archive(["ghost"], root, TODAY).refusals).toEqual(["docs/plans/ghost/: no such plan"]);
});
