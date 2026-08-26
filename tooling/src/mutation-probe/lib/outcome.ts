// Mapping a spawned suite's exit into a mutant verdict. Extracted so the TIMEOUT arm is unit-provable:
// spawnSync reports a child killed by the wall-clock ceiling as `status: null`, and the obvious
// `status !== 0` spelling scores that unmeasured hang as a KILL — the instrument lying in the one
// direction that hides a real survivor. An infinite-loop mutant is the standing cause, so this is not a
// theoretical arm; mutation testing manufactures its inputs.

import type { SuiteVerdict } from "../contract/types.ts";

export function classifySuiteExit(status: number | null): SuiteVerdict {
  if (status === null) {
    return "unmeasured";
  }
  return status === 0 ? "survived" : "killed";
}
