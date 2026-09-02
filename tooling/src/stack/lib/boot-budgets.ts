// The stack's BOOT CEILINGS, load-scaled — the node half of a bash-fronted value (#1232,
// docs/design/1208-instrument-substrate.md §7.1). `stack.sh` cannot import the shared budget policy (bash
// has no module system, and the last time a shell re-spelled a node fact — the vLLM port list — it polled
// ports the fleet never bound and reported the fleet gone while it still held VRAM). So the shell READS
// these two numbers from the same `budget()` every instrument uses, exactly as it already reads `classify`
// and `debug-env`: ONE formula, never a second one written in shell.
//
// WHY these two are budgets and not settles: both bound a POLL LOOP over a boot that is legitimately slow
// (the vLLM fleet cold-spawns during server boot, and a cold vite compile is ~55s), so a stage boot under a
// merge train reads `boot-timeout` at the quiet-box number while nothing is wrong — the memory lesson
// `stack-restart-vs-battery-contention`. They are ceilings, not sleeps: a warm boot never reaches them.
import { budget } from "../../_shared/load-budget.ts";

/** Quiet-box base for the server `/healthz` gate. Must clear a full model cold-load (the gen 8B alone runs
 *  well past a minute); 60s once falsely tore down a server that was still coming up. */
const SERVER_HEALTHZ_BASE_MS = 180_000;

/** Quiet-box base for the wrapper's readiness poll. Stays AHEAD of the healthz gate plus a cold vite
 *  compile, so it never declares boot-timeout while the leader is legitimately still booting. */
const READINESS_BASE_MS = 240_000;

const MS_PER_SECOND = 1000;

/** The shell contract: `KEY=<seconds>` lines, read with `read` (never `eval`). Seconds because both
 *  consumers are `seq 1 "$N"` one-second poll loops. Rounded UP — a truncated ceiling is a shorter one. */
export function bootBudgetLines(): readonly string[] {
  return [
    `SERVER_HEALTHZ_TIMEOUT=${String(Math.ceil(budget(SERVER_HEALTHZ_BASE_MS) / MS_PER_SECOND))}`,
    `READINESS_TIMEOUT=${String(Math.ceil(budget(READINESS_BASE_MS) / MS_PER_SECOND))}`,
  ];
}
