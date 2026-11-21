// `pnpm unwired coverage`: runs the Node, CT and e2e suites one after another with V8 coverage on, merges what they
// executed, and writes the production functions and branch arms no run executed. Input to judgement, never a gate:
// the suites' own exit codes are recorded and never turn into this command's verdict.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { UsageError } from "../floor/cli/run-tool.ts";
import { execNicedSync, spawnNicedTranscript } from "../floor/process/proc.ts";
import { inheritedProcessEnv } from "../floor/process/process-env.ts";
import { COVERAGE_DIR_ENV } from "../floor/testing/coverage-collection.ts";
import { convertBrowserRun, convertNodeRun } from "./coverage-convert.ts";
import type { CoverageInput, CoverageSuite } from "./coverage-merge.ts";
import { COVERAGE_SUITES, istanbulMapSchema, mergeCoverage } from "./coverage-merge.ts";

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
  "The Node suite's coverage scope excludes index.ts files, so one appears only when a browser or server run reached it.",
  "A browser or server hit lands on the Node suite's entry with the same start position, else a function lands by its name and line, or as the one anonymous function on its line; a hit that finds none is counted per suite, not added.",
  "The React Compiler rewrites a browser component's branches, so most browser branch hits land on compiler-made branches and are dropped: a client .tsx branch arm reported unexecuted may have run in CT or e2e. Read the per-suite matched arm count first.",
  "Code the e2e harness alone runs is dropped with its whole process; a CT's in-worker server responder is never recorded.",
];

interface Args {
  readonly root: string;
  readonly out: string;
  readonly suites: readonly CoverageSuite[];
  readonly paths: Readonly<Record<CoverageSuite, readonly string[]>>;
}

const FLAG = /^--(root|out|suites|node|ct|e2e)=(.+)$/u;

function parseCoverageArgs(argv: readonly string[]): Args {
  let root = process.cwd();
  let out = DEFAULT_OUT;
  let suites: readonly CoverageSuite[] = COVERAGE_SUITES;
  const paths: Record<CoverageSuite, string[]> = { node: [], ct: [], e2e: [] };
  for (const arg of argv) {
    const [, flag, value = ""] = FLAG.exec(arg) ?? [];
    if (flag === "root") {
      root = resolve(value);
    } else if (flag === "out") {
      out = value;
    } else if (flag === "suites") {
      suites = value.split(",").map((name) => {
        const suite = COVERAGE_SUITES.find((candidate) => candidate === name);
        if (suite === undefined) {
          throw new UsageError(`--suites=${value}: expected a comma list of ${COVERAGE_SUITES.join(", ")}`);
        }
        return suite;
      });
    } else if (flag === "node" || flag === "ct" || flag === "e2e") {
      paths[flag].push(value);
    } else {
      throw new UsageError(
        `${arg}: unknown argument\nusage: pnpm unwired coverage [--suites=node,ct,e2e] [--node=<file>]... [--ct=<file>]... [--e2e=<arg>]... [--out=<file>]`,
      );
    }
  }
  return { root, out, suites, paths };
}

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

/** Samples this process and all its descendants until stopped; the peak is one run's whole footprint. */
function sampleTreePeak(): { readonly stop: () => number | null } {
  let peak = treeRssBytes(process.pid);
  const timer = setInterval(() => {
    const now = treeRssBytes(process.pid);
    peak = now === null || peak === null ? null : Math.max(peak, now);
  }, SAMPLE_MS);
  return {
    stop: (): number | null => {
      clearInterval(timer);
      return peak;
    },
  };
}

interface SuiteRun {
  readonly suite: CoverageSuite;
  readonly command: string;
  readonly exitCode: number | null;
  readonly seconds: number;
  readonly peakRssBytes: number | null;
}

function suiteCommand(suite: CoverageSuite, paths: readonly string[], runDir: string): readonly string[] {
  switch (suite) {
    case "node":
      return ["test:coverage", ...paths, "--coverage.reporter=json", `--coverage.reportsDirectory=${join(runDir, NODE_ISTANBUL)}`];
    case "ct":
      return ["test:ct", ...paths];
    case "e2e":
      return ["e2e", ...paths];
  }
}

interface SuitePlan {
  readonly root: string;
  readonly runDir: string;
  readonly log: (line: string) => void;
}

async function runSuite(plan: SuitePlan, suite: CoverageSuite, paths: readonly string[]): Promise<SuiteRun> {
  const { root, runDir, log } = plan;
  const args = suiteCommand(suite, paths, runDir);
  const suiteDir = join(runDir, suite);
  mkdirSync(suiteDir, { recursive: true });
  log(`coverage: ${suite}: pnpm ${args.join(" ")}`);
  const started = performance.now();
  const sampler = sampleTreePeak();
  const result = await spawnNicedTranscript("pnpm", args, {
    cwd: root,
    env: inheritedProcessEnv(Object.fromEntries([[COVERAGE_DIR_ENV, suiteDir]])),
    timeoutMs: SUITE_TIMEOUT_MS,
    onChunk: (chunk) => {
      process.stderr.write(chunk);
    },
  });
  writeFileSync(join(runDir, `${suite}.log`), result.transcript);
  return {
    suite,
    command: `pnpm ${args.join(" ")}`,
    exitCode: result.code,
    seconds: Math.round((performance.now() - started) / MS_PER_SECOND),
    peakRssBytes: sampler.stop(),
  };
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
): Promise<{ readonly input: CoverageInput; readonly unmapped: readonly string[] }> {
  if (suite === "node") {
    const raw: unknown = JSON.parse(readFileSync(join(runDir, NODE_ISTANBUL, "coverage-final.json"), "utf8"));
    return { input: { suite, map: istanbulMapSchema.parse(raw) }, unmapped: [] };
  }
  const suiteDir = join(runDir, suite);
  const browser = existsSync(join(suiteDir, "browser")) ? await convertBrowserRun(suiteDir) : { map: {}, unmapped: [] };
  const server = existsSync(join(suiteDir, "node")) ? await convertNodeRun(root, suiteDir) : {};
  const map = { ...browser.map, ...server };
  // Kept beside the run so a reader can check what a browser or server file's hits were before projection.
  writeFileSync(join(runDir, `${suite}-istanbul.json`), JSON.stringify(map));
  return { input: { suite, map }, unmapped: browser.unmapped };
}

/** Runs the chosen suites in order, merges their coverage and writes the report. */
export async function runCoverage(argv: readonly string[], log: (line: string) => void): Promise<number> {
  const args = parseCoverageArgs(argv);
  const runDir = join(args.root, RUN_DIR);
  rmSync(runDir, { recursive: true, force: true });
  mkdirSync(runDir, { recursive: true });
  const runs: SuiteRun[] = [];
  for (const suite of args.suites) {
    runs.push(await runSuite({ root: args.root, runDir, log }, suite, args.paths[suite]));
  }
  const sampler = sampleTreePeak();
  const inputs: CoverageInput[] = [];
  const unmapped: string[] = [];
  for (const suite of args.suites) {
    const { input, unmapped: missed } = await suiteInput(args.root, runDir, suite);
    inputs.push(input);
    unmapped.push(...missed);
  }
  const merged = mergeCoverage(args.root, inputs);
  const mergePeakRssBytes = sampler.stop();
  const uncollected = Object.fromEntries(
    args.suites.flatMap((suite) => (suite === "node" ? [] : [[suite, uncollectedSpecs(args.root, suite, args.paths[suite])] as const])),
  );
  const out = resolve(args.root, args.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify({ suites: runs, mergePeakRssBytes, totals: merged.totals, projections: merged.projections, uncollectedSpecs: uncollected, unmappedScripts: unmapped, limits: COVERAGE_LIMITS, files: merged.unexecuted }, null, 1)}\n`,
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
          ` ${suite}:matched functions=${String(p.matchedFunctions)}/${String(p.matchedFunctions + p.unmatchedFunctions)} arms=${String(p.matchedArms)}/${String(p.matchedArms + p.unmatchedArms)}`,
      )
      .join("")} mergePeakRss=${mergePeakRssBytes === null ? "unmeasured" : `${String(Math.round(mergePeakRssBytes / KIB / KIB))}MiB`} written to ${out}`,
  );
  return EXIT.clean;
}
