import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, plantDir, plantFile, plantLink, test } from "@orb/testkit/tooling";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";

const SCRIPT_REL = "scripts/worktree-codegraph-index.sh";
const MAIN_WITNESS = "main-index";
const FAILED_SYNC_EXIT = 9;
const REFUSED_MAIN_EXIT = 2;
const NO_MAIN_INDEX_EXIT = 1;

interface SyncCall {
  command: string;
  project: string;
  values: string[];
}

function git(cwd: string, ...args: string[]): void {
  execFixtureGit(cwd, ["-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args]);
}

function seedIndex(path: string, witness: string): void {
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE witness (value TEXT)");
  db.prepare("INSERT INTO witness VALUES (?)").run(witness);
  db.close();
}

function witnesses(path: string): string[] {
  const db = new DatabaseSync(path, { readOnly: true });
  const rows = db.prepare("SELECT value FROM witness ORDER BY rowid").all() as { value: string }[];
  db.close();
  return rows.map((row) => row.value);
}

/** A main checkout holding an index, plus a registered worktree beside it. Names carry a space and a quote on purpose. */
function plantWorktree(scratch: string): { main: string; lane: string; mainIndex: string; laneIndex: string } {
  const root = realpathSync(scratch);
  const main = plantDir(root, "main checkout");
  const lane = join(root, "lane O'Brien checkout");
  plantFile(main, "package.json", "{}\n");
  git(main, "init", "--quiet");
  git(main, "config", "user.email", "test@orb.local");
  git(main, "config", "user.name", "orb test");
  git(main, "add", "package.json");
  git(main, "commit", "--quiet", "-m", "fixture");
  git(main, "worktree", "add", "--quiet", "-b", "lane", lane);
  plantDir(main, ".codegraph");
  const mainIndex = join(main, ".codegraph", "codegraph.db");
  seedIndex(mainIndex, MAIN_WITNESS);
  return { main, lane, mainIndex, laneIndex: join(lane, ".codegraph", "codegraph.db") };
}

/** A `codegraph` that records each call with the witness rows the project's index held at that moment. */
async function fakeCodegraph(fakeBin: (name: string, source: string) => Promise<void>, log: string, exitCode: number): Promise<void> {
  await fakeBin(
    "codegraph",
    `import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const [command, project] = process.argv.slice(2);
const db = new DatabaseSync(join(project, ".codegraph/codegraph.db"), { readOnly: true });
const values = db.prepare("SELECT value FROM witness ORDER BY rowid").all().map((row) => row.value);
db.close();
appendFileSync(${JSON.stringify(log)}, JSON.stringify({ command, project, values }) + "\\n");
process.exitCode = ${String(exitCode)};
`,
  );
}

function syncCalls(log: string): SyncCall[] {
  return readFileSync(log, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as SyncCall);
}

function runScript(repoRoot: string, cwd: string): { status: number | null; stdout: string; stderr: string } {
  const { status, stdout, stderr } = spawnSync("bash", [join(repoRoot, SCRIPT_REL)], { cwd, encoding: "utf8" });
  return { status, stdout, stderr };
}

test("the script copies main's index into the worktree and syncs that copy", async ({ fakeBin, repoRoot, scratch }) => {
  const { main, lane, mainIndex, laneIndex } = plantWorktree(scratch);
  const log = join(scratch, "codegraph.log");
  await fakeCodegraph(fakeBin, log, 0);
  const run = runScript(repoRoot, lane);
  expect(run.status, run.stderr).toBe(0);
  expect(witnesses(laneIndex)).toEqual([MAIN_WITNESS]);
  expect(syncCalls(log)).toEqual([{ command: "sync", project: lane, values: [MAIN_WITNESS] }]);
  expect(run.stdout).toContain(`copied ${mainIndex} into ${lane}`);
  expect(readdirSync(join(lane, ".codegraph"))).toEqual(["codegraph.db"]);
  expect(readdirSync(join(main, ".codegraph"))).toEqual(["codegraph.db"]);
  expect(witnesses(mainIndex)).toEqual([MAIN_WITNESS]);
});

test("a rerun keeps the worktree's index and only syncs it", async ({ fakeBin, repoRoot, scratch }) => {
  const { lane, mainIndex, laneIndex } = plantWorktree(scratch);
  const log = join(scratch, "codegraph.log");
  await fakeCodegraph(fakeBin, log, 0);
  expect(runScript(repoRoot, lane).status).toBe(0);
  const edit = new DatabaseSync(laneIndex);
  edit.exec("INSERT INTO witness VALUES ('lane-edit')");
  edit.close();
  const rerun = runScript(repoRoot, lane);
  expect(rerun.status, rerun.stderr).toBe(0);
  expect(rerun.stdout).toContain("already has an index");
  expect(witnesses(laneIndex)).toEqual([MAIN_WITNESS, "lane-edit"]);
  expect(syncCalls(log).map((call) => call.values)).toEqual([[MAIN_WITNESS], [MAIN_WITNESS, "lane-edit"]]);
  expect(witnesses(mainIndex)).toEqual([MAIN_WITNESS]);
});

test("a failed sync is the script's exit code, and a rerun finishes the sync", async ({ fakeBin, repoRoot, scratch }) => {
  const { lane } = plantWorktree(scratch);
  const log = join(scratch, "codegraph.log");
  await fakeCodegraph(fakeBin, log, FAILED_SYNC_EXIT);
  const failed = runScript(repoRoot, lane);
  expect(failed.status).toBe(FAILED_SYNC_EXIT);
  expect(failed.stdout).not.toContain("done");
  await fakeCodegraph(fakeBin, log, 0);
  const rerun = runScript(repoRoot, lane);
  expect(rerun.status, rerun.stderr).toBe(0);
  expect(rerun.stdout).toContain("done");
  expect(syncCalls(log)).toHaveLength(2);
});

test("a symlinked database is replaced by a copy and its target is left alone", async ({ fakeBin, repoRoot, scratch }) => {
  const { lane, laneIndex } = plantWorktree(scratch);
  const outside = join(realpathSync(scratch), "outside.db");
  seedIndex(outside, "outside");
  plantLink(lane, ".codegraph/codegraph.db", outside, "file");
  await fakeCodegraph(fakeBin, join(scratch, "codegraph.log"), 0);
  const run = runScript(repoRoot, lane);
  expect(run.status, run.stderr).toBe(0);
  expect(lstatSync(laneIndex).isSymbolicLink()).toBe(false);
  expect(witnesses(laneIndex)).toEqual([MAIN_WITNESS]);
  expect(witnesses(outside)).toEqual(["outside"]);
});

test("the main checkout is refused and nothing in it changes", async ({ fakeBin, repoRoot, scratch }) => {
  const { main, mainIndex } = plantWorktree(scratch);
  const log = join(scratch, "codegraph.log");
  await fakeCodegraph(fakeBin, log, 0);
  const run = runScript(repoRoot, main);
  expect(run.status).toBe(REFUSED_MAIN_EXIT);
  expect(run.stderr).toContain("is the main checkout");
  expect(existsSync(log)).toBe(false);
  expect(readdirSync(join(main, ".codegraph"))).toEqual(["codegraph.db"]);
  expect(witnesses(mainIndex)).toEqual([MAIN_WITNESS]);
});

test("a main checkout without an index is refused before the worktree gets a directory", async ({ fakeBin, repoRoot, scratch }) => {
  const { lane, mainIndex } = plantWorktree(scratch);
  const log = join(scratch, "codegraph.log");
  await fakeCodegraph(fakeBin, log, 0);
  rmSync(mainIndex);
  const run = runScript(repoRoot, lane);
  expect(run.status).toBe(NO_MAIN_INDEX_EXIT);
  expect(run.stderr).toContain(mainIndex);
  expect(existsSync(join(lane, ".codegraph"))).toBe(false);
  expect(existsSync(log)).toBe(false);
});
