// `pnpm doc remove` on planted trees: any governed doc nothing cites goes and the indexes follow — an
// item by id, an ADR, a law doc, a finished plan with its folder. Every citer refuses, all-or-nothing: a
// link or path, a D citation, an item filed under the plan, an item or parked plan waiting on the item.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { newAdr, newItem, newLaw, newPlan, removeDocs, setStatus } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const TODAY = "2026-09-23";
const OPEN = { priority: null, area: null, plan: null, lane: null } as const;

test("remove deletes items, an ADR, a law doc and a finished plan's folder nothing cites, and regenerates the indexes", async ({ plantedTree }) => {
  const root = await plantedTree({});
  newItem({ title: "Mistake", kind: "work", ...OPEN }, root, TODAY);
  newItem({ title: "Also a mistake", kind: "work", ...OPEN, blocked: "on 1" }, root, TODAY);
  newItem({ title: "Keeper", kind: "work", ...OPEN }, root, TODAY);
  newAdr({ slug: "dead", title: "Dead" }, root, TODAY);
  newLaw({ slug: "old-rule", title: null }, root, TODAY);
  newPlan({ slug: "p", title: "P" }, root, TODAY);
  const outcome = removeDocs(["1", "docs/work/0002-also-a-mistake.md", "docs/adr/0001-dead.md", "docs/law/old-rule.md", "docs/plans/p/design.md"], root);
  expect(outcome.refusals).toEqual([]);
  expect(outcome.written.slice(0, 5)).toEqual([
    "docs/work/0001-mistake.md",
    "docs/work/0002-also-a-mistake.md",
    "docs/adr/0001-dead.md",
    "docs/law/old-rule.md",
    "docs/plans/p/design.md",
  ]);
  for (const path of ["docs/work/0001-mistake.md", "docs/adr/0001-dead.md", "docs/law/old-rule.md", "docs/plans/p"]) {
    expect(existsSync(join(root, path))).toBe(false);
  }
  const index = readFileSync(join(root, "docs/work/README.md"), "utf8");
  expect(index).not.toContain("Mistake");
  expect(index).toContain("Keeper");
  expect(readFileSync(join(root, "docs/adr/README.md"), "utf8")).not.toContain("Dead");
});

test("remove refuses while anything cites the doc, and a target that is not a governed doc, writing nothing", async ({ plantedTree }) => {
  const root = await plantedTree({ "packages/kit/src/x.ts": "// The shape follows D1.\nexport const x = 1;\n" });
  // A citer outside docs/ is found through the repository's file list, so the planted tree is one.
  const { execFixtureGit } = await import("../../../../tooling/src/_shared/git-fixture.ts");
  execFixtureGit(root, ["init", "-q", "-b", "main"]);
  execFixtureGit(root, ["add", "-A"]);
  newItem({ title: "Needed", kind: "work", ...OPEN }, root, TODAY);
  newItem({ title: "Waiting", kind: "work", ...OPEN, blocked: "on 1" }, root, TODAY);
  newLaw({ slug: "rule", title: null }, root, TODAY);
  expect(newAdr({ slug: "cited", title: "Cited", content: { context: "See `docs/law/rule.md`." } }, root, TODAY).refusals).toEqual([]);
  newPlan({ slug: "p", title: "P" }, root, TODAY);
  newItem({ title: "Planned", kind: "work", ...OPEN, plan: "p" }, root, TODAY);
  expect(setStatus({ status: "parked", paths: ["docs/plans/p/design.md"], by: null, blocked: "on 1" }, root, TODAY).refusals).toEqual([]);
  expect(removeDocs(["1"], root).refusals).toEqual([
    "docs/work/0002-waiting.md: blocked on 1 — change its blocker first: pnpm doc set 2 open",
    "docs/plans/p/design.md: parked on 1 — pnpm doc status active docs/plans/p/design.md first",
  ]);
  expect(removeDocs(["docs/adr/0001-cited.md"], root).refusals).toEqual([
    "packages/kit/src/x.ts: cites D1 (docs/adr/0001-cited.md) — remove the citation first",
  ]);
  expect(removeDocs(["docs/law/rule.md"], root).refusals).toEqual(["docs/adr/0001-cited.md: refers to docs/law/rule.md — remove the reference first"]);
  expect(removeDocs(["docs/plans/p/design.md"], root).refusals).toEqual([
    "docs/work/0003-planned.md: filed under plan p — land it, or pnpm doc set 3 --plan none",
  ]);
  expect(removeDocs(["9", "docs/plans/p/tasks.md", "packages/kit/src/x.ts"], root).refusals).toEqual([
    "9: no such item under docs/work/ — pnpm doc overview lists them",
    "docs/plans/p/tasks.md: not a governed doc — remove takes an item id or a doc path under docs/adr/, docs/plans/, docs/work/, docs/law/",
    "packages/kit/src/x.ts: not a governed doc — remove takes an item id or a doc path under docs/adr/, docs/plans/, docs/work/, docs/law/",
  ]);
  for (const path of ["docs/work/0001-needed.md", "docs/adr/0001-cited.md", "docs/law/rule.md", "docs/plans/p/design.md"]) {
    expect(existsSync(join(root, path))).toBe(true);
  }
});
