// The landing door from inside git's own merge hook: `land --merged` runs while `MERGE_HEAD` still
// exists, which is the state a porcelain pathspec commit refuses, and a refused landing names git's reason.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { REPO_ROOT } from "../../../../tooling/src/_shared/artifacts.ts";
import { execFixtureGit, runFixtureGit } from "../../../../tooling/src/_shared/git-fixture.ts";
import { landItems, newItem } from "../../../../tooling/src/doc/index.ts";
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

async function repoWithItem(plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>): Promise<string> {
  const root = await plantedTree({ "README.md": "# planted\n" });
  git(root, "init", "-q", "-b", "main");
  commitAll(root, "chore: base");
  newItem({ title: "A", kind: "work", priority: null, area: null, plan: null, lane: null }, root, TODAY);
  commitAll(root, "chore(work): items");
  return root;
}

/** A real `post-merge` hook that runs the landing door from inside git's own merge. The hook writes the
 *  outcome beside the repository so the test reads what the door answered, not only what git did. */
function plantLandingHook(scratch: string): { readonly hooksDir: string; readonly outcomePath: string } {
  const hooksDir = join(scratch, "hooks");
  const outcomePath = join(scratch, "landing.json");
  const script = join(scratch, "land-hook.ts");
  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(
    script,
    [
      `import { writeFileSync } from "node:fs";`,
      `import { landMerged } from ${JSON.stringify(pathToFileURL(join(REPO_ROOT, "tooling/src/doc/index.ts")).href)};`,
      `writeFileSync(${JSON.stringify(outcomePath)}, JSON.stringify(landMerged(process.cwd(), ${JSON.stringify(TODAY)})));`,
      "",
    ].join("\n"),
  );
  writeFileSync(join(hooksDir, "post-merge"), `#!/bin/sh\nexec "${process.execPath}" "${script}"\n`, { mode: 0o755 });
  return { hooksDir, outcomePath };
}

test("land --merged commits from INSIDE a real post-merge hook, while git's MERGE_HEAD still exists", async ({ plantedTree, scratch }) => {
  const root = await repoWithItem(plantedTree);
  git(root, "checkout", "-qb", "lane");
  writeFileSync(join(root, "lane.txt"), "lane work\n");
  commitAll(root, "feat(x): first\n\nCloses: 1\nCo-Authored-By: t <t@example.invalid>");
  git(root, "checkout", "-q", "main");
  const { hooksDir, outcomePath } = plantLandingHook(scratch);
  // The fixture door disables hooks; a later `-c` outranks it, so THIS merge runs the planted hook.
  const merged = runFixtureGit(root, [...IDENTITY, "-c", `core.hooksPath=${hooksDir}`, "merge", "-q", "--no-ff", "-m", "Merge lane", "lane"]);
  expect(merged.status, merged.stderr).toBe(0);
  const outcome = JSON.parse(readFileSync(outcomePath, "utf8")) as { readonly refusals: readonly string[] };
  expect(outcome.refusals).toEqual([]);
  expect(git(root, "log", "-1", "--format=%s")).toBe("chore(work): land 1");
  expect(git(root, "log", "-1", "--format=%s", "HEAD^")).toBe("Merge lane");
  expect(existsSync(join(root, "docs/work/0001-a.md"))).toBe(false);
  expect(git(root, "status", "--porcelain")).toBe("");
});

test("a landing whose commit git refuses prints git's own message, and the files stay written for the by-hand commit", async ({ plantedTree }) => {
  const root = await repoWithItem(plantedTree);
  const head = git(root, "rev-parse", "HEAD");
  // A stale ref lock is git's own refusal shape: the commit object is written, the ref update is not.
  writeFileSync(join(root, ".git", "refs", "heads", "main.lock"), "");
  const outcome = landItems([1], head, root, TODAY);
  expect(outcome.written).toContain("docs/work/0001-a.md");
  expect(outcome.refusals).toHaveLength(1);
  expect(outcome.refusals[0]).toContain("the landing commit failed");
  expect(outcome.refusals[0]).toContain("cannot lock ref");
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
});
