// The whole-tree ESLint run as parts, each linted by its own ESLint process one after another, so one part's typed
// programs are released before the next part loads its own (D317). Pre-push runs this file through
// `pnpm lint:eslint:parts`; the CI `eslint` matrix in `.github/workflows/ci.yml` runs the same parts as separate jobs, and
// `tests/tooling/eslint-parts.repo.int.test.ts` fails when the matrix and this table disagree or when the parts stop
// covering the whole tree exactly once. A part whose process peaks over the memory bar fails the run with its peak,
// because a heap raise is not an answer (D317): split the part instead.
// Each part runs ESLint directly, with the flags `pnpm lint:eslint` passes read from `package.json`, because pnpm
// replaces NODE_OPTIONS for a script it starts and so would drop the preload that reports the peak. The part inherits
// this runner's NODE_OPTIONS, which `pnpm lint:eslint:parts` sets from `nodeOptions` in `pnpm-workspace.yaml`: the same
// heap a `pnpm lint:eslint` run gets.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { z } from "zod";

/** One run's peak memory may not pass this (D317). */
export const ESLINT_PART_PEAK_BAR_MIB = 16_384;

const KIB_PER_MIB = 1024;
const MS_PER_SECOND = 1000;

const LINT_SCRIPT = "lint:eslint";
const ESLINT_BIN = "node_modules/eslint/bin/eslint.js";

/** The query key on the preload's URL that names the file a part's processes write their peak resident memory to. */
export const ESLINT_PEAK_FILE_PARAM = "out";

/** One part of the whole-tree run: the targets and ignore patterns it passes to ESLint. */
export interface EslintPart {
  readonly name: string;
  readonly targets: readonly string[];
  readonly ignorePatterns: readonly string[];
  /** A recorded measurement, not a check: the part's peak resident memory and wall time on main, from
   *  `pnpm lint:eslint:parts [part...]`, which prints both for every part it runs. Update it from that output. */
  readonly measured: { readonly peakMiB: number; readonly wallSeconds: number };
}

// Each package part loads only the typed programs its own files need. The client program is the largest, and one
// process holding every package program at once peaks near the bar, so packages split by package.
export const ESLINT_PARTS = [
  { name: "client", targets: ["packages/client"], ignorePatterns: [], measured: { peakMiB: 8564, wallSeconds: 114 } },
  { name: "server", targets: ["packages/server"], ignorePatterns: [], measured: { peakMiB: 3791, wallSeconds: 117 } },
  { name: "ui", targets: ["packages/ui"], ignorePatterns: [], measured: { peakMiB: 5554, wallSeconds: 107 } },
  {
    name: "packages",
    targets: ["packages"],
    ignorePatterns: ["packages/client/", "packages/server/", "packages/ui/"],
    measured: { peakMiB: 4944, wallSeconds: 58 },
  },
  { name: "tests", targets: ["tests"], ignorePatterns: [], measured: { peakMiB: 10_188, wallSeconds: 194 } },
  { name: "tooling", targets: ["tooling"], ignorePatterns: [], measured: { peakMiB: 4936, wallSeconds: 39 } },
  {
    name: "root",
    targets: ["."],
    ignorePatterns: ["packages/", "tests/", "tooling/"],
    measured: { peakMiB: 4338, wallSeconds: 26 },
  },
] as const satisfies readonly EslintPart[];

/** The arguments a part passes after `pnpm lint:eslint`, as the CI matrix spells them. */
export function eslintPartArgs(part: EslintPart): string[] {
  return [...part.targets, ...part.ignorePatterns.flatMap((pattern) => ["--ignore-pattern", pattern])];
}

interface PartRun {
  readonly part: EslintPart;
  readonly status: number;
  // Null when the process died before its exit handler ran (a heap abort, a kill); its status fails the run.
  readonly peakMiB: number | null;
  readonly wallSeconds: number;
}

// The flags after `eslint` in the `lint:eslint` script, so a part lints exactly as `pnpm lint:eslint` does.
function lintScriptFlags(root: string): string[] {
  const manifest = z.object({ scripts: z.record(z.string(), z.string()) }).parse(JSON.parse(readFileSync(join(root, "package.json"), "utf8")));
  const [command, ...flags] = (manifest.scripts[LINT_SCRIPT] ?? "").split(" ");
  if (command !== "eslint") {
    throw new Error(`the ${LINT_SCRIPT} script no longer starts with eslint; teach scripts/eslint-parts.ts its new form`);
  }
  return flags;
}

function peakMiBOf(file: string): number | null {
  if (!existsSync(file)) {
    return null;
  }
  const kib = readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map(Number);
  return Math.round(Math.max(...kib) / KIB_PER_MIB);
}

function runPart(root: string, scratch: string, flags: readonly string[], part: EslintPart): PartRun {
  const peakFile = join(scratch, `${part.name}.peak`);
  const preload = pathToFileURL(resolve(root, "scripts/eslint-peak.ts"));
  preload.searchParams.set(ESLINT_PEAK_FILE_PARAM, peakFile);
  const started = performance.now();
  const result = spawnSync(process.execPath, [`--import=${preload.href}`, resolve(root, ESLINT_BIN), ...flags, ...eslintPartArgs(part)], {
    cwd: root,
    stdio: "inherit",
  });
  const wallSeconds = Math.round((performance.now() - started) / MS_PER_SECOND);
  // A signal (an OOM kill, a crash) has no status; it must still fail the run.
  return { part, status: result.status ?? 1, peakMiB: peakMiBOf(peakFile), wallSeconds };
}

// Part names on the command line run only those parts, to re-measure one; no names runs every part.
function selectedParts(names: readonly string[]): readonly EslintPart[] | null {
  const unknown = names.filter((name) => !ESLINT_PARTS.some((part) => part.name === name));
  if (unknown.length > 0) {
    console.error(`unknown eslint part: ${unknown.join(", ")}; the parts are ${ESLINT_PARTS.map((part) => part.name).join(", ")}`);
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
      console.log(`eslint part ${part.name}: exit ${run.status}, peak ${run.peakMiB ?? "unknown"} MiB, ${run.wallSeconds} s`);
      return run;
    });
    const failed = runs.filter((run) => run.status !== 0);
    const over = runs.filter((run) => run.peakMiB !== null && run.peakMiB > ESLINT_PART_PEAK_BAR_MIB);
    for (const run of over) {
      console.error(
        `eslint part ${run.part.name} peaked at ${run.peakMiB} MiB, over the ${ESLINT_PART_PEAK_BAR_MIB} MiB bar: split it in scripts/eslint-parts.ts`,
      );
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
