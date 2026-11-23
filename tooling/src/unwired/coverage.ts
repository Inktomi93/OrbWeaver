// `pnpm unwired coverage`: runs the Node, CT and e2e suites one after another with V8 coverage on, merges what they
// executed, and writes the production functions and branch arms no run executed. Input to judgement, never a gate:
// the suites' own exit codes are recorded and never turn into this command's verdict.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { z } from "zod";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { UsageError } from "../floor/cli/run-tool.ts";
import { execGit, runGit } from "../floor/git/git.ts";
import { execNicedSync, spawnNicedTranscript } from "../floor/process/proc.ts";
import { inheritedProcessEnv } from "../floor/process/process-env.ts";
import { joinRunMarkerSweep, mintRunMarker, runMarkerEnv, runMarkerTranscriptTeardown } from "../floor/process/run-marker.ts";
import { COVERAGE_DIR_ENV } from "../floor/testing/coverage-collection.ts";
import { convertBrowserRun, convertNodeRun } from "./coverage-convert.ts";
import type { CoverageInput, CoverageSuite } from "./coverage-merge.ts";
import { COVERAGE_SUITES, diskHead, isProductionSource, istanbulMapSchema, mergeCoverage, PRODUCTION_COVERAGE_SCOPE } from "./coverage-merge.ts";

const DEFAULT_OUT = "reports/unwired/coverage.json";
const RUN_DIR = "reports/unwired/coverage-run";
const NODE_ISTANBUL = "node-istanbul";
const MS_PER_SECOND = 1000;
const SECONDS_PER_HOUR = 3600;
const SAMPLE_MS = MS_PER_SECOND;
// A whole e2e or CT suite runs for hours on modest hardware; this ceiling only ends a hung run.
const SUITE_TIMEOUT_HOURS = 8;
const SUITE_TIMEOUT_MS = SUITE_TIMEOUT_HOURS * SECONDS_PER_HOUR * MS_PER_SECOND;
const KIB = 1024;

/** What this command cannot see, written into its report. */
const COVERAGE_LIMITS: readonly string[] = [
  "A CT or e2e spec whose `test` comes straight from @playwright/test records no browser coverage; the report lists every such spec that ran.",
  "Only Chromium pages are recorded, and a page a test closes itself is not; workers and service workers are not recorded.",
  "A production file no input listed is in unseenFiles, never counted as executed; a run with the Node suite lists every one.",
  "A browser or server hit lands on the Node suite's entry with the same start position, else on the same-named function of its line, else a bundler-renamed `name$<n>` on the `name` that declares at its own start, else on the entry with the same place among its line's anonymous functions or same-type branches when both maps hold the same number there; a hit that finds none is counted per suite, not added.",
  "The client build skips the React Compiler under this command, so browser branches are the source's own and land on the Node suite's: behaviour only the compiler's memoisation produces does not run here, and a CT or e2e pass or failure under this command is no test verdict; the compiled suites stay the verdict.",
  "Each suite's functionMatchRate and armMatchRate is the share of its hits that found a universe entry; read it before you judge an unexecuted entry in a file that suite ran.",
  "Code the e2e harness alone runs is dropped with its whole process; a CT's in-worker server responder is never recorded.",
  "A page whose coverage cannot be read at a test's end is a lostPages line; no test drives that path, since only a real browser page reaches it.",
  "Specs on the surface base run only under scripts/surface-walk.ts, which the e2e suite's config ignores, so they collect nothing here.",
];

interface Args {
  readonly root: string;
  readonly out: string;
  readonly suites: readonly CoverageSuite[];
  /** Suites whose recorded run in the run folder is merged without running them again. */
  readonly merge: readonly CoverageSuite[];
  readonly paths: Readonly<Record<CoverageSuite, readonly string[]>>;
}

const FLAG = /^--(root|out|suites|merge|node|ct|e2e)=(.+)$/u;

/** The usage line of the `coverage` verb. */
export const COVERAGE_USAGE =
  "pnpm unwired coverage [--suites=node,ct,e2e] [--merge=node,ct,e2e] [--node=<file>]... [--ct=<file>]... [--e2e=<arg>]... [--out=<file>]";

function suiteList(flag: string, value: string): readonly CoverageSuite[] {
  return value.split(",").map((name) => {
    const suite = COVERAGE_SUITES.find((candidate) => candidate === name);
    if (suite === undefined) {
      throw new UsageError(`--${flag}=${value}: expected a comma list of ${COVERAGE_SUITES.join(", ")}`);
    }
    return suite;
  });
}

function parseCoverageArgs(argv: readonly string[]): Args {
  let root = process.cwd();
  let out = DEFAULT_OUT;
  const lists: { suites?: readonly CoverageSuite[]; merge?: readonly CoverageSuite[] } = {};
  const paths: Record<CoverageSuite, string[]> = { node: [], ct: [], e2e: [] };
  for (const arg of argv) {
    const [, flag, value = ""] = FLAG.exec(arg) ?? [];
    if (flag === "root") {
      root = resolve(value);
    } else if (flag === "out") {
      out = value;
    } else if (flag === "suites" || flag === "merge") {
      lists[flag] = suiteList(flag, value);
    } else if (flag === "node" || flag === "ct" || flag === "e2e") {
      paths[flag].push(value);
    } else {
      throw new UsageError(`${arg}: unknown argument\nusage: ${COVERAGE_USAGE}`);
    }
  }
  return { root, out, ...chosenSuites(lists), paths };
}

// A merge of recorded suites runs nothing unless suites are named too; a suite that runs is never also read back.
function chosenSuites(lists: { readonly suites?: readonly CoverageSuite[]; readonly merge?: readonly CoverageSuite[] }): Pick<Args, "suites" | "merge"> {
  const merge = lists.merge ?? [];
  const suites = lists.suites ?? (merge.length === 0 ? COVERAGE_SUITES : []);
  return { suites, merge: merge.filter((suite) => !suites.includes(suite)) };
}

// The tree a run measured: its HEAD and the id of its whole working tree, uncommitted and untracked files included.
interface TreeState {
  readonly head: string | null;
  readonly tree: string;
}

// The tree id is `git write-tree` over a scratch copy of the index after `git add --all`, so two runs share it only
// when every tracked and untracked file matched; the copy keeps the index's stat cache, so only changed files are
// hashed. A dead-code list merged from two trees would name code that one of them never had.
function treeState(root: string): TreeState {
  const head = runGit(root, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  const scratch = mkdtempSync(join(tmpdir(), "orb-coverage-tree-"));
  try {
    const index = join(scratch, "index");
    const live = resolve(root, execGit(root, ["rev-parse", "--git-path", "index"]).trim());
    if (existsSync(live)) {
      copyFileSync(live, index);
    }
    const scoped = { extra: { ["GIT_INDEX_FILE"]: index } };
    execGit(root, ["add", "--all"], scoped);
    return { head: head.status === 0 ? head.stdout.trim() : null, tree: execGit(root, ["write-tree"], scoped).trim() };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const sameTree = (a: TreeState, b: TreeState): boolean => a.head === b.head && a.tree === b.tree;
const describeTree = (state: TreeState): string => `head ${state.head ?? "none"} tree ${state.tree}`;

// Linux reports per-process memory under /proc; elsewhere the peak is not measured.
function treeRssBytes(rootPid: number): number | null {
  if (!existsSync("/proc/self/stat")) {
    return null;
  }
  const children = new Map<number, number[]>();
  for (const name of readdirSync("/proc")) {
    if (/^\d+$/u.test(name)) {
      try {
        // The command name in field 2 may hold spaces; the parent pid is the second field after its closing paren.
        const stat = readFileSync(`/proc/${name}/stat`, "utf8");
        const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
        children.set(ppid, [...(children.get(ppid) ?? []), Number(name)]);
      } catch {
        // The process exited between the listing and the read; it holds no memory now.
      }
    }
  }
  let total = 0;
  const pending = [rootPid];
  for (let pid = pending.pop(); pid !== undefined; pid = pending.pop()) {
    pending.push(...(children.get(pid) ?? []));
    try {
      const rss = /^VmRSS:\s+(\d+) kB$/mu.exec(readFileSync(`/proc/${String(pid)}/status`, "utf8"))?.[1];
      total += Number(rss ?? 0) * KIB;
    } catch {
      // As above: a process gone before its status read adds nothing.
    }
  }
  return total;
}

/**
 * Samples this process and all its descendants until stopped; the peak is one run's whole footprint.
 *
 * @remarks `stop` samples once more before it returns: a synchronous step such as the merge blocks the interval, but
 * still holds what it built when it returns.
 */
function sampleTreePeak(): { readonly stop: () => number | null } {
  let peak = treeRssBytes(process.pid);
  const sample = (): void => {
    const now = treeRssBytes(process.pid);
    peak = now === null || peak === null ? null : Math.max(peak, now);
  };
  const timer = setInterval(sample, SAMPLE_MS);
  return {
    stop: (): number | null => {
      clearInterval(timer);
      sample();
      return peak;
    },
  };
}

// A suite's run record, written beside its output once the suite ends, so a later `--merge` reads it back.
const suiteRunSchema = z.object({
  suite: z.enum(COVERAGE_SUITES),
  command: z.string(),
  exitCode: z.number().nullable(),
  seconds: z.number(),
  peakRssBytes: z.number().nullable(),
  paths: z.array(z.string()),
  head: z.string().nullable(),
  tree: z.string(),
});
type SuiteRun = z.infer<typeof suiteRunSchema>;

const recordPath = (runDir: string, suite: CoverageSuite): string => join(runDir, `${suite}.run.json`);

// Everything one suite's run leaves in the run folder, cleared before the suite runs again.
const suiteOutputs = (runDir: string, suite: CoverageSuite): readonly string[] => [
  join(runDir, suite),
  join(runDir, `${suite}.log`),
  join(runDir, `${suite}-istanbul.json`),
  recordPath(runDir, suite),
  ...(suite === "node" ? [join(runDir, NODE_ISTANBUL)] : []),
];

/**
 * The recorded runs of the suites `--merge` names, refused unless each was made on the tree this command runs on.
 *
 * @throws UsageError when a suite has no record, or a record's tree differs from the current one.
 */
function recordedRuns(runDir: string, suites: readonly CoverageSuite[], current: TreeState): readonly SuiteRun[] {
  const runs = suites.map((suite) => {
    const path = recordPath(runDir, suite);
    if (!existsSync(path)) {
      throw new UsageError(`--merge=${suite}: no finished ${suite} run is recorded in ${runDir}; run it with --suites=${suite} first`);
    }
    return suiteRunSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  });
  const mismatched = runs.filter((run) => !sameTree(run, current));
  if (mismatched.length > 0) {
    throw new UsageError(
      `--merge: ${mismatched.map((run) => `${run.suite} was recorded on ${describeTree(run)}`).join("; ")}, but the current tree is ${describeTree(current)}; rerun ${mismatched.map((run) => run.suite).join(",")} on this tree`,
    );
  }
  return runs;
}

function suiteCommand(suite: CoverageSuite, paths: readonly string[], runDir: string): readonly string[] {
  switch (suite) {
    case "node":
      // The command owns the scope: a CLI include or exclude replaces vitest.config.ts's lists, whose index.ts exclude
      // would drop files with code from the universe.
      return [
        "test:coverage",
        ...paths,
        "--coverage.reporter=json",
        `--coverage.reportsDirectory=${join(runDir, NODE_ISTANBUL)}`,
        `--coverage.include=${PRODUCTION_COVERAGE_SCOPE.include}`,
        ...PRODUCTION_COVERAGE_SCOPE.exclude.map((glob) => `--coverage.exclude=${glob}`),
      ];
    case "ct":
      return ["test:ct", ...paths];
    case "e2e":
      return ["e2e", ...paths];
  }
}

interface SuitePlan {
  readonly root: string;
  readonly runDir: string;
  readonly tree: TreeState;
  readonly log: (line: string) => void;
}

async function runSuite(plan: SuitePlan, suite: CoverageSuite, paths: readonly string[]): Promise<SuiteRun> {
  const { root, runDir, log } = plan;
  const args = suiteCommand(suite, paths, runDir);
  const suiteDir = join(runDir, suite);
  for (const output of suiteOutputs(runDir, suite)) {
    rmSync(output, { recursive: true, force: true });
  }
  mkdirSync(suiteDir, { recursive: true });
  log(`coverage: ${suite}: pnpm ${args.join(" ")}`);
  const started = performance.now();
  const sampler = sampleTreePeak();
  // Playwright's browsers and vite's children leave the process group, so a timeout or Ctrl-C sweeps by run marker.
  const marker = mintRunMarker();
  const result = await spawnNicedTranscript("pnpm", args, {
    cwd: root,
    env: inheritedProcessEnv({ ...runMarkerEnv(marker), ...Object.fromEntries([[COVERAGE_DIR_ENV, suiteDir]]) }),
    timeoutMs: SUITE_TIMEOUT_MS,
    teardown: runMarkerTranscriptTeardown(marker),
    onChunk: (chunk) => {
      process.stderr.write(chunk);
    },
  }).finally(() => joinRunMarkerSweep(marker));
  writeFileSync(join(runDir, `${suite}.log`), result.transcript);
  const run: SuiteRun = {
    suite,
    command: `pnpm ${args.join(" ")}`,
    exitCode: result.code,
    seconds: Math.round((performance.now() - started) / MS_PER_SECOND),
    peakRssBytes: sampler.stop(),
    paths: [...paths],
    ...plan.tree,
  };
  writeFileSync(recordPath(runDir, suite), `${JSON.stringify(run, null, 1)}\n`);
  return run;
}

// The specs a browser suite can run: the ones named, else every tracked spec of its kind.
function candidateSpecs(root: string, suite: "ct" | "e2e", paths: readonly string[]): readonly string[] {
  const named = paths.filter((path) => existsSync(join(root, path)));
  if (named.length > 0) {
    return named;
  }
  const pattern = suite === "ct" ? ["tests/**/*.ct.tsx", ":!tests/tooling/**"] : ["tests/e2e/**/*.spec.ts"];
  return execNicedSync("git", ["ls-files", "--", ...pattern], { cwd: root })
    .split("\n")
    .filter(Boolean);
}

// A spec importing `test` from the runner itself has none of the coverage fixtures.
const BARE_RUNNER_TEST = /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*"@playwright\/test"/u;

function uncollectedSpecs(root: string, suite: "ct" | "e2e", paths: readonly string[]): readonly string[] {
  return candidateSpecs(root, suite, paths).filter((spec) => BARE_RUNNER_TEST.test(readFileSync(join(root, spec), "utf8")));
}

async function suiteInput(
  root: string,
  runDir: string,
  suite: CoverageSuite,
): Promise<{ readonly input: CoverageInput; readonly unmapped: readonly string[]; readonly lost: readonly string[] }> {
  if (suite === "node") {
    const raw: unknown = JSON.parse(readFileSync(join(runDir, NODE_ISTANBUL, "coverage-final.json"), "utf8"));
    return { input: { suite, map: istanbulMapSchema.parse(raw) }, unmapped: [], lost: [] };
  }
  const suiteDir = join(runDir, suite);
  const browser = existsSync(join(suiteDir, "browser")) ? await convertBrowserRun(suiteDir) : { map: {}, unmapped: [], lost: [] };
  const server = existsSync(join(suiteDir, "node")) ? await convertNodeRun(root, suiteDir) : {};
  const map = { ...browser.map, ...server };
  // Kept beside the run so a reader can check what a browser or server file's hits were before projection.
  writeFileSync(join(runDir, `${suite}-istanbul.json`), JSON.stringify(map));
  return { input: { suite, map }, unmapped: browser.unmapped, lost: browser.lost };
}

/** Runs the chosen suites in order, merges their coverage and writes the report. */
export async function runCoverage(argv: readonly string[], log: (line: string) => void): Promise<number> {
  const args = parseCoverageArgs(argv);
  const runDir = join(args.root, RUN_DIR);
  mkdirSync(runDir, { recursive: true });
  const tree = treeState(args.root);
  // Refused before any suite runs, so a mismatch costs no hours of suite time.
  const recorded = recordedRuns(runDir, args.merge, tree);
  const fresh: SuiteRun[] = [];
  for (const suite of args.suites) {
    fresh.push(await runSuite({ root: args.root, runDir, tree, log }, suite, args.paths[suite]));
  }
  // The Node suite's map is the universe, so the inputs go in the order the suites are declared.
  const runs = COVERAGE_SUITES.flatMap((suite) => [...recorded, ...fresh].filter((run) => run.suite === suite));
  const sampler = sampleTreePeak();
  const inputs: CoverageInput[] = [];
  const unmapped: string[] = [];
  const lostPages: string[] = [];
  for (const { suite } of runs) {
    const converted = await suiteInput(args.root, runDir, suite);
    inputs.push(converted.input);
    unmapped.push(...converted.unmapped);
    lostPages.push(...converted.lost);
  }
  const merged = mergeCoverage(args.root, inputs);
  const mergePeakRssBytes = sampler.stop();
  const readHead = diskHead(args.root);
  const unseenFiles = execNicedSync("git", ["ls-files", "--", "packages/*/src/**"], { cwd: args.root })
    .split("\n")
    .filter((rel) => rel !== "" && isProductionSource(rel, readHead) && !merged.seen.has(rel));
  const uncollected = Object.fromEntries(
    runs.flatMap(({ suite, paths }) => (suite === "node" ? [] : [[suite, uncollectedSpecs(args.root, suite, paths)] as const])),
  );
  const out = resolve(args.root, args.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify({ suites: runs, mergePeakRssBytes, totals: merged.totals, projections: merged.projections, unseenFiles, uncollectedSpecs: uncollected, lostPages, unmappedScripts: unmapped, limits: COVERAGE_LIMITS, files: merged.unexecuted }, null, 1)}\n`,
  );
  for (const run of runs) {
    log(
      `coverage: ${run.suite} exit=${String(run.exitCode)} seconds=${String(run.seconds)} peakRss=${run.peakRssBytes === null ? "unmeasured" : `${String(Math.round(run.peakRssBytes / KIB / KIB))}MiB`}`,
    );
  }
  const { totals } = merged;
  log(
    `coverage: files=${String(totals.files)} functions=${String(totals.functions)} unexecuted=${String(totals.functionsUnexecuted)} branchArms=${String(totals.branchArms)} unexecuted=${String(totals.branchArmsUnexecuted)} ${Object.entries(
      merged.projections,
    )
      .map(
        ([suite, p]) =>
          ` ${suite}:matched functions=${String(p.matchedFunctions)}/${String(p.matchedFunctions + p.unmatchedFunctions)} arms=${String(p.matchedArms)}/${String(p.matchedArms + p.unmatchedArms)} armRate=${String(p.armMatchRate)}`,
      )
      .join("")} mergePeakRss=${mergePeakRssBytes === null ? "unmeasured" : `${String(Math.round(mergePeakRssBytes / KIB / KIB))}MiB`} written to ${out}`,
  );
  return EXIT.clean;
}
