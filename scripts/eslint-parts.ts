// The whole-tree ESLint run as parts, each linted by its own ESLint process one after another, so one part's typed
// programs are released before the next part loads its own (D317). Pre-push runs this file through
// `pnpm lint:eslint:parts`; the CI `eslint` matrix in `.github/workflows/ci.yml` runs it once per part, by name, and
// `tests/tooling/eslint-parts.repo.int.test.ts` fails when the matrix, the commands that run it and this table disagree,
// or when the parts stop covering the whole tree exactly once. A part whose process peaks over the memory bar fails the
// run with its peak, because a heap raise is not an answer (D317): split the part instead. The peak each part prints is
// measured on that run; no recorded figure stands beside it to go stale.
// Each part runs ESLint directly, with the flags `pnpm lint:eslint` passes read from `package.json`, because pnpm
// replaces NODE_OPTIONS for a script it starts and so would drop the preload that reports the peak. The part inherits
// this runner's NODE_OPTIONS, which `pnpm lint:eslint:parts` sets from `nodeOptions` in `pnpm-workspace.yaml`: the same
// heap a `pnpm lint:eslint` run gets.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { z } from "zod";

/** One run's peak resident memory may not pass this: 16 GiB, the memory bar D317 states. */
export const ESLINT_PART_PEAK_BAR_MIB = 16_384;

const KIB_PER_MIB = 1024;
const MS_PER_SECOND = 1000;

/** The package script whose flags every part lints with. */
export const ESLINT_LINT_SCRIPT = "lint:eslint";
/** The package script that runs this file; pre-push and the contributor workflow lint the whole tree through it. */
export const ESLINT_PARTS_SCRIPT = "lint:eslint:parts";
const ESLINT_BIN = "node_modules/eslint/bin/eslint.js";

/** The query key on the preload's URL that names the directory a part's processes write their peak resident memory to. */
export const ESLINT_PEAK_DIR_PARAM = "out";

/** One part of the whole-tree run: the targets and ignore patterns it passes to ESLint. */
export interface EslintPart {
  readonly name: string;
  readonly targets: readonly string[];
  readonly ignorePatterns: readonly string[];
}

// The test files the DOM test world `tsconfig.tests-dom.json` names; the node world excludes them.
const DOM_TESTS = ["tests/**/*.dom.test.ts", "tests/**/*.dom.test-d.ts", "tests/**/*.spec.ts", "tests/**/*.tsx", "tests/e2e", "tests/support/browser"];
// The component-test page the DOM world also names.
const DOM_PAGE = "playwright";
const ISO_TESTS = "tests/support/iso";

// A package's own top-level files, its build and config scripts, take the node world's program `tsconfig.node.json`,
// which holds every node test; they lint in `root`, which builds that program for the root scripts anyway. An ignore
// pattern without a trailing slash also matches a directory, so this names the files by their extension's dot, and an
// unignore would reach the default-ignored `node_modules` too.
const PACKAGE_TOP_FILES = ["packages/*/*.*"];

// Each part loads only the typed programs its own files need, and memory follows the programs, not the file count.
// The client program is the largest, and one process holding every package program at once peaks near the bar, so
// packages split by package. Tests split by test world: each test file is linted with its own world's program alone.
export const ESLINT_PARTS = [
  { name: "client", targets: ["packages/client"], ignorePatterns: PACKAGE_TOP_FILES },
  { name: "server", targets: ["packages/server"], ignorePatterns: PACKAGE_TOP_FILES },
  { name: "ui", targets: ["packages/ui"], ignorePatterns: PACKAGE_TOP_FILES },
  { name: "packages", targets: ["packages"], ignorePatterns: ["packages/client/", "packages/server/", "packages/ui/", ...PACKAGE_TOP_FILES] },
  { name: "tests-node", targets: ["tests"], ignorePatterns: [...DOM_TESTS, ISO_TESTS] },
  { name: "tests-dom", targets: [...DOM_TESTS, DOM_PAGE], ignorePatterns: [] },
  { name: "tests-iso", targets: [ISO_TESTS], ignorePatterns: [] },
  { name: "tooling", targets: ["tooling"], ignorePatterns: [] },
  { name: "root", targets: ["."], ignorePatterns: ["packages/*/*/", "tests/", "tooling/", `${DOM_PAGE}/`] },
] as const satisfies readonly EslintPart[];

// The arguments a part passes to ESLint. No shell reads them, so a glob target reaches ESLint unexpanded.
function eslintPartArgs(part: EslintPart): string[] {
  return [...part.targets, ...part.ignorePatterns.flatMap((pattern) => ["--ignore-pattern", pattern])];
}

// A part either exits with a status, or a signal ends it: V8 aborts a process that exhausts its heap (SIGABRT, exit
// 134 through a shell) and the host's out-of-memory killer sends SIGKILL, so a signal is a memory verdict, not a lint one.
type PartOutcome = { readonly kind: "exited"; readonly status: number } | { readonly kind: "signalled"; readonly signal: NodeJS.Signals };

interface PartRun {
  readonly part: EslintPart;
  readonly outcome: PartOutcome;
  // The highest peak any of the part's processes last sampled; null only when every process ended before its first sample.
  readonly peakMiB: number | null;
  readonly wallSeconds: number;
}

// The flags after `eslint` in the `lint:eslint` script, so a part lints exactly as `pnpm lint:eslint` does.
function lintScriptFlags(root: string): string[] {
  const manifest = z.object({ scripts: z.record(z.string(), z.string()) }).parse(JSON.parse(readFileSync(join(root, "package.json"), "utf8")));
  const [command, ...flags] = (manifest.scripts[ESLINT_LINT_SCRIPT] ?? "").split(" ");
  if (command !== "eslint") {
    throw new Error(`the ${ESLINT_LINT_SCRIPT} script no longer starts with eslint; teach scripts/eslint-parts.ts its new form`);
  }
  return flags;
}

// Each process of the part keeps one file of its own, holding its latest peak in KiB.
function peakMiBOf(dir: string): number | null {
  const kib = readdirSync(dir).map((file) => Number(readFileSync(join(dir, file), "utf8")));
  return kib.length === 0 ? null : Math.round(Math.max(...kib) / KIB_PER_MIB);
}

function runPart(root: string, scratch: string, flags: readonly string[], part: EslintPart): PartRun {
  const peakDir = join(scratch, part.name);
  mkdirSync(peakDir);
  const preload = pathToFileURL(resolve(root, "scripts/eslint-peak.ts"));
  preload.searchParams.set(ESLINT_PEAK_DIR_PARAM, peakDir);
  const started = performance.now();
  const result = spawnSync(process.execPath, [`--import=${preload.href}`, resolve(root, ESLINT_BIN), ...flags, ...eslintPartArgs(part)], {
    cwd: root,
    stdio: "inherit",
  });
  const wallSeconds = Math.round((performance.now() - started) / MS_PER_SECOND);
  // spawnSync reports a status when the process exited and a signal when one ended it; a spawn error has neither and fails.
  const outcome: PartOutcome = result.signal === null ? { kind: "exited", status: result.status ?? 1 } : { kind: "signalled", signal: result.signal };
  return { part, outcome, peakMiB: peakMiBOf(peakDir), wallSeconds };
}

const describeOutcome = (outcome: PartOutcome): string => (outcome.kind === "exited" ? `exit ${outcome.status}` : `ended by ${outcome.signal}`);

const failedRun = (run: PartRun): boolean => run.outcome.kind === "signalled" || run.outcome.status !== 0;

// Part names on the command line run only those parts, to re-measure one; no names runs every part.
function selectedParts(names: readonly string[]): readonly EslintPart[] | null {
  const unknown = names.filter((name) => !ESLINT_PARTS.some((part) => part.name === name));
  if (unknown.length > 0) {
    console.error(`unknown eslint part: ${unknown.join(", ")}; pnpm ${ESLINT_PARTS_SCRIPT} takes ${ESLINT_PARTS.map((part) => part.name).join(", ")}`);
    return null;
  }
  return names.length === 0 ? ESLINT_PARTS : ESLINT_PARTS.filter((part) => names.includes(part.name));
}

function main(): void {
  const parts = selectedParts(process.argv.slice(2));
  if (parts === null) {
    process.exitCode = 1;
    return;
  }
  const root = resolve(import.meta.dirname, "..");
  const flags = lintScriptFlags(root);
  const scratch = mkdtempSync(join(tmpdir(), "orb-eslint-parts-"));
  try {
    const runs = parts.map((part) => {
      console.log(`eslint part ${part.name}: ${eslintPartArgs(part).join(" ")}`);
      const run = runPart(root, scratch, flags, part);
      console.log(`eslint part ${part.name}: ${describeOutcome(run.outcome)}, peak ${run.peakMiB ?? "unknown"} MiB, ${run.wallSeconds} s`);
      return run;
    });
    const failed = runs.filter(failedRun);
    const over = runs.filter((run) => run.peakMiB !== null && run.peakMiB > ESLINT_PART_PEAK_BAR_MIB);
    for (const run of over) {
      console.error(
        `eslint part ${run.part.name} peaked at ${run.peakMiB} MiB, over the ${ESLINT_PART_PEAK_BAR_MIB} MiB bar: split it in scripts/eslint-parts.ts`,
      );
    }
    for (const run of runs) {
      if (run.outcome.kind === "signalled") {
        console.error(
          `eslint part ${run.part.name} was ${describeOutcome(run.outcome)}, not by a lint finding: a heap abort (SIGABRT) or an out-of-memory kill (SIGKILL). ` +
            `Its last sampled peak was ${run.peakMiB ?? "unknown"} MiB against the ${ESLINT_PART_PEAK_BAR_MIB} MiB bar; split it in scripts/eslint-parts.ts`,
        );
      }
    }
    if (failed.length > 0) {
      console.error(`eslint failed in: ${failed.map((run) => run.part.name).join(", ")}`);
    }
    process.exitCode = failed.length > 0 || over.length > 0 ? 1 : 0;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  main();
}
