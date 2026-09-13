// THE FRESHNESS GUARANTEE of `scripts/ts7.cjs`, as a committed regression pin (#2193 — the missing half of
// docs/history/gate-runtime-worked-cases-2026-09.md §"Archived world-program guarantee table" row 14, "Fresh type verdicts": *warm/changed/restored produce
// green/red/green without deleting caches; long and short forced incremental flags cannot bypass the
// wrapper*).
//
// WHAT WAS AND WAS NOT ALREADY PINNED. The ARGV half — that every spelling of `--incremental` / `-i` /
// `--tsBuildInfoFile` is stripped before spawn, that malformed spellings refuse before spawn, and that
// unrelated argv plus the checker cap survive — is pinned by
// `tests/tooling/_shared/concurrency-profile.test.ts` (its two TS7-wrapper tests, through a `spawnSync`
// capture preload), and is deliberately NOT re-asserted here. What had NO pin is the BEHAVIOUR that argv
// stripping exists to buy: that a real TS7 run through this wrapper, driven with Vitest's own forced
// incremental arguments, still answers about the CODE AS IT IS NOW.
//
// WHY THAT HALF NEEDS ITS OWN RUN AND CANNOT BE READ OFF THE ARGV (#1892, `7d9cd503e`). The defect the
// wrapper fixed was not "a flag was passed"; it was a warm native TS7 accepting a widened program, updating
// its file inventory, and RETAINING the prior semantic verdict for an unchanged consumer — exit 0 over
// source that classic TypeScript and cold TS7 both rejected. The shape below is that shape: the error is
// planted in `dep.ts` and the diagnostic is owed by `sentinel.ts`, WHICH DOES NOT CHANGE. A stale verdict
// is therefore the failure mode this test would see, and it is the one an argv assertion cannot.
//
// NOTHING IS DELETED BETWEEN THE THREE RUNS — that is the guarantee, stated as a method. The suite never
// removes a build-info file, never clears a cache directory, and hands the SAME `--tsBuildInfoFile` path to
// all three invocations; the closing assertion is that the path was never written at all, which is the
// mechanical proof that the cold-check policy reached the compiler rather than merely being requested.
//
// PLANTED-BREAK RECEIPT (the arm this file invents, per the family-test rule): with
// `withoutIncremental` reduced to the identity function in a scratch copy of the wrapper, `no build-info
// file is written` reds — the requested cache appears on disk — while the green/red/green triple stays
// green, because a DIRECT edit to a root file is an invalidation warm TS7 does get right. The triple is
// what pins the guarantee; the build-info assertion is what can see it being bypassed. Both are load-bearing
// and neither replaces the other.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

/** Three real native TS7 programs, one after another, on a two-file project. Quiet-box measured well under
 *  this; scaled because a contended box multiplies a child compiler's wall clock and nothing else. */
const FRESHNESS_BASE_MS = 120_000;

/** The exact argument shape Vitest's `Typechecker.spawn()` builds (the #1892 report quotes it verbatim from
 *  `node_modules/vitest/dist/chunks/index.*.js`): forced incremental plus an isolated build-info path. The
 *  wrapper's whole job is that these do not reach the compiler. */
function vitestShapedArgv(buildInfo: string, tsconfig: string): readonly string[] {
  return ["--noEmit", "--pretty", "false", "--incremental", "--tsBuildInfoFile", buildInfo, "-p", tsconfig];
}

/** The consumer that never changes across the three runs — it is the file the diagnostic is owed by, and a
 *  retained verdict for it is exactly what the warm checker produced. */
const SENTINEL = 'import { value } from "./dep.ts";\n\nexport const check: string = value;\n';
const DEP_CLEAN = 'export const value = "ok";\n';
/** The same export, retyped. `sentinel.ts` is untouched and TS2322 now belongs to it. */
const DEP_BROKEN = "export const value = 1;\n";

const TSCONFIG = JSON.stringify(
  { compilerOptions: { allowImportingTsExtensions: true, module: "preserve", noEmit: true, strict: true, target: "esnext" }, include: ["src"] },
  null,
  2,
);

interface Program {
  readonly tsconfig: string;
  readonly buildInfo: string;
  readonly dep: string;
}

function writeProgram(root: string): Program {
  mkdirSync(join(root, "src"), { recursive: true });
  const program: Program = { tsconfig: join(root, "tsconfig.json"), buildInfo: join(root, "ts7.tsbuildinfo"), dep: join(root, "src", "dep.ts") };
  writeFileSync(program.tsconfig, TSCONFIG);
  writeFileSync(join(root, "src", "sentinel.ts"), SENTINEL);
  writeFileSync(program.dep, DEP_CLEAN);
  return program;
}

interface CompilerRun {
  readonly status: number | null;
  readonly output: string;
}

/** Run the REAL wrapper — the file the two Vitest type projects and `pnpm typecheck` both invoke. */
function runWrapper(repoRoot: string, program: Program): CompilerRun {
  const result = spawnSync(process.execPath, [join(repoRoot, "scripts", "ts7.cjs"), ...vitestShapedArgv(program.buildInfo, program.tsconfig)], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

test("warm, changed and restored produce green/red/green through the TS7 wrapper — with no cache deleted between them", {
  timeout: scaledBudget(FRESHNESS_BASE_MS),
}, ({ repoRoot, scratch }) => {
  const program = writeProgram(scratch);

  const warm = runWrapper(repoRoot, program);
  expect(warm.status, `the clean program must check clean:\n${warm.output}`).toBe(0);

  // The ONLY mutation in the whole test, and it is not the file the diagnostic lands in.
  writeFileSync(program.dep, DEP_BROKEN);
  const changed = runWrapper(repoRoot, program);
  expect(changed.status, "a type error introduced through an unchanged consumer must be REPORTED, not retained from the warm run").not.toBe(0);
  expect(changed.output, "and it must be the sentinel's own diagnostic").toContain("sentinel.ts");
  expect(changed.output).toContain("TS2322");

  writeFileSync(program.dep, DEP_CLEAN);
  const restored = runWrapper(repoRoot, program);
  expect(restored.status, `restoring the source must restore the verdict:\n${restored.output}`).toBe(0);

  // THE MECHANISM, not just the outcome: no build-info file was ever written, so there was never a warm
  // cache to be stale — and nothing above had to delete one to get an honest answer.
  expect(existsSync(program.buildInfo), "the wrapper strips --tsBuildInfoFile, so the requested cache must never appear on disk").toBe(false);
});
