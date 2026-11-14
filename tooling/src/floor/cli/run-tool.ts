// The ONE exit-honesty runner — every tool cli enters through it, and it holds the one hard exit in tooling; no lint rule enforces either.
// It owns the three behaviors the historical tools each hand-rolled and diverged on:
//  1. CRASH ≠ VERDICT: node's default crash exit is 1, which COLLIDES with "1 = violations" — a crash
//     read as a verdict (probe-fire's own hand-rolled handler exited 1 on uncaught, the live instance).
//     Handlers force toolError (2) on uncaughtException/unhandledRejection.
//  2. PIPE-DRAIN: process.exit() drops unflushed stdout and truncates a large report mid-line (the
//     check-report lesson) — the VERDICT path only ever sets process.exitCode and lets the loop drain.
//     CRASH paths hard-exit after a synchronous stderr write: termination outranks tail-drain there
//     (a mid-run throw can strand a live browser; the pre-crash report bytes already flushed).
//  3. NEVER-DOWNGRADE: a verdict already set outranks a later generic failure — clean may become
//     anything, violations may only escalate to toolError, misuse/toolError never lower.
import process from "node:process";
import { boxLoadKnobError } from "../host/load-budget.ts";
import { reexecWithNodeHeapFloor } from "../process/node-heap.ts";
import { acquireRunTempRoot } from "../process/run-temp-root.ts";
import type { ExitCode } from "./exit-contract.ts";
import { EXIT } from "./exit-contract.ts";

/** Throw from a tool main for CLI misuse — the runner maps it to exit 3 (misuse) with the message. */
export class UsageError extends Error {}

function describeThrown(e: unknown): string {
  return e instanceof Error ? (e.stack ?? e.message) : String(e);
}

/** The no-downgrade lattice (behavior 3). */
function escalate(code: ExitCode): void {
  const current = process.exitCode;
  if (current === undefined || current === EXIT.clean || (current === EXIT.violations && code === EXIT.toolError)) {
    process.exitCode = code;
  }
}

function crashLine(label: string, e: unknown): string {
  return `TOOL ERROR (${label}): ${describeThrown(e)}`;
}

/**
 * What a throw from a tool's main makes of its run: the exit code and the one stderr line {@link runTool} writes.
 *
 * @remarks A host that runs several invocations in one process reports a run's throw through this, so the run ends
 * as its own process would have.
 */
export function thrownOutcome(e: unknown): { readonly code: ExitCode; readonly line: string } {
  return e instanceof UsageError ? { code: EXIT.misuse, line: `ARG ERROR    ${e.message}` } : { code: EXIT.toolError, line: crashLine("thrown", e) };
}

/** How {@link runTool} ends a run on any path it does not hand back to the tool. */
export interface RunToolOptions {
  /**
   * Applied to every line the runner writes for a throw, the uncaught and unhandled-rejection handlers included.
   *
   * @remarks A tool that holds private values passes its value scrub here: a throw outside its own awaited path, such
   * as a browser event that rejects late, reaches only these handlers. A tool without one prints the raw stack.
   */
  readonly scrubCrashText?: (text: string) => string;
}

const keepCrashText = (text: string): string => text;

function crashExit(label: string, e: unknown, scrub: (text: string) => string = keepCrashText): never {
  process.stderr.write(`${scrub(crashLine(label, e))}\n`);
  escalate(EXIT.toolError);
  // Behavior 2's crash arm: a stranded event loop (a live browser, an open server) must not hang the
  // caller forever — exit with the escalated code, stderr already written synchronously.
  process.exit(process.exitCode ?? EXIT.toolError);
}

/** Heavy CLI imports follow this boundary so bootstrap failure remains a tool error. */
export function prepareToolHeap(): void {
  try {
    reexecWithNodeHeapFloor(process.argv.slice(1));
  } catch (error) {
    crashExit("heap startup", error);
  }
}

/** Run a tool's main with the exit contract enforced on every path. `main` returns its ExitCode (or any
 *  number it computed against EXIT); throwing UsageError is the misuse door; any other throw is a tool
 *  error — never a verdict. */
export async function runTool(main: () => Promise<number> | number, options: RunToolOptions = {}): Promise<void> {
  const scrub = options.scrubCrashText ?? keepCrashText;
  process.on("uncaughtException", (e) => crashExit("uncaught", e, scrub));
  process.on("unhandledRejection", (e) => crashExit("unhandled rejection", e, scrub));
  // the UsageError branch writes "ARG ERROR" to stderr and sets exit 3 through escalate(EXIT.misuse); every other throw goes to crashExit, typed never. Ends if either branch stops writing stderr or setting the exit code.
  try {
    prepareToolHeap();
    // After the heap re-exec, so the folder belongs to the process that keeps running. Its Chromium profiles and
    // scratch folders go with it; the exit hook removes it on every path, a crash's `process.exit` included.
    acquireRunTempRoot();
    // THE AMBIENT-KNOB DOOR. A mis-spelled `ORB_BOX_LOAD` is MISUSE — the same class as bad argv —
    // but it is read lazily by whichever module first needs a budget, which for several instruments is the
    // IMPORT GRAPH: a throw there escapes before these handlers exist and exits 1, i.e. "violations found"
    // under the house contract. Asking here, once, inside the try, makes it one line and exit 3.
    const knob = boxLoadKnobError();
    if (knob !== null) {
      throw new UsageError(knob);
    }
    escalate((await main()) as ExitCode);
  } catch (e) {
    if (e instanceof UsageError) {
      const thrown = thrownOutcome(e);
      process.stderr.write(`${scrub(thrown.line)}\n`);
      escalate(thrown.code);
      return;
    }
    crashExit("thrown", e, scrub);
  }
}
