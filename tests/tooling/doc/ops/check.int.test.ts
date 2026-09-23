// The docs half of `pnpm check:agents` on planted trees: the structural rules, the writing rules and
// the reference check compose into one list; the clean tree passes; the real repository is clean.
import { docFileCount, docLayerProblems, newAdr, newItem, newItemsFrom, newPlan } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const TODAY = "2026-09-23";
const MISSION = "---\nkind: law\nstatus: active\nupdated: 2026-07-03\n---\n\n# Mission\n\nWhy this shape.\n";

test("a freshly minted tree is clean, and the count is the governed docs read", async ({ plantedTree }) => {
  const root = await plantedTree({ "docs/Mission.md": MISSION });
  newAdr({ slug: "one", title: "One" }, root, TODAY);
  newPlan({ slug: "p", title: "P" }, root, TODAY);
  newItem({ title: "T", kind: "work", priority: "P1", area: "docs", plan: "p", lane: null }, root, TODAY);
  expect(docLayerProblems(root)).toEqual([]);
  // The ADR, the plan, the item, the mission doc, the four indexes and the plan's tasks file.
  expect(docFileCount(root)).toBe(9);
});

test("a batch of complete items, blocked ones included, round-trips through the check clean", async ({ plantedTree }) => {
  const text = { what: "The change.", why: "The symptom.", done: "The bar." };
  const root = await plantedTree({
    "docs/Mission.md": MISSION,
    "items.json": JSON.stringify([
      { title: "Build it", kind: "work", priority: "P1", area: "docs", ...text },
      { title: "After it", kind: "work", blocked: "on 1", ...text },
      { title: "Owner call", kind: "decision", blocked: "owner", ...text },
      { title: "In flight", kind: "tooling", lane: "cb-x", ...text },
    ]),
  });
  expect(newItemsFrom("items.json", root, TODAY).refusals).toEqual([]);
  expect(docLayerProblems(root)).toEqual([]);
});

test("a writing-rule finding, a dead path and a structural finding all reach the one list", async ({ plantedTree }) => {
  const root = await plantedTree({ "docs/Mission.md": MISSION, "docs/notes.md": "# stray\n" });
  newAdr({ slug: "one", title: "One" }, root, TODAY);
  const { writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  writeFileSync(
    join(root, "docs/adr/0001-one.md"),
    "---\nkind: adr\nstatus: active\nupdated: 2026-09-23\n---\n\n# One\n\nRuled on 2026-09-01; see `tooling/src/gone.ts` and [x](../../missing.md).\n\n## Context\n\n## Decision\n\n## Consequences\n",
  );
  expect(docLayerProblems(root)).toEqual([
    "docs/notes.md: not a docs home — put a decision under docs/adr/, a program under docs/plans/, an item under docs/work/, law under docs/law/",
    "docs/adr/0001-one.md: missing required section ## Alternatives rejected",
    'docs/adr/0001-one.md:9: a date ("2026-09-01")',
    "docs/adr/0001-one.md:9: link target does not exist: ../../missing.md",
    "docs/adr/0001-one.md:9: path does not exist: tooling/src/gone.ts",
  ]);
});

test("a relative code-span path resolves against its own file: a missing target reds with file and line, a live one passes", async ({ plantedTree }) => {
  const root = await plantedTree({ "docs/Mission.md": MISSION, "docs/law/live.md": "---\nkind: law\nstatus: active\nupdated: 2026-09-23\n---\n\n# Live\n" });
  newAdr({ slug: "one", title: "One" }, root, TODAY);
  const { writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  writeFileSync(
    join(root, "docs/adr/0001-one.md"),
    "---\nkind: adr\nstatus: active\nupdated: 2026-09-23\n---\n\n# One\n\nSee `../law/live.md`.\nSee `../law/x.md:4`.\n\n## Context\n\n## Decision\n\n## Alternatives rejected\n\n## Consequences\n",
  );
  expect(docLayerProblems(root)).toEqual(["docs/adr/0001-one.md:10: path does not exist: ../law/x.md"]);
});

test("the walk sees a nested item folder and a non-markdown file under a governed tree (F12)", async ({ plantedTree }) => {
  const root = await plantedTree({ "docs/Mission.md": MISSION, "docs/adr/notes.txt": "stray\n" });
  newItem({ title: "T", kind: "work", priority: null, area: null, plan: null, lane: null }, root, TODAY);
  const { mkdirSync, renameSync } = await import("node:fs");
  const { join } = await import("node:path");
  mkdirSync(join(root, "docs/work/sub"));
  renameSync(join(root, "docs/work/0001-t.md"), join(root, "docs/work/sub/0001-t.md"));
  const problems = docLayerProblems(root);
  expect(problems).toContain("docs/adr/notes.txt: only markdown lives under a governed tree — move or delete it");
  expect(problems).toContain("docs/work/sub/0001-t.md: docs/work/ is flat — an item is docs/work/NNNN-<slug>.md");
});

test("the real repository's governed docs are clean", ({ repoRoot }) => {
  expect(docFileCount(repoRoot)).toBeGreaterThan(0);
  expect(docLayerProblems(repoRoot)).toEqual([]);
});
