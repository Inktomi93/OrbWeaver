// The ONE exit-honesty runner — every tool cli enters through it (policy `tooling-cli-entry`; its one hard exit carries the reviewed grant `tooling-process-exit-home:run-tool`).
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
import type { ExitCode } from "./exit-contract.ts";
import { EXIT } from "./exit-contract.ts";
import { boxLoadKnobError } from "./load-budget.ts";
import { lowerToolingPriority } from "./process-priority.ts";

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

function crashExit(label: string, e: unknown): never {
  process.stderr.write(`TOOL ERROR (${label}): ${describeThrown(e)}\n`);
  escalate(EXIT.toolError);
  // Behavior 2's crash arm: a stranded event loop (a live browser, an open server) must not hang the
  // caller forever — exit with the escalated code, stderr already written synchronously.
  process.exit(process.exitCode ?? EXIT.toolError);
}

/** Run a tool's main with the exit contract enforced on every path. `main` returns its ExitCode (or any
 *  number it computed against EXIT); throwing UsageError is the misuse door; any other throw is a tool
 *  error — never a verdict. */
export async function runTool(main: () => Promise<number> | number): Promise<void> {
  lowerToolingPriority();
  process.on("uncaughtException", (e) => crashExit("uncaught", e));
  process.on("unhandledRejection", (e) => crashExit("unhandled rejection", e));
  // @orb-waive caught-failure-ownership(e): the exit-contract's own door — UsageError writes ARG ERROR and escalates misuse, anything else routes through crashExit which writes stderr, escalates toolError and hard-exits. Ends if a branch here stops writing stderr or escalating.
  try {
    // THE AMBIENT-KNOB DOOR (#1666). A mis-spelled `ORB_BOX_LOAD` is MISUSE — the same class as bad argv —
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
      process.stderr.write(`ARG ERROR    ${e.message}\n`);
      escalate(EXIT.misuse);
      return;
    }
    crashExit("thrown", e);
  }
}
