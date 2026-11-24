// `pnpm unwired coverage` end to end over a planted repository whose `test:coverage` script stands in for vitest: the
// command hands the suite its own scope, lists production files no input saw, reaps what the suite leaves running and
// measures the merge it runs in-process.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { UsageError } from "@orb/tooling/floor/cli/run-tool";
import { configureFixtureGitIdentity, runFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { z } from "zod";
import { COVERAGE_RUN_DIR, INCOMPLETE_RUN, runCoverage } from "../../../tooling/src/unwired/coverage.ts";
import { PRODUCTION_COVERAGE_SCOPE } from "../../../tooling/src/unwired/coverage-merge.ts";

// Enough functions that parsing and merging the suite's map raises a fresh process's memory well past a one-function merge.
const FUNCTIONS = 400_000;
const MIB = 1024 * 1024;
// Well under what merging that map adds over a one-function merge in the same fresh process.
const MERGE_GROWTH_BYTES = 150 * MIB;

// How the stand-in suite ends: it passes, fails a test, crashes, is killed with its runner, or writes no map.
const ENDINGS = {
  pass: "",
  "test-failure": "process.exit(1);",
  crash: "process.exit(134);",
  // The runner itself dies, so the command sees a signal and no exit code.
  killed: 'process.kill(process.ppid, "SIGKILL");',
  "no-map": "",
} as const;
type Ending = keyof typeof ENDINGS;

// The stand-in suite: it records its argv, leaves a helper running in its own process group, and writes a vitest json
// map that lists only `a.ts`.
const fakeSuite = (functions: number, ending: Ending = "pass"): string => `import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
writeFileSync("argv.json", JSON.stringify(args));
const helper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" });
helper.unref();
writeFileSync("helper.pid", String(helper.pid));
const out = args.find((arg) => arg.startsWith("--coverage.reportsDirectory=")).slice("--coverage.reportsDirectory=".length);
const path = join(process.cwd(), "packages/demo/src/a.ts");
const at = (line) => ({ start: { line, column: 0 }, end: { line, column: 1 } });
const fnMap = {};
const f = {};
for (let i = 0; i < ${String(functions)}; i++) {
  fnMap[i] = { name: "f" + i, decl: at(i + 1), loc: at(i + 1), line: i + 1 };
  f[i] = 0;
}
${ending === "no-map" ? "" : 'mkdirSync(out, { recursive: true });\nwriteFileSync(join(out, "coverage-final.json"), JSON.stringify({ [path]: { path, fnMap, f, branchMap: {}, b: {} } }));'}
${ENDINGS[ending]}
`;

const reportSchema = z.object({
  suites: z.array(z.object({ peakRssBytes: z.number() })),
  mergePeakRssBytes: z.number(),
  unseenFiles: z.array(z.string()),
});

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("one run hands vitest the scope, lists unseen files and reaps the suite's helpers", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({
    "package.json": JSON.stringify({ name: "planted", private: true, scripts: { "test:coverage": "node fake-suite.mjs" } }),
    "fake-suite.mjs": fakeSuite(FUNCTIONS),
    "packages/demo/src/a.ts": "export const a = 1;\n",
    "packages/demo/src/index.ts": "export const b = 2;\n",
  });
  expect(runFixtureGit(root, ["init", "--quiet"]).status).toBe(0);
  expect(runFixtureGit(root, ["add", "--all"]).status).toBe(0);
  const lines: string[] = [];
  const code = await runCoverage([`--root=${root}`, "--suites=node", "--node=tests/demo.test.ts", "--out=report.json"], (line) => lines.push(line));
  expect(code).toBe(0);
  const argv = z.array(z.string()).parse(JSON.parse(readFileSync(join(root, "argv.json"), "utf8")));
  expect(argv).toEqual(
    expect.arrayContaining([
      `--coverage.include=${PRODUCTION_COVERAGE_SCOPE.include}`,
      ...PRODUCTION_COVERAGE_SCOPE.exclude.map((glob) => `--coverage.exclude=${glob}`),
    ]),
  );
  const report = reportSchema.parse(JSON.parse(readFileSync(join(root, "report.json"), "utf8")));
  expect(report.unseenFiles).toEqual(["packages/demo/src/index.ts"]);
  // The helper left the suite's process group, so only the run-marker sweep can reach it.
  expect(alive(Number(readFileSync(join(root, "helper.pid"), "utf8")))).toBe(false);
});

// The merge is synchronous, so only a sample taken after it returns sees what it built. Each run is a fresh CLI process,
// so the gap between a large map's merge peak and a one-function merge's is what the merge itself built: a worker that
// already holds free heap from earlier cases, or a busy box, moves neither run's start.
test("the merge's peak holds what the merge built", { timeout: 120_000, tags: ["slow"] }, async ({ plantedTree, runCli }) => {
  const mergePeak = async (functions: number): Promise<number> => {
    const root = await plantedTree({
      "package.json": JSON.stringify({ name: "planted", private: true, scripts: { "test:coverage": "node fake-suite.mjs" } }),
      "fake-suite.mjs": fakeSuite(functions),
      "packages/demo/src/a.ts": "export const a = 1;\n",
    });
    expect(runFixtureGit(root, ["init", "--quiet"]).status).toBe(0);
    expect(runFixtureGit(root, ["add", "--all"]).status).toBe(0);
    const run = await runCli("unwired", ["coverage", `--root=${root}`, "--suites=node", "--node=tests/demo.test.ts", "--out=report.json"]);
    await expect(run).toExitWith(EXIT.clean);
    return reportSchema.parse(JSON.parse(readFileSync(join(root, "report.json"), "utf8"))).mergePeakRssBytes;
  };
  const small = await mergePeak(1);
  const large = await mergePeak(FUNCTIONS);
  expect(large - small).toBeGreaterThan(MERGE_GROWTH_BYTES);
});

const mergedSchema = z.object({ suites: z.array(z.object({ suite: z.string(), head: z.string().nullable(), tree: z.string() })) });

const log = (): void => undefined;

// A committed planted repository whose `test:coverage` is the stand-in with the given ending.
async function plantRepo(plantedTree: (files: Record<string, string>) => Promise<string>, ending: Ending = "pass"): Promise<string> {
  const root = await plantedTree({
    "package.json": JSON.stringify({ name: "planted", private: true, scripts: { "test:coverage": "node fake-suite.mjs" } }),
    "fake-suite.mjs": fakeSuite(1, ending),
    // What the stand-in writes stays out of the tree, as reports/ is ignored in the repository.
    ".gitignore": "reports/\nargv.json\nhelper.pid\n",
    "packages/demo/src/a.ts": "export const a = 1;\n",
  });
  expect(runFixtureGit(root, ["init", "--quiet"]).status).toBe(0);
  configureFixtureGitIdentity(root);
  expect(runFixtureGit(root, ["add", "--all"]).status).toBe(0);
  expect(runFixtureGit(root, ["commit", "--quiet", "--message=plant"]).status).toBe(0);
  return root;
}

test("a recorded suite merges on the tree it ran on and is refused once the tree moved", { timeout: 60_000 }, async ({ plantedTree }) => {
  const root = await plantRepo(plantedTree);
  expect(await runCoverage([`--root=${root}`, "--suites=node", "--out=reports/first.json"], log)).toBe(0);
  // Merging the record alone runs no suite: the stand-in would rewrite argv.json if it ran.
  rmSync(join(root, "argv.json"));
  expect(await runCoverage([`--root=${root}`, "--merge=node,node", "--out=reports/merged.json"], log)).toBe(0);
  expect(existsSync(join(root, "argv.json"))).toBe(false);
  const merged = mergedSchema.parse(JSON.parse(readFileSync(join(root, "reports/merged.json"), "utf8")));
  const [record] = merged.suites;
  // A suite named twice is merged once.
  expect(merged.suites.map((run) => run.suite)).toEqual(["node"]);
  expect(record?.head).toBe(runFixtureGit(root, ["rev-parse", "HEAD"]).stdout.trim());

  // A new untracked file moves the working tree, though no tracked file changed.
  writeFileSync(join(root, "packages/demo/src/b.ts"), "export const b = 1;\n");
  await expect(runCoverage([`--root=${root}`, "--merge=node", "--out=reports/untracked.json"], log)).rejects.toThrow(
    `node was recorded on head ${record?.head ?? ""} tree ${record?.tree ?? ""}, but the current tree is`,
  );
  rmSync(join(root, "packages/demo/src/b.ts"));
  // Control: with the file gone the tree is the recorded one again.
  expect(await runCoverage([`--root=${root}`, "--merge=node", "--out=reports/again.json"], log)).toBe(0);

  // An uncommitted edit moves the working tree under the same HEAD, so only the tree id can see it.
  writeFileSync(join(root, "packages/demo/src/a.ts"), "export const a = 2;\n");
  const refused = runCoverage([`--root=${root}`, "--merge=node", "--out=reports/refused.json"], log);
  await expect(refused).rejects.toThrow(UsageError);
  await expect(refused).rejects.toThrow(
    `node was recorded on head ${record?.head ?? ""} tree ${record?.tree ?? ""}, but the current tree is head ${record?.head ?? ""} tree `,
  );
  expect(existsSync(join(root, "reports/refused.json"))).toBe(false);
});

test("a run clears its own suite's old output and keeps every other suite's record", { timeout: 60_000 }, async ({ plantedTree }) => {
  const root = await plantRepo(plantedTree);
  expect(await runCoverage([`--root=${root}`, "--suites=node", "--out=reports/first.json"], log)).toBe(0);
  // A hits file from an older node run, and a ct record this run does not touch.
  const stale = join(root, COVERAGE_RUN_DIR, "node", "coverage-stale.json");
  writeFileSync(stale, "{}");
  const sibling = join(root, COVERAGE_RUN_DIR, "ct.run.json");
  writeFileSync(sibling, "{}");
  expect(await runCoverage([`--root=${root}`, "--suites=node", "--out=reports/second.json"], log)).toBe(0);
  expect(existsSync(stale)).toBe(false);
  expect(existsSync(sibling)).toBe(true);
});

test("a report written outside reports/ does not move the tree a later merge compares", { timeout: 60_000 }, async ({ plantedTree }) => {
  const root = await plantRepo(plantedTree);
  expect(await runCoverage([`--root=${root}`, "--suites=node", "--out=coverage-report.json"], log)).toBe(0);
  expect(existsSync(join(root, "coverage-report.json"))).toBe(true);
  expect(await runCoverage([`--root=${root}`, "--merge=node", "--out=elsewhere/merged.json"], log)).toBe(0);
  expect(await runCoverage([`--root=${root}`, "--merge=node"], log)).toBe(0);
  // Control: any other untracked file still moves the tree.
  writeFileSync(join(root, "notes.txt"), "x\n");
  await expect(runCoverage([`--root=${root}`, "--merge=node", "--out=elsewhere/refused.json"], log)).rejects.toThrow("node was recorded on");
});

test("a suite whose tests failed still merges: a failed test is a verdict and its coverage is whole", { timeout: 60_000 }, async ({ plantedTree }) => {
  const root = await plantRepo(plantedTree, "test-failure");
  expect(await runCoverage([`--root=${root}`, "--suites=node", "--out=reports/first.json"], log)).toBe(0);
  expect(await runCoverage([`--root=${root}`, "--merge=node", "--out=reports/merged.json"], log)).toBe(0);
});

const recordSchema = z.object({ exitCode: z.number().nullable(), incomplete: z.string().nullable() });

// Each ending with no test verdict, and the cause its record names.
const CUT_SHORT: readonly (readonly [Ending, string])[] = [
  ["crash", INCOMPLETE_RUN.crash],
  ["killed", INCOMPLETE_RUN.signal],
  ["no-map", INCOMPLETE_RUN.noMap],
];

test.for(CUT_SHORT)("a suite ending in %s is recorded incomplete and never merged", { timeout: 60_000 }, async ([ending, cause], { plantedTree }) => {
  const root = await plantRepo(plantedTree, ending);
  const run = runCoverage([`--root=${root}`, "--suites=node", "--out=reports/first.json"], log);
  await expect(run).rejects.toThrow(UsageError);
  await expect(run).rejects.toThrow(`node is incomplete (${cause}`);
  // The record stays, so a later merge names the same cause rather than a missing file.
  const record = recordSchema.parse(JSON.parse(readFileSync(join(root, COVERAGE_RUN_DIR, "node.run.json"), "utf8")));
  expect(record.incomplete).toBe(cause);
  const merge = runCoverage([`--root=${root}`, "--merge=node", "--out=reports/merged.json"], log);
  await expect(merge).rejects.toThrow(UsageError);
  await expect(merge).rejects.toThrow(`node is incomplete (${cause}`);
  expect(existsSync(join(root, "reports/merged.json"))).toBe(false);
});
