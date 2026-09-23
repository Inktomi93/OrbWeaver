// The docs half of `pnpm check:agents` on planted trees: the structural rules, the writing rules and
// the reference check compose into one list; the clean tree passes; the real repository is clean.
import { docFileCount, docLayerProblems, LEGACY_ROOTS, newAdr, newItem, newPlan } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const TODAY = "2026-09-23";
const MISSION = "---\nkind: law\nstatus: active\nupdated: 2026-07-03\n---\n\n# Mission\n\nWhy this shape.\n";
/** The legacy roots the two-sided allowed-folders rule expects to find until their rows are deleted. */
const LEGACY = Object.fromEntries(LEGACY_ROOTS.map((name) => [name.endsWith(".md") ? `docs/${name}` : `docs/${name}/old.md`, "Landed 2026-01-01 in #12.\n"]));

test("a freshly minted tree is clean, and the count is the governed docs read", async ({ plantedTree }) => {
  const root = await plantedTree({ ...LEGACY, "docs/Mission.md": MISSION });
  newAdr("one", "One", root, TODAY);
  newPlan("p", "P", root, TODAY);
  newItem({ title: "T", kind: "work", priority: "P1", area: "docs", plan: "p", lane: null }, root, TODAY);
  expect(docLayerProblems(root)).toEqual([]);
  // The ADR, the plan, the item, the mission doc, the four indexes and the plan's tasks file; the legacy docs are not walked.
  expect(docFileCount(root)).toBe(9);
});

test("a writing-rule finding, a dead path and a structural finding all reach the one list", async ({ plantedTree }) => {
  const root = await plantedTree({ ...LEGACY, "docs/Mission.md": MISSION, "docs/notes.md": "# stray\n" });
  newAdr("one", "One", root, TODAY);
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

test("the real repository's governed docs are clean", ({ repoRoot }) => {
  expect(docFileCount(repoRoot)).toBeGreaterThan(0);
  expect(docLayerProblems(repoRoot)).toEqual([]);
});
