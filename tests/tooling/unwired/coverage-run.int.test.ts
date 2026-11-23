// `pnpm unwired coverage` end to end over a planted repository whose `test:coverage` script stands in for vitest: the
// command hands the suite its own scope, lists production files no input saw, reaps what the suite leaves running and
// measures the merge it runs in-process.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import { UsageError } from "@orb/tooling/floor/cli/run-tool";
import { configureFixtureGitIdentity, runFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { z } from "zod";
import { runCoverage } from "../../../tooling/src/unwired/coverage.ts";
import { PRODUCTION_COVERAGE_SCOPE } from "../../../tooling/src/unwired/coverage-merge.ts";

// Enough functions that parsing and merging the suite's map raises this process's memory well past where it started.
const FUNCTIONS = 400_000;
const MIB = 1024 * 1024;
// Well under what merging that map adds, and well over what the process grows by before the merge starts.
const MERGE_GROWTH_BYTES = 150 * MIB;

// The stand-in suite: it records its argv, leaves a helper running in its own process group, and writes a vitest json
// map that lists only `a.ts`.
const fakeSuite = (functions: number): string => `import { spawn } from "node:child_process";
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
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "coverage-final.json"), JSON.stringify({ [path]: { path, fnMap, f, branchMap: {}, b: {} } }));
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

test("one run hands vitest the scope, lists unseen files, reaps the suite's helpers and measures the merge", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({
    "package.json": JSON.stringify({ name: "planted", private: true, scripts: { "test:coverage": "node fake-suite.mjs" } }),
    "fake-suite.mjs": fakeSuite(FUNCTIONS),
    "packages/demo/src/a.ts": "export const a = 1;\n",
    "packages/demo/src/index.ts": "export const b = 2;\n",
  });
  expect(runFixtureGit(root, ["init", "--quiet"]).status).toBe(0);
  expect(runFixtureGit(root, ["add", "--all"]).status).toBe(0);
  const lines: string[] = [];
  const startRss = process.memoryUsage.rss();
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
  // The merge is synchronous, so only a sample taken after it returns sees what it built; a sample from before the
  // merge sits near this process's memory at the start of the run.
  expect(report.mergePeakRssBytes).toBeGreaterThan(startRss + MERGE_GROWTH_BYTES);
});

const mergedSchema = z.object({ suites: z.array(z.object({ suite: z.string(), head: z.string().nullable(), tree: z.string() })) });

test("a recorded suite merges on the tree it ran on and is refused once the tree moved", { timeout: 60_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({
    "package.json": JSON.stringify({ name: "planted", private: true, scripts: { "test:coverage": "node fake-suite.mjs" } }),
    "fake-suite.mjs": fakeSuite(1),
    // What the run itself writes stays out of the tree it measures, as reports/ is ignored in the repository.
    ".gitignore": "reports/\nargv.json\nhelper.pid\n",
    "packages/demo/src/a.ts": "export const a = 1;\n",
  });
  expect(runFixtureGit(root, ["init", "--quiet"]).status).toBe(0);
  configureFixtureGitIdentity(root);
  expect(runFixtureGit(root, ["add", "--all"]).status).toBe(0);
  expect(runFixtureGit(root, ["commit", "--quiet", "--message=plant"]).status).toBe(0);
  const log = (): void => undefined;
  expect(await runCoverage([`--root=${root}`, "--suites=node", "--out=reports/first.json"], log)).toBe(0);
  // Merging the record alone runs no suite: the stand-in would rewrite argv.json if it ran.
  rmSync(join(root, "argv.json"));
  expect(await runCoverage([`--root=${root}`, "--merge=node", "--out=reports/merged.json"], log)).toBe(0);
  expect(existsSync(join(root, "argv.json"))).toBe(false);
  const merged = mergedSchema.parse(JSON.parse(readFileSync(join(root, "reports/merged.json"), "utf8")));
  const [record] = merged.suites;
  expect(merged.suites.map((run) => run.suite)).toEqual(["node"]);
  expect(record?.head).toBe(runFixtureGit(root, ["rev-parse", "HEAD"]).stdout.trim());

  // An uncommitted edit moves the working tree under the same HEAD, so only the tree id can see it.
  writeFileSync(join(root, "packages/demo/src/a.ts"), "export const a = 2;\n");
  const refused = runCoverage([`--root=${root}`, "--merge=node", "--out=reports/refused.json"], log);
  await expect(refused).rejects.toThrow(UsageError);
  await expect(refused).rejects.toThrow(
    `node was recorded on head ${record?.head ?? ""} tree ${record?.tree ?? ""}, but the current tree is head ${record?.head ?? ""} tree `,
  );
  expect(existsSync(join(root, "reports/refused.json"))).toBe(false);
});
