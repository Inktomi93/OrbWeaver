// `set --title` renames an item's file. The verb stages both halves of the rename, so the caller's own commit carries
// the old name's deletion and the new name's arrival together and git history reads one item, not two holding one id.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { newItem, parseDocCommand, runDocCommand } from "../../../../tooling/src/doc/index.ts";
import { EXIT } from "../../../../tooling/src/floor/cli/exit-contract.ts";
import { configureFixtureGitIdentity, execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { written } from "../_written-item.ts";

const TODAY = "2026-09-23";
const TIMEOUT = { timeout: scaledBudget(60_000) };
const OLD_PATH = "docs/work/0001-a.md";
const NEW_PATH = "docs/work/0001-renamed.md";
const MINT = { kind: "work", priority: null, area: null, plan: null, lane: null } as const;

function git(root: string, ...args: readonly string[]): string {
  return execFixtureGit(root, args).trim();
}

function lines(output: string): readonly string[] {
  return output.split("\n").filter((line) => line !== "");
}

async function repoWithItems(plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>): Promise<string> {
  const root = await plantedTree({ "README.md": "# planted\n" });
  git(root, "init", "-q", "-b", "main");
  configureFixtureGitIdentity(root);
  for (const title of ["A", "B"]) {
    newItem(written({ ...MINT, title }), root, TODAY);
  }
  git(root, "add", "-A");
  git(root, "commit", "-qm", "chore(work): items");
  return root;
}

function retitle(root: string): void {
  expect(runDocCommand(parseDocCommand(["set", "1", "--title", "Renamed"]), root)).toBe(EXIT.clean);
}

test("a retitle stages both halves of the rename and nothing else, so one commit carries them", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  writeFileSync(join(root, "README.md"), "# edited by someone\n");
  retitle(root);
  expect(lines(git(root, "diff", "--cached", "--name-only", "--no-renames"))).toEqual([OLD_PATH, NEW_PATH]);
  expect(lines(git(root, "diff", "--name-only"))).toContain("README.md");

  git(root, "commit", "-qm", "chore(work): retitle 1");
  expect(lines(git(root, "show", "--name-status", "--no-renames", "--format=", "HEAD"))).toEqual([`D\t${OLD_PATH}`, `A\t${NEW_PATH}`]);
});

test("a board commit after a retitle carries the staged rename and is not refused as an unrecorded landing", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  retitle(root);
  expect(runDocCommand(parseDocCommand(["set", "2", "--priority", "P1", "--commit"]), root)).toBe(EXIT.clean);
  const committed = lines(git(root, "show", "--name-only", "--no-renames", "--format=", "HEAD"));
  expect(committed).toEqual(expect.arrayContaining([OLD_PATH, NEW_PATH, "docs/work/0002-b.md"]));
  expect(git(root, "status", "--porcelain")).toBe("");
});

test("a staged deletion with no item left under its id still blocks a board commit", TIMEOUT, async ({ plantedTree }) => {
  const root = await repoWithItems(plantedTree);
  const head = git(root, "rev-parse", "HEAD");
  git(root, "rm", "--quiet", OLD_PATH);
  expect(runDocCommand(parseDocCommand(["set", "2", "--priority", "P1", "--commit"]), root)).toBe(EXIT.violations);
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
});
