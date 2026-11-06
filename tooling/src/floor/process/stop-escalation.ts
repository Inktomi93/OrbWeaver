// The one TERM-then-KILL escalation a stopper runs over a process group it owns: TERM, poll until the caller's
// `gone` holds or the TERM grace ends, then KILL and poll the KILL grace. The async form serves a verb that can
// yield; the sync form serves the snap stage paths, whose callers cannot. Both read the one phase table.
import { setTimeout as sleep } from "node:timers/promises";
import { budget } from "../host/load-budget.ts";

const STOP_POLL_MS = 500;
/** Quiet-box grace for a TERM before KILL; a server's own drain is ten seconds. Load-scaled per call. */
export const TERM_GRACE_BASE_MS = 15_000;
const KILL_GRACE_BASE_MS = 10_000;

/** How often an escalation polls and how long it waits after each signal; a test injects a short one. */
export interface StopTiming {
  readonly pollMs: number;
  readonly termGraceMs: number;
  readonly killGraceMs: number;
}

const REAL_TIMING: StopTiming = { pollMs: STOP_POLL_MS, termGraceMs: TERM_GRACE_BASE_MS, killGraceMs: KILL_GRACE_BASE_MS };
const PHASES = [
  ["SIGTERM", "termGraceMs"],
  ["SIGKILL", "killGraceMs"],
] as const satisfies readonly (readonly [NodeJS.Signals, keyof StopTiming])[];

/** One escalation: how to signal the group, how to tell it is gone, and what to say before KILL. */
export interface StopEscalation {
  readonly signal: (signal: NodeJS.Signals) => void;
  readonly gone: () => boolean;
  readonly onEscalate?: () => void;
  readonly timing?: StopTiming;
}

function pollsFor(graceBaseMs: number, pollMs: number): number {
  return Math.ceil(budget(graceBaseMs) / pollMs);
}

/** Poll `done` through a load-scaled grace, counted in polls. True once it holds. */
export async function settle(done: () => boolean, graceBaseMs: number, pollMs: number = STOP_POLL_MS): Promise<boolean> {
  for (let poll = 0; poll < pollsFor(graceBaseMs, pollMs); poll += 1) {
    if (done()) {
      return true;
    }
    await sleep(pollMs);
  }
  return done();
}

/** {@link settle} for a caller that cannot yield: `wait` blocks for the given milliseconds. */
export function settleSync(done: () => boolean, graceBaseMs: number, wait: (ms: number) => void, pollMs: number = STOP_POLL_MS): boolean {
  for (let poll = 0; poll < pollsFor(graceBaseMs, pollMs); poll += 1) {
    if (done()) {
      return true;
    }
    wait(pollMs);
  }
  return done();
}

/** TERM, wait, KILL, wait. True when `gone` held within a grace; false when the group outlived both. */
export async function escalateStop(stop: StopEscalation): Promise<boolean> {
  const timing = stop.timing ?? REAL_TIMING;
  for (const [index, [signal, grace]] of PHASES.entries()) {
    if (index > 0) {
      stop.onEscalate?.();
    }
    stop.signal(signal);
    if (await settle(stop.gone, timing[grace], timing.pollMs)) {
      return true;
    }
  }
  return false;
}

/** {@link escalateStop} for a caller that cannot yield. */
export function escalateStopSync(stop: StopEscalation, wait: (ms: number) => void): boolean {
  const timing = stop.timing ?? REAL_TIMING;
  for (const [index, [signal, grace]] of PHASES.entries()) {
    if (index > 0) {
      stop.onEscalate?.();
    }
    stop.signal(signal);
    if (settleSync(stop.gone, timing[grace], wait, timing.pollMs)) {
      return true;
    }
  }
  return false;
}
