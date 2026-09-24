// The stack's BOOT CEILINGS, load-scaled — the node half of a bash-fronted value (#1232).
// `stack.sh` cannot import the shared budget policy (bash has no module system, and a shell that
// re-spells a node fact drifts from it). So the shell READS these two numbers from the same `budget()`
// every instrument uses, exactly as it already reads `classify` and `debug-env`: ONE formula, never a
// second one written in shell.
//
// WHY these two are budgets and not settles: both bound a POLL LOOP over a boot that is legitimately slow
// (a cold vite compile is ~55s), so a stage boot under a merge train reads `boot-timeout` at the quiet-box
// number while nothing is wrong — the memory lesson `stack-restart-vs-battery-contention`. They are
// ceilings, not sleeps: a warm boot never reaches them.
import { budget } from "../../_shared/load-budget.ts";

/** Quiet-box base for the server `/healthz` gate. Sized when the server boot could include a model
 *  cold-load; a warm boot never reaches it (a ceiling, not a sleep). */
const SERVER_HEALTHZ_BASE_MS = 900_000;

/** Quiet-box base for the wrapper's readiness poll. Stays AHEAD of the healthz gate plus a cold vite
 *  compile (~55 s), so it never declares boot-timeout while the leader is legitimately still booting. */
const READINESS_BASE_MS = 960_000;

const MS_PER_SECOND = 1000;

/** The shell contract: `KEY=<seconds>` lines, read with `read` (never `eval`). Seconds because both
 *  consumers are `seq 1 "$N"` one-second poll loops. Rounded UP — a truncated ceiling is a shorter one. */
export function bootBudgetLines(): readonly string[] {
  return [
    `SERVER_HEALTHZ_TIMEOUT=${String(Math.ceil(budget(SERVER_HEALTHZ_BASE_MS) / MS_PER_SECOND))}`,
    `READINESS_TIMEOUT=${String(Math.ceil(budget(READINESS_BASE_MS) / MS_PER_SECOND))}`,
  ];
}
