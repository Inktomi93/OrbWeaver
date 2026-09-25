// The cross-platform replacement for `nice -n 19`, which does not exist on Windows: `niced-exec.ts` is a
// launcher that lowers ITS OWN priority then runs the real command, so the child inherits it on Linux,
// macOS and Windows. Nothing here lowers the CALLER's own priority — a full-priority child spawned by the
// same process must stay at that process's real priority, not a niced door's leftover.
import { constants, setPriority } from "node:os";
import { fileURLToPath } from "node:url";

/** Below-normal, not `PRIORITY_LOW` (19): on Windows 19 maps to the IDLE priority class, which can starve
 *  a run behind a busy desktop. `PRIORITY_BELOW_NORMAL` (10) is below-normal on every OS. */
export const TOOLING_PRIORITY: number = constants.priority.PRIORITY_BELOW_NORMAL;

let lowered = false;

/** Lower THIS process's own priority once; idempotent so `niced-exec.ts` can call it unconditionally at
 *  startup. A child spawned after this call inherits the lowered priority. */
export function lowerToolingPriority(): void {
  if (lowered) {
    return;
  }
  lowered = true;
  setPriority(TOOLING_PRIORITY);
}

const NICED_EXEC_ENTRY = fileURLToPath(new URL("./niced-exec.ts", import.meta.url));

/** The argv that runs `cmd args…` through `niced-exec.ts`: `spawn(process.execPath, nicedArgv(cmd, args))`
 *  is the one-line replacement for the old `spawn("nice", ["-n", "19", cmd, ...args])`. */
export function nicedArgv(cmd: string, args: readonly string[]): readonly string[] {
  return [NICED_EXEC_ENTRY, cmd, ...args];
}
