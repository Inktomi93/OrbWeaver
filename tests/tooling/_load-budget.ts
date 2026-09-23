// THE VITEST SEAM of the ONE load policy (NOT a test file — no `.test` suffix, so test-layout ignores it,
// the `_support.ts` precedent). The POLICY itself moved DOWN to `@orb/tooling/_shared/load-budget` on
// 2026-09-02 (#1232): the box reading, the factor, the
// wall-clock `budget()`, the rate judgment, the two markers and the kill message are shared with the
// INSTRUMENTS, the two runner configs and the stack launcher, and a policy that lives under `tests/` can
// serve none of them. What stays here is exactly what only vitest can use:
//   • the `TaskMeta` augmentation + `labelRateLoad` (stamping a LOAD-SUSPECT arm where the json reporter
//     can see it — stderr alone records the reason NOWHERE in reports/test-report.json). Since #1616 it
//     LABELS and returns; it no longer skips, so the arm's numbers still get measured and printed and
//     only its THRESHOLD assertions stand down;
//   • the CHILD RUNNERS (`runNodeWithBudget` / `runPnpmWithBudget` / `spawnNodeWithBudget`), the shape a
//     tooling self-test uses to shell a real CLI and get a LEGIBLE kill instead of an opaque red. They are
//     synchronous `execFileSync`/`spawnSync` doors built for a test body; the instruments spawn through
//     `_shared/proc.ts` (the nice -19 floor), which now takes its own default from `budget()`.
// The re-exports below are the seam's PUBLIC face for the 11 suites that already import from here — one
// import site, one policy underneath.
import { execFileSync, spawnSync } from "node:child_process";
import process from "node:process";
import type { BoxLoad, MeasurementVerdict } from "@orb/tooling/_shared/load-budget";
import {
  boxLoadKnobError,
  budget,
  isTimeoutKill,
  judgeMeasurementLoad,
  LOAD_SUSPECT_META_KEY,
  loadKillError,
  readBoxLoad,
} from "@orb/tooling/_shared/load-budget";
import type { TaskMeta } from "vitest";

// THE VITEST DOOR for a mis-spelled planted-box knob (#1666). The policy module deliberately does NOT throw
// on a bad `ORB_BOX_LOAD` — it is read inside instrument IMPORT GRAPHS, where a throw exits 1 ("violations")
// before any handler exists — so each door refuses in its own idiom: an instrument CLI exits 3 from
// `runTool`, and a vitest worker throws HERE, at import, where the runner reports it as a failure naming the
// knob. Silently measuring the live box while the operator believes a plant is in force is the one outcome
// neither door may produce.
const knobError = boxLoadKnobError();
if (knobError !== null) {
  throw new Error(knobError);
}

export type { BoxLoad, MeasurementVerdict } from "@orb/tooling/_shared/load-budget";
export {
  computeLoadFactor,
  isJudgeableMeasurement,
  isLoadKill,
  isTimeoutKill,
  judgeMeasurementLoad,
  LOAD_KILL_MARKER,
  LOAD_SUSPECT_MARKER,
  LOAD_SUSPECT_META_KEY,
  readBoxLoad,
} from "@orb/tooling/_shared/load-budget";

// The reporter-visible channel for a LOAD-SUSPECT arm, declared where the label lives. `TaskMeta` is
// vitest's own augmentation point and `meta` is a per-test field the json reporter serializes for a PASSING
// test as well as a skipped one — so this augmentation is not decoration, it is the whole reason the label
// is legible in `reports/test-report.json` at all (see `labelRateLoad` + scripts/vitest-supervised.ts).
declare module "vitest" {
  interface TaskMeta {
    /** The #1040 load reason, set by `labelRateLoad` when the box was loaded while the arm measured
     *  (#1616 — it labels the number now; it does not skip the test). */
    orbLoadSuspect?: string;
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
export interface LabellableTest {
  readonly task: { readonly meta: TaskMeta };
}

/** LABEL a MEASURED-RATE arm when the box is loaded — never skip it (#1616, owner ruling). On a loaded box
 *  this stamps the reason into `task.meta` (the reporter-visible channel) and shouts it on stderr, then
 *  RETURNS the verdict so the caller can measure, print its numbers, and gate only its THRESHOLD
 *  assertions on `isJudgeableMeasurement(verdict)`. On a quiet box it returns `complete` and the caller
 *  judges exactly as before.
 *
 *  IT USED TO CALL `ctx.skip(reason)`, which threw and stopped the arm dead. That is what the ruling
 *  reversed: our steady state is loaded, so the skip made these arms unavailable most of the day. The
 *  numbers are worth reading even when they cannot be judged.
 *
 *  CALL IT AS `labelRateLoad({ task }, "…")`, destructuring `task` out of the test's own argument list:
 *  every suite here runs on a `test.extend` fixture and vitest's fixture parser REFUSES a non-destructured
 *  first parameter outright (`FixtureParseError`), which FAILS the test rather than labelling it. */
export function labelRateLoad(ctx: LabellableTest, what: string, read: () => BoxLoad = readBoxLoad): MeasurementVerdict {
  const verdict = judgeMeasurementLoad(read(), what);
  if (verdict.disposition === "load-suspect") {
    ctx.task.meta[LOAD_SUSPECT_META_KEY] = verdict.reason;
    process.stderr.write(`${verdict.reason}\n`);
  }
  return verdict;
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
 *  Fatal exits throw ordinary errors while timeout kills alone carry LOAD_KILL_MARKER.
 *
 *  WHERE THE COMMITTED PINS ARE, stated because a verifier receipt has already claimed there are none
 *  (#2197; the claim was *"Nothing under `tests/` exercises `runCommandWithBudget`'s error path"* on the
 *  strength of a grep that returns three hits). All four outcomes are pinned in
 *  `tests/tooling/load-budget.int.test.ts`: the finish arm at `:67-70`, the exit-1 arm at `:76-80`, the
 *  kill arm at `:54-65`, and the exit-2 arm at `:82-86` — which drives
 *  `process.stderr.write('fatal'); process.exit(2)` through `runNodeWithBudget` and asserts
 *  `/exit 2.*fatal/su` against the thrown message, so it can only pass if the child's stderr reaches the
 *  message. DECLARED LIMIT, so the next reader does not overclaim either: the
 *  exit-2 arm pins the THROW's text, not the `stdio` triple above it, because node's default already
 *  captures stderr; deleting the triple leaves that suite green. A pin on the echo suppression would need
 *  a parent-stream assertion and does not exist. */
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
      // #2197 — THE TRIPLE STAYS; ITS ORIGINAL STATED REASON DID NOT SURVIVE MEASUREMENT (corrected
      // 2026-09-13, node v26.5.0). This comment used to say *"execFileSync's DEFAULT leaves the child's
      // stderr inherited by the parent, so `err.stderr` is null"*. It is false: the default is
      // `["pipe","pipe","pipe"]`, so `err.stderr` is ALREADY a populated string with no `stdio` option at
      // all, and only `stdio: "inherit"` — which this call site never used — nulls it. Measured three
      // shapes against one child writing both streams and exiting 2: default → `"fatal-words"` (string),
      // this triple → `"fatal-words"` (string), `"inherit"` → `null`.
      // WHAT THE TRIPLE ACTUALLY BUYS, and both are real: `"ignore"` isolates the child's stdin, and
      // piping fd 2 suppresses node's ECHO of the child's stderr into the vitest stream (visible in the
      // same measurement — the default run printed `fatal-words` to the parent, this one did not). The
      // legibility half the row was filed for is the `${label} child exit ${status}: ${stderr}` throw
      // below, which is what puts the child's own words into the assertion message.
      stdio: ["ignore", "pipe", "pipe"],
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
