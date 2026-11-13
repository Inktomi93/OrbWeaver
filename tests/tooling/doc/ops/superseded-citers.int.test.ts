// Superseding a ruling names every line that still cites it, by its `D<n>` id or by its path, so the author re-points
// or keeps each one knowingly. The superseded doc, its successor and the generated indexes are the write's own text.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { newAdr, setStatus } from "../../../../tooling/src/doc/index.ts";
import { configureFixtureGitIdentity, execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { scaledBudget } from "../../_load-budget.ts";

const TODAY = "2026-09-23";
const TIMEOUT = { timeout: scaledBudget(60_000) };
const OLD = "docs/adr/0001-first.md";
const NEXT = "docs/adr/0002-second.md";
const THIRD = "docs/adr/0003-third.md";
const LAW = "docs/law/rules.md";
const CODE = "packages/a/src/x.ts";

const LAW_SOURCE = [
  "---",
  "kind: law",
  "status: active",
  "updated: 2026-01-01",
  "---",
  "",
  "# Rules",
  "",
  "Follow D1 when you add a seam.",
  "",
  "D10 and D12 are other rulings.",
  "",
  "The first ruling is [the seam](../adr/0001-first.md).",
  "",
].join("\n");

const CODE_SOURCE = ["// D1 holds this seam.", "export const seam = 1;", "// PD-1 and D11 are not that ruling.", "// see docs/adr/0001-first.md", ""].join(
  "\n",
);

async function repoWithRulings(plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>): Promise<string> {
  const root = await plantedTree({ [LAW]: LAW_SOURCE });
  execFixtureGit(root, ["init", "-q", "-b", "main"]);
  configureFixtureGitIdentity(root);
  for (const [slug, title] of [
    ["first", "First"],
    ["second", "Second"],
    ["third", "Third"],
  ] as const) {
    expect(newAdr({ slug, title }, root, TODAY).refusals).toEqual([]);
  }
  mkdirSync(join(root, "packages/a/src"), { recursive: true });
  writeFileSync(join(root, CODE), CODE_SOURCE);
  execFixtureGit(root, ["add", "-A"]);
  execFixtureGit(root, ["commit", "-qm", "chore: rulings and their citers"]);
  return root;
}

test("superseding a ruling lists each line that cites it by id or by path, and no line that cites another", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithRulings(plantedTree);
  const outcome = setStatus({ status: "superseded", paths: [OLD], by: NEXT }, root, TODAY);
  expect(outcome.refusals).toEqual([]);
  expect(outcome.citers).toEqual([
    { path: LAW, line: 9, target: OLD, text: "Follow D1 when you add a seam." },
    { path: LAW, line: 13, target: OLD, text: "The first ruling is [the seam](../adr/0001-first.md)." },
    { path: CODE, line: 1, target: OLD, text: "// D1 holds this seam." },
    { path: CODE, line: 4, target: OLD, text: "// see docs/adr/0001-first.md" },
  ]);
});

test("a status other than superseded lists no citers, and a superseded ruling nothing cites lists none", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithRulings(plantedTree);
  expect(setStatus({ status: "rejected", paths: [OLD], by: null }, root, TODAY).citers).toBeUndefined();
  const uncited = setStatus({ status: "superseded", paths: [THIRD], by: NEXT }, root, TODAY);
  expect(uncited.refusals).toEqual([]);
  expect(uncited.citers).toEqual([]);
});
