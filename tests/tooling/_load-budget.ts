// THE VITEST SEAM of the ONE load policy (NOT a test file — no `.test` suffix, so test-layout ignores it,
// the `_support.ts` precedent). The POLICY itself moved DOWN to `@orb/tooling/_shared/load-budget` on
// 2026-09-02 (#1232, docs/design/1208-instrument-substrate.md §7.1): the box reading, the factor, the
// wall-clock `budget()`, the withhold judgment, the two markers and the kill message are shared with the
// INSTRUMENTS, the two runner configs and the stack launcher, and a policy that lives under `tests/` can
// serve none of them. What stays here is exactly what only vitest can use:
//   • the `TaskMeta` augmentation + `withholdMeasurement` (stamping a withheld arm where the json reporter
//     can see it — a bare `ctx.skip(reason)` records the reason NOWHERE);
//   • the CHILD RUNNERS (`runNodeWithBudget` / `runPnpmWithBudget` / `spawnNodeWithBudget`), the shape a
//     tooling self-test uses to shell a real CLI and get a LEGIBLE kill instead of an opaque red. They are
//     synchronous `execFileSync`/`spawnSync` doors built for a test body; the instruments spawn through
//     `_shared/proc.ts` (the nice -19 floor), which now takes its own default from `budget()`.
// The re-exports below are the seam's PUBLIC face for the 11 suites that already import from here — one
// import site, one policy underneath.
import { execFileSync, spawnSync } from "node:child_process";
import process from "node:process";
import type { BoxLoad } from "@orb/tooling/_shared/load-budget";
import { budget, isTimeoutKill, judgeMeasurementLoad, LOAD_WITHHOLD_META_KEY, loadKillError, readBoxLoad } from "@orb/tooling/_shared/load-budget";
import type { TaskMeta } from "vitest";

export type { BoxLoad } from "@orb/tooling/_shared/load-budget";
export {
  computeLoadFactor,
  isLoadKill,
  isTimeoutKill,
  judgeMeasurementLoad,
  LOAD_KILL_MARKER,
  LOAD_WITHHOLD_MARKER,
  LOAD_WITHHOLD_META_KEY,
  readBoxLoad,
} from "@orb/tooling/_shared/load-budget";

// The reporter-visible channel for a withheld arm, declared where the withhold lives. `TaskMeta` is
// vitest's own augmentation point and `meta` is the ONLY per-test field its json reporter serializes for a
// SKIPPED test — so this augmentation is not decoration, it is the whole reason a withhold is legible in
// `reports/test-report.json` at all (see `withholdMeasurement` + scripts/vitest-supervised.mjs).
declare module "vitest" {
  interface TaskMeta {
    /** The #1040 withhold reason, set by `withholdMeasurement` immediately before `ctx.skip`. */
    orbLoadWithheld?: string;
  }
}

/** A budget that GROWS with contention — the suites' spelling of the core's `budget()`, keeping the
 *  optional FACTOR CAP argument the tooling self-tests pass (`scaledBudget(45_000, 4)`: a conformance
 *  sweep that is CPU-bound rather than IO-bound gets less headroom than the default 8×). ONE formula
 *  underneath; this is a call, never a second arithmetic. */
export function scaledBudget(baseMs: number, cap?: number): number {
  return budget(baseMs, readBoxLoad, cap);
}

/** The minimum of vitest's test context this module needs — structural on purpose, so the seam does not
 *  pin itself to a whole `TestContext` (which a planted control could not construct). The real context
 *  satisfies it: `task` is `Readonly<Test>` whose `meta` is the augmented `TaskMeta`, and `skip`'s
 *  `(note?: string): never` overload is assignable to the one-arg signature below. */
export interface WithholdableTest {
  readonly task: { readonly meta: TaskMeta };
  readonly skip: (note?: string) => unknown;
}

/** Withhold a MEASURED-RATE arm when the box is too loaded for the number to mean anything. On a loaded
 *  box this stamps the reason into `task.meta` (the reporter-visible channel), shouts it on stderr, and
 *  calls `skip(reason)` — which THROWS, so nothing after the call runs and the arm never votes. On a quiet
 *  box it returns and the caller measures exactly as before.
 *
 *  CALL IT AS `withholdMeasurement({ task, skip }, "…")`, destructuring both members out of the test's own
 *  argument list. It cannot take the whole context: every suite here runs on a `test.extend` fixture, and
 *  vitest's fixture parser REFUSES a non-destructured first parameter outright — it throws
 *  `FixtureParseError: The 1st argument inside a fixture must use object destructuring pattern` — which
 *  FAILS the test rather than skipping it, i.e. exactly the false red this seam exists to prevent. `task`
 *  and `skip` are ordinary context members, so naming them alongside the fixtures is free, and `skip` is
 *  an arrow closed over the task (vitest's own runner chunk) so it survives destructuring. */
export function withholdMeasurement(ctx: WithholdableTest, what: string, read: () => BoxLoad = readBoxLoad): void {
  const verdict = judgeMeasurementLoad(read(), what);
  if (!verdict.withheld) {
    return;
  }
  ctx.task.meta[LOAD_WITHHOLD_META_KEY] = verdict.reason;
  process.stderr.write(`${verdict.reason}\n`);
  ctx.skip(verdict.reason);
}

export interface ChildBudgetOpts {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly maxBuffer?: number;
}

/** Run a command under a load-scaled child `timeout`. THREE outcomes, kept distinct on purpose:
 *  - the child finishes → its stdout is returned;
 *  - the child exits 1 (a gate verdict) → its stdout is returned so the caller can read the report;
 *  - the child exits 2/3 (tool failure/misuse) → the fatal status and stderr are thrown, never flattened;
 *  - the child is KILLED by the timeout (contention) → a `loadKillError` is THROWN, so the kill is legible.
 *  Fatal exits throw ordinary errors while timeout kills alone carry LOAD_KILL_MARKER. */
interface CommandBudget {
  readonly command: string;
  readonly args: readonly string[];
  readonly opts: ChildBudgetOpts;
  readonly budgetMs: number;
  readonly label: string;
}

function runCommandWithBudget(run: CommandBudget): string {
  const { command, args, opts, budgetMs, label } = run;
  try {
    return execFileSync(command, [...args], {
      cwd: opts.cwd,
      env: opts.env,
      encoding: "utf8",
      maxBuffer: opts.maxBuffer,
      timeout: budgetMs,
    });
  } catch (err) {
    const e = err as { code?: string; signal?: string | null; stdout?: string };
    // A timeout kill has TWO shapes and BOTH are load kills. The original ruling — `signal:"SIGTERM"` (a
    // plain non-zero exit has `signal:null`) — still holds and is kept; what changed is the INPUT. Measured
    // 2026-09-01 (#999 f): `pnpm check:structure` killed at its budget under loadavg 38/24 cores threw the
    // OTHER shape instead — `code:"ETIMEDOUT"`, `errno:-110`, `syscall:"spawnSync pnpm"`, with `signal:null`
    // and `status:0`, because node surfaces spawnSync's own `error` field rather than a signalled exit when
    // the killed child's group does not report the signal back. The SIGTERM-only discriminator therefore
    // dropped the kill into the generic branch below, which printed `child exit 0` — the opaque, unclassified
    // red this whole module exists to prevent, and it cost a lane the archaeology anyway.
    if (isTimeoutKill(e)) {
      throw loadKillError({ what: label, budgetMs });
    }
    const status = (e as { status?: number | null }).status;
    if (status === 1 && typeof e.stdout === "string") {
      return e.stdout;
    }
    if (typeof status === "number") {
      const stderr = (e as { stderr?: string }).stderr ?? "";
      throw new Error(`${label} child exit ${status}${stderr === "" ? "" : `: ${stderr}`}`, { cause: err });
    }
    throw err;
  }
}

export function runNodeWithBudget(args: readonly string[], opts: ChildBudgetOpts, budgetMs: number, label: string): string {
  return runCommandWithBudget({ command: "node", args, opts, budgetMs, label });
}

/** Workspace entrypoint variant: preserves pnpm's heap/dependency contract while retaining exit honesty. */
export function runPnpmWithBudget(args: readonly string[], opts: ChildBudgetOpts, budgetMs: number, label: string): string {
  return runCommandWithBudget({ command: "pnpm", args, opts, budgetMs, label });
}

export interface SpawnBudgetResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** `spawnSync("node", …)` under a load-scaled child `timeout`, THROWING a legible `loadKillError` when the
 *  child is killed by that timeout rather than returning a `status:null` result the caller would misread as
 *  a failed assertion. A normal exit (any status) is returned untouched. */
export function spawnNodeWithBudget(args: readonly string[], cwd: string, budgetMs: number, label: string): SpawnBudgetResult {
  const run = spawnSync("node", [...args], { cwd, encoding: "utf8", timeout: budgetMs });
  // `run.error` present is what separates a killed child from one that merely exited; WHICH kill shape it
  // carries (a SIGTERM'd exit or an ETIMEDOUT error object) is `isTimeoutKill`'s call — and getting that
  // wrong HERE is worse than on the execFileSync path, because the miss returns `{status:0, stdout:""}`
  // instead of throwing: a silent false green rather than an opaque red.
  if (run.error !== undefined && isTimeoutKill({ code: (run.error as { code?: string }).code, signal: run.signal })) {
    throw loadKillError({ what: label, budgetMs });
  }
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}
