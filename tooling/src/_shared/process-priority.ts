// The cross-platform replacement for `nice -n 19`, which does not exist on Windows: lower THIS process's
// own scheduling priority once at startup, so every child it spawns afterward inherits it on Linux, macOS
// and Windows.
import { constants, setPriority } from "node:os";

/** Below-normal, not `PRIORITY_LOW` (19): on Windows 19 maps to the IDLE priority class, which can starve
 *  a run behind a busy desktop. `PRIORITY_BELOW_NORMAL` (10) is below-normal on every OS. */
export const TOOLING_PRIORITY: number = constants.priority.PRIORITY_BELOW_NORMAL;

let lowered = false;

/** Lower this process's own priority once; idempotent so every tooling entry point can call it
 *  unconditionally. A child spawned after this call inherits the lowered priority. */
export function lowerToolingPriority(): void {
  if (lowered) {
    return;
  }
  lowered = true;
  setPriority(TOOLING_PRIORITY);
}
