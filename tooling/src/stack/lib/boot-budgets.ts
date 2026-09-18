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

/** Quiet-box base for the server `/healthz` gate. Under `adopt-or-start` the WHOLE three-engine fleet
 *  cold-spawns during boot, and the gate must clear all three — 180 s tore down a booting server on
 *  2026-09-18 while the fleet (embed + rerank + a 27 B gen) was still loading; 60 s had done the same to
 *  the 8 B gen alone before that. 900 s is the same cold-load allowance the container overlay gives the
 *  engines (`docker/compose.engines.yaml` start_period). A warm boot never reaches it (a ceiling, not a sleep). */
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
