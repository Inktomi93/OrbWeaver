// One lane's Stryker run: `pnpm test:mutation` names the files, so this config mutates nothing by itself and
// a bare `stryker run` refuses instead of defaulting to every source file. D333 keeps this a tool, never a gate.
import type { PartialStrykerOptions } from "@stryker-mutator/api/core";
import { readConcurrencyProfile, readStageBudgets } from "../host/concurrency-profile.ts";
import { processEnvValue } from "../process/process-env.ts";

const MS_PER_MINUTE = 60_000;
const CHECKER_SHARE = 2;

/** The sandbox folder, relative to the checkout. Stryker also fences its own node_modules walk on this name. */
export const STRYKER_TEMP_DIR = ".stryker-tmp";
/** The machine-readable report `pnpm test:mutation` summarizes, relative to the checkout. */
export const MUTATION_REPORT_JSON = "reports/mutation/mutation.json";
const MUTATION_REPORT_HTML = "reports/mutation/mutation.html";
/** Stryker's CLI has no tsconfig flag, so `pnpm test:mutation` hands the checker its world through this variable. */
export const MUTATION_WORLD_ENV = "ORB_MUTATION_WORLD";

const IGNORE_PATTERNS = [
  `${STRYKER_TEMP_DIR}/**`,
  ".git/**",
  ".codegraph/**",
  "node_modules/**",
  ".cache/**",
  ".models/**",
  "coverage/**",
  "dist/**",
  "reports/**",
  "docs/**",
  "playwright-report/**",
  "test-results/**",
  ".claude/**",
  ".agents/**",
  ".codex/**",
  ".qwen/**",
  "reference/**",
  "scratch/**",
  "data/**",
  "*.db*",
  // A local database stays out of the sandbox; this one is the scrubbed test input `.gitignore` also keeps.
  "!tests/support/node/corpus-data/db/orbweaver.db",
  "playwright/**",
] as const;

/** Build the options fresh for each import; Stryker mutates what it is handed. */
export function createStrykerConfig(): PartialStrykerOptions {
  const world = processEnvValue(MUTATION_WORLD_ENV);
  return {
    packageManager: "pnpm",
    testRunner: "vitest",
    // `forks`, not the runner's `threads` default: the server graph loads native bindings, and the base config's pool.
    // The other runners idle through the dry run, so it takes the suite's own worker cap; a mutant run stays on one worker.
    vitest: { configFile: "vitest.stryker.config.ts", pool: "forks", dryRunMaxWorkers: readConcurrencyProfile().vitestMaxWorkers },
    plugins: ["@stryker-mutator/vitest-runner", "@stryker-mutator/typescript-checker", "./tooling/src/mutation-arid/index.ts"],
    ignorers: ["arid"],
    checkers: ["typescript"],
    mutate: [],
    tempDirName: STRYKER_TEMP_DIR,
    // The sandbox holds a copy of the dependency store, so a failed run must not leave it behind.
    cleanTempDir: "always",
    ...(world === undefined ? {} : { tsconfigFile: world }),
    reporters: ["html", "json", "clear-text", "progress"],
    htmlReporter: { fileName: MUTATION_REPORT_HTML },
    jsonReporter: { fileName: MUTATION_REPORT_JSON },
    ignorePatterns: [...IGNORE_PATTERNS],
    // Initial-test supervision follows the native test-process ceiling, not the whole mutant run.
    dryRunTimeoutMinutes: readStageBudgets().vitestHardCeilingMs / MS_PER_MINUTE,
    // Module-level tables and schemas hold real logic here, and a run names few files, so the reloads are affordable.
    ignoreStatic: false,
    // Stryker gives half of this to checkers, each holding a whole world's program: two on the client world reach the 16 GB bar.
    concurrency: Math.ceil(readConcurrencyProfile().vitestMaxWorkers / CHECKER_SHARE),
    timeoutMS: 10_000,
    thresholds: { high: 80, low: 60, break: null },
  };
}
